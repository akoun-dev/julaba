'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Mic, MicOff, Volume2, X, Radio, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAppStore, type VoiceEntry } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { useStockStore } from '@/lib/stores/stock-store'
import { parseIntent, type ParsedIntent } from '@/lib/voice/localIntent'
import { tataSpeak, tataStop, playBeep, haptic } from '@/lib/voice/tata-tts'
import { isSTTAvailable, createSingleShotSTT, type STTSession } from '@/lib/voice/stt'
import { pauseWakeWord, resumeWakeWord } from '@/lib/voice/wake-word'
import { cn } from '@/lib/utils'

/** Display state for the result feedback */
type FeedbackState =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'processing'; text: string }
  | { kind: 'confirm'; intent: ParsedIntent; text: string }
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }

export function VoiceModal() {
  const { showVoiceModal, closeVoiceModal, navigate, soleilMode, addVoiceEntry } = useAppStore()
  const { addToCart } = useCaisseStore()
  const [sttAvailable] = useState(() => typeof window !== 'undefined' && isSTTAvailable())
  const sttSessionRef = useRef<STTSession | null>(null)
  const feedbackRef = useRef<FeedbackState>({ kind: 'idle' })
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reactive copy for rendering
  const [feedback, setFeedback] = useState<FeedbackState>({ kind: 'idle' })
  const set = useCallback((s: FeedbackState) => {
    feedbackRef.current = s
    setFeedback(s)
  }, [])
  // Pause/resume wake word
  useEffect(() => {
    if (showVoiceModal) pauseWakeWord()
    else resumeWakeWord()
    return () => { resumeWakeWord() }
  }, [showVoiceModal])

  // Cleanup
  useEffect(() => {
    return () => { sttSessionRef.current?.abort() }
  }, [])

  const scheduleAutoClose = useCallback((delay = 2000) => {
    if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current)
    autoCloseTimer.current = setTimeout(() => {
      sttSessionRef.current?.abort()
      closeVoiceModal()
    }, delay)
  }, [closeVoiceModal])

  const executeIntent = useCallback((intent: ParsedIntent) => {
    playBeep('success')
    haptic('success')

    if (intent.type === 'sale' && intent.amount && intent.product) {
      const product = useStockStore.getState().getProductByName(intent.product)
      addToCart({
        name: intent.product,
        quantity: intent.quantity || 1,
        unitPrice: product?.priceUnit || Math.floor(intent.amount / (intent.quantity || 1)),
        productId: product?.id,
      })
      addVoiceEntry({ id: crypto.randomUUID(), transcript: intent.rawTranscript, intent: 'sale', response: 'Vente enregistrée', timestamp: Date.now() })
      tataSpeak('Vente enregistrée !')
      set({ kind: 'success', text: 'Vente enregistrée !' })
      scheduleAutoClose(2500)
    } else if (intent.type === 'sale' && intent.amount) {
      addToCart({ name: intent.product || 'Article', quantity: intent.quantity || 1, unitPrice: intent.amount })
      tataSpeak('Vente enregistrée !')
      set({ kind: 'success', text: 'Vente enregistrée !' })
      scheduleAutoClose(2500)
    } else if (intent.type === 'expense' && intent.amount) {
      tataSpeak('Dépense enregistrée !')
      set({ kind: 'success', text: 'Dépense enregistrée !' })
      scheduleAutoClose(2500)
    } else if (intent.type === 'restock') {
      tataSpeak('Stock mis à jour !')
      set({ kind: 'success', text: 'Stock mis à jour !' })
      scheduleAutoClose(2500)
    }
  }, [addToCart, addVoiceEntry, set, scheduleAutoClose])

  const processTranscript = useCallback((text: string) => {
    // If awaiting confirmation
    if (feedbackRef.current.kind === 'confirm') {
      const lower = text.toLowerCase()
      if (/^(oui|c'?est (?:\u00e7a|ca)|exact|c'?est bon)/i.test(lower)) {
        executeIntent(feedbackRef.current.intent)
        return
      } else if (/^non/i.test(lower)) {
        tataSpeak("D'accord, j'annule.")
        set({ kind: 'error', text: "D'accord, j'annule." })
        scheduleAutoClose(2000)
        return
      }
    }

    set({ kind: 'processing', text })

    // Small delay so user sees "processing" before the response
    setTimeout(() => {
      const intent = parseIntent(text)

      if (intent.type === 'navigation' && intent.targetRoute) {
        tataSpeak(intent.responseText, () => {
          closeVoiceModal()
          navigate(intent.targetRoute! as ReturnType<typeof useAppStore.getState>['currentScreen'])
        })
        set({ kind: 'success', text: intent.responseText })
        return
      }

      if (intent.type === 'credit_block' || intent.type === 'unknown' || intent.type === 'cancel') {
        tataSpeak(intent.responseText)
        set({ kind: 'error', text: intent.responseText })
        scheduleAutoClose(3000)
        return
      }

      // Sale / expense / restock need confirmation
      tataSpeak(intent.responseText)
      set({ kind: 'confirm', intent, text: intent.responseText })
    }, 300)
  }, [executeIntent, set, closeVoiceModal, navigate, scheduleAutoClose])

  const stopListening = useCallback(() => {
    sttSessionRef.current?.stop()
    set({ kind: 'idle' })
  }, [set])

  const startListening = useCallback(() => {
    if (feedbackRef.current.kind === 'listening' || !sttAvailable) return

    // Cancel pending auto-close
    if (autoCloseTimer.current) { clearTimeout(autoCloseTimer.current); autoCloseTimer.current = null }

    tataStop()
    set({ kind: 'listening' })
    playBeep('start')

    sttSessionRef.current = createSingleShotSTT({
      onResult: (result) => {
        playBeep('stop')
        processTranscript(result.transcript)
      },
      onError: () => {
        playBeep('error')
        tataSpeak("Je n'ai pas bien entendu. Réessayez.")
        set({ kind: 'error', text: "Je n'ai pas bien entendu. Réessayez." })
        scheduleAutoClose(2500)
      },
    })
    sttSessionRef.current.start()
  }, [sttAvailable, processTranscript, set, scheduleAutoClose])

  const handleClose = () => {
    if (autoCloseTimer.current) { clearTimeout(autoCloseTimer.current); autoCloseTimer.current = null }
    sttSessionRef.current?.abort()
    tataStop()
    closeVoiceModal()
  }

  // Cancel pending auto-close when modal closes
  useEffect(() => {
    if (!showVoiceModal && autoCloseTimer.current) {
      clearTimeout(autoCloseTimer.current)
      autoCloseTimer.current = null
    }
  }, [showVoiceModal])

  if (!showVoiceModal) return null

  const textClass = soleilMode ? 'text-black' : ''

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" />

      {/* Bottom Sheet */}
      <div
        className="relative w-full max-w-lg bg-background rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#C66A2C] flex items-center justify-center">
              <Volume2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className={cn('font-semibold text-base', textClass)}>Tata Nanti Lou</h2>
              <p className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm')}>Votre assistante vocale</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
            aria-label="Fermer"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Feedback area */}
        <div className="px-5 min-h-[72px] flex items-center">
          {feedback.kind === 'idle' && (
            <p className={cn('text-sm text-muted-foreground text-center w-full', textClass, soleilMode && 'text-base')}>
              Maintenez le bouton pour parler.{' '}
              <span className="text-muted-foreground/60">Dites &laquo; Tomates deux mille &raquo;</span>
            </p>
          )}

          {feedback.kind === 'listening' && (
            <div className="flex items-center gap-3 w-full justify-center">
              <div className="flex items-end gap-1 h-6">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-1.5 bg-[#C66A2C] rounded-full voice-wave-bar" style={{ height: '16px' }} />
                ))}
              </div>
              <p className={cn('text-sm font-medium text-[#C66A2C]', soleilMode && 'text-base')}>J'écoute...</p>
            </div>
          )}

          {feedback.kind === 'processing' && (
            <div className="flex items-center gap-2 w-full justify-center">
              <div className="flex items-end gap-1 h-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1 bg-muted-foreground/40 rounded-full voice-wave-bar" style={{ height: '12px' }} />
                ))}
              </div>
              <p className={cn('text-sm text-muted-foreground', textClass)}>
                &laquo; {feedback.text} &raquo;
              </p>
            </div>
          )}

          {feedback.kind === 'confirm' && (
            <div className="w-full space-y-2">
              <div className="bg-muted rounded-xl px-4 py-2.5">
                <p className={cn('text-sm', textClass)}>{feedback.text}</p>
              </div>
              <p className={cn('text-xs text-center text-muted-foreground', soleilMode && 'text-sm')}>
                Maintenez pour confirmer (oui) ou annuler (non)
              </p>
            </div>
          )}

          {feedback.kind === 'success' && (
            <div className="flex items-center gap-3 w-full justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <p className={cn('text-sm font-medium text-green-700', soleilMode && 'text-base')}>{feedback.text}</p>
            </div>
          )}

          {feedback.kind === 'error' && (
            <div className="flex items-center gap-3 w-full justify-center">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
              <p className={cn('text-sm text-amber-700', soleilMode && 'text-base')}>{feedback.text}</p>
            </div>
          )}
        </div>

        {/* PTT Button */}
        <div className="flex flex-col items-center gap-2 pt-2 pb-4">
          {sttAvailable ? (
            <>
              <button
                onMouseDown={startListening}
                onMouseUp={stopListening}
                onTouchStart={startListening}
                onTouchEnd={stopListening}
                className={cn(
                  'relative w-20 h-20 rounded-full flex items-center justify-center transition-all touch-target select-none',
                  feedback.kind === 'listening'
                    ? 'bg-[#C66A2C] text-white scale-110 shadow-xl shadow-[#C66A2C]/30 ptt-active'
                    : 'bg-[#C66A2C]/10 text-[#C66A2C] hover:bg-[#C66A2C]/20 active:scale-95'
                )}
              >
                {feedback.kind === 'listening'
                  ? <MicOff className="w-8 h-8" />
                  : <Mic className="w-8 h-8" />
                }
                {/* Ripple rings when listening */}
                {feedback.kind === 'listening' && (
                  <>
                    <span className="absolute inset-0 rounded-full border-2 border-[#C66A2C]/40 animate-ping" />
                    <span className="absolute -inset-2 rounded-full border border-[#C66A2C]/20 animate-pulse" />
                  </>
                )}
              </button>
              <p className={cn(
                'text-xs font-medium',
                feedback.kind === 'listening' ? 'text-[#C66A2C]' : 'text-muted-foreground',
                soleilMode && 'text-sm'
              )}>
                {feedback.kind === 'listening' ? 'Relâchez pour envoyer' : 'Maintenez pour parler'}
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-2">
              <Radio className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground text-center">
                Voix non disponible dans ce navigateur
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
