'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Mic, MicOff, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { useAppStore, type VoiceEntry } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { useStockStore } from '@/lib/stores/stock-store'
import { parseIntent, buildClarifyingIntent, type ParsedIntent } from '@/lib/voice/localIntent'
import { classifyIntentFallback, isConfidentGuess } from '@/lib/voice/nlu-ml'
import { tataSpeak, tataStop, playBeep, haptic } from '@/lib/voice/tata-tts'
import { isAnySTTAvailable as isSTTAvailable, createSmartSingleShotSTT as createSingleShotSTT, type STTSession } from '@/lib/voice/stt-factory'
import { pauseWakeWord, resumeWakeWord } from '@/lib/voice/wake-word'
import { queuePendingSync } from '@/lib/offline-db'
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
  const { showVoiceModal, closeVoiceModal, navigate, soleilMode, addVoiceEntry, voiceAutoRecord, setVoiceAutoRecord, voiceStopRequested, requestVoiceStop } = useAppStore()
  const { addToCart } = useCaisseStore()
  const [sttAvailable] = useState(() => typeof window !== 'undefined' && isSTTAvailable())
  const sttSessionRef = useRef<STTSession | null>(null)
  const feedbackRef = useRef<FeedbackState>({ kind: 'idle' })
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // When bottom bar releases before startListening could run, remember to skip start
  const pendingStopRef = useRef(false)
  // Pressing the mic again to answer "oui"/"non" flips feedbackRef to
  // 'listening' the instant it's pressed — well before any transcript comes
  // back — so by the time processTranscript runs, feedbackRef.current.kind
  // is never still 'confirm'. This ref snapshots which intent is awaiting
  // confirmation independently of that state churn.
  const pendingConfirmRef = useRef<ParsedIntent | null>(null)

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

  // Cleanup STT on unmount
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
      const merchantId = useAppStore.getState().merchantId
      if (!merchantId) {
        tataSpeak('Compte non identifié.')
        set({ kind: 'error', text: 'Compte non identifié.' })
        scheduleAutoClose(3000)
        return
      }
      const category = intent.category || 'autre'
      const description = intent.product || intent.rawTranscript
      const expensePayload = {
        merchantId,
        clientId: `expense-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        amount: intent.amount,
        category,
        description,
        isVoice: true,
        voiceTranscript: intent.rawTranscript,
      }
      fetch('/api/marchand/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expensePayload),
      }).then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
      }).catch(() => {
        queuePendingSync('expense', expensePayload)
      })
      addVoiceEntry({ id: crypto.randomUUID(), transcript: intent.rawTranscript, intent: 'expense', response: 'Dépense enregistrée', timestamp: Date.now() })
      tataSpeak('Dépense enregistrée !')
      set({ kind: 'success', text: 'Dépense enregistrée !' })
      scheduleAutoClose(2500)
    } else if (intent.type === 'restock') {
      const product = intent.product ? useStockStore.getState().getProductByName(intent.product) : undefined
      if (!product) {
        tataSpeak('Produit introuvable dans le stock. Utilisez le formulaire pour un nouveau produit.')
        set({ kind: 'error', text: 'Produit introuvable dans le stock.' })
        scheduleAutoClose(3000)
        return
      }
      const addedQty = intent.quantity || 1
      useStockStore.getState().updateProduct(product.id, { stockQty: product.stockQty + addedQty })
      addVoiceEntry({ id: crypto.randomUUID(), transcript: intent.rawTranscript, intent: 'restock', response: 'Stock mis à jour', timestamp: Date.now() })
      tataSpeak(`Stock de ${product.name} mis à jour !`)
      set({ kind: 'success', text: `Stock de ${product.name} mis à jour !` })
      scheduleAutoClose(2500)
    }
  }, [addToCart, addVoiceEntry, set, scheduleAutoClose])

  const processTranscript = useCallback((text: string) => {
    // If awaiting confirmation \u2014 checked via pendingConfirmRef, not
    // feedbackRef.current.kind \u2014 pressing the mic to answer already moved
    // that to 'listening' before this runs.
    if (pendingConfirmRef.current) {
      const pending = pendingConfirmRef.current
      pendingConfirmRef.current = null
      const lower = text.toLowerCase()
      if (/^(oui|c'?est (?:\u00e7a|ca)|exact|c'?est bon)/i.test(lower)) {
        executeIntent(pending)
        return
      } else if (/^non/i.test(lower)) {
        tataSpeak("D'accord, j'annule.")
        set({ kind: 'error', text: "D'accord, j'annule." })
        scheduleAutoClose(2000)
        return
      }
    }

    set({ kind: 'processing', text })

    setTimeout(async () => {
      let intent = parseIntent(text)

      // Regex parser found nothing at all: try the on-device ML classifier
      // (niveau 2 NLU) to at least steer the user with a targeted follow-up
      // instead of a flat "je n'ai pas compris". Best-effort — any failure
      // (offline, model not cached, WASM unsupported) leaves `intent` as-is.
      if (intent.type === 'unknown' && intent.confidence < 0.6) {
        const guess = await classifyIntentFallback(text)
        if (guess && isConfidentGuess(guess)) {
          intent = buildClarifyingIntent(guess.type, text, guess.confidence)
        }
      }

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
      pendingConfirmRef.current = intent
      set({ kind: 'confirm', intent, text: intent.responseText })
    }, 300)
  }, [executeIntent, set, closeVoiceModal, navigate, scheduleAutoClose])

  const startListening = useCallback(async () => {
    if (feedbackRef.current.kind === 'listening' || !sttAvailable) return

    // Cancel pending auto-close
    if (autoCloseTimer.current) { clearTimeout(autoCloseTimer.current); autoCloseTimer.current = null }

    tataStop()
    set({ kind: 'listening' })
    playBeep('start')

    sttSessionRef.current = await createSingleShotSTT({
      onResult: (result) => {
        playBeep('stop')
        processTranscript(result.transcript)
      },
      onError: (err) => {
        if (err === 'no-speech') {
          tataSpeak("Je n'ai rien entendu. Réessayez.")
          set({ kind: 'error', text: "Je n'ai rien entendu. Réessayez." })
        } else if (err === 'aborted') {
          return
        } else {
          playBeep('error')
          const msg = err === 'not-allowed'
            ? 'Micro non autorisé.'
            : err === 'audio-capture'
              ? 'Aucun micro détecté.'
              : "Je n'ai pas bien entendu. Réessayez."
          tataSpeak(msg)
          set({ kind: 'error', text: msg })
        }
        scheduleAutoClose(2500)
      },
      onEnd: () => {
        // If STT ends while still in listening state (no speech detected),
        // reset to idle so user can try again
        if (feedbackRef.current.kind === 'listening') {
          set({ kind: 'idle' })
        }
      },
    })
    sttSessionRef.current.start()
  }, [sttAvailable, processTranscript, set, scheduleAutoClose])

  const stopListening = useCallback(() => {
    sttSessionRef.current?.stop()
    // State is updated either by onResult → processTranscript or by onEnd → idle
  }, [])

  // --- Bottom bar PTT signal handling ---
  // ORDER MATTERS: stop effect declared BEFORE start effect so it runs first

  // 1) Consume stop signal from bottom bar release
  useEffect(() => {
    if (!voiceStopRequested) return
    requestVoiceStop() // consume the signal
    if (feedbackRef.current.kind === 'listening') {
      // Already recording — stop it
      sttSessionRef.current?.stop()
    } else {
      // Recording hasn't started yet (too-fast release) — mark pending
      pendingStopRef.current = true
    }
  }, [voiceStopRequested, requestVoiceStop])

  // 2) Consume start signal from bottom bar press
  useEffect(() => {
    if (!showVoiceModal || !voiceAutoRecord) return
    setVoiceAutoRecord(false)
    if (pendingStopRef.current) {
      // Bottom bar already released — don't start, just show idle overlay
      pendingStopRef.current = false
      return
    }
    const id = requestAnimationFrame(() => startListening())
    return () => cancelAnimationFrame(id)
    // voiceAutoRecord deliberately left out of the dependency array: this
    // effect flips it to false one line above, and depending on it here
    // would make React re-run the effect the instant that happens — that
    // re-run's cleanup cancels the RAF before it ever fires, so a
    // press-and-hold or a "Julaba" wake-word detection would open the
    // modal but never actually start listening (the modal just sits idle).
  }, [showVoiceModal, setVoiceAutoRecord, startListening])

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

  const isListening = feedback.kind === 'listening'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={handleClose}
    >
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" />

      {/* Centered floating content */}
      <div
        className="relative flex flex-col items-center gap-8 px-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white hover:bg-white/30 transition-colors"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Feedback text */}
        <div className="text-center min-h-[80px] flex items-center justify-center animate-in fade-in duration-300 slide-in-from-bottom-2">
          {feedback.kind === 'idle' && (
            <div className="space-y-2">
              <p className="text-white/90 text-lg font-medium">Maintenez pour parler</p>
              <p className="text-white/50 text-sm">&laquo; Tomates deux mille &raquo;</p>
            </div>
          )}

          {feedback.kind === 'listening' && (
            <div className="flex items-center gap-3">
              <div className="flex items-end gap-1 h-6">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-1.5 bg-white rounded-full voice-wave-bar" style={{ height: '16px' }} />
                ))}
              </div>
              <p className="text-white text-lg font-medium">J'écoute...</p>
            </div>
          )}

          {feedback.kind === 'processing' && (
            <div className="flex items-center gap-2">
              <div className="flex items-end gap-1 h-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1 bg-white/50 rounded-full voice-wave-bar" style={{ height: '12px' }} />
                ))}
              </div>
              <p className="text-white/70 text-sm">&laquo; {feedback.text} &raquo;</p>
            </div>
          )}

          {feedback.kind === 'confirm' && (
            <div className="space-y-3 max-w-xs">
              <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-5 py-3">
                <p className="text-white text-sm font-medium">{feedback.text}</p>
              </div>
              <p className="text-white/50 text-xs">
                Maintenez pour confirmer (oui) ou annuler (non)
              </p>
            </div>
          )}

          {feedback.kind === 'success' && (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
              <p className="text-green-300 text-lg font-medium">{feedback.text}</p>
            </div>
          )}

          {feedback.kind === 'error' && (
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-amber-400 shrink-0" />
              <p className="text-amber-300 text-lg font-medium">{feedback.text}</p>
            </div>
          )}
        </div>

        {/* PTT Button (for re-recording in confirmation/idle states) */}
        {sttAvailable ? (
          <div className="relative">
            {isListening && (
              <>
                <span className="absolute inset-0 rounded-full bg-[#C66A2C]/20 animate-ping" style={{ animationDuration: '1.5s' }} />
                <span className="absolute -inset-4 rounded-full bg-[#C66A2C]/10 animate-pulse" style={{ animationDuration: '1s' }} />
                <span className="absolute -inset-8 rounded-full bg-[#C66A2C]/5 animate-pulse" style={{ animationDuration: '1.2s', animationDelay: '0.3s' }} />
              </>
            )}
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              className={cn(
                'relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 select-none',
                isListening
                  ? 'bg-[#C66A2C] text-white scale-110 shadow-2xl shadow-[#C66A2C]/40'
                  : 'bg-white/15 backdrop-blur-sm text-white hover:bg-white/25 active:scale-95 shadow-xl'
              )}
            >
              {isListening
                ? <MicOff className="w-10 h-10" />
                : <Mic className="w-10 h-10" />
              }
            </button>
          </div>
        ) : (
          <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center">
            <Mic className="w-10 h-10 text-white/30" />
          </div>
        )}

        {/* Bottom label */}
        <p className={cn(
          'text-sm font-medium transition-colors',
          isListening ? 'text-white' : 'text-white/40',
          soleilMode && 'text-base'
        )}>
          {isListening ? 'Relâchez pour envoyer' : 'Tata Nanti Lou'}
        </p>
      </div>
    </div>
  )
}
