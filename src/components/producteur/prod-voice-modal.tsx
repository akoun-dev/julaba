'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Mic, MicOff, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useProducteurStore } from '@/lib/stores/producteur-store'
import { parseProdIntent, type ProdIntent } from '@/lib/voice/prodIntent'
import { tataSpeak, tataStop, playBeep, haptic } from '@/lib/voice/tata-tts'
import { isAnySTTAvailable as isSTTAvailable, createSmartSingleShotSTT as createSingleShotSTT, type STTSession } from '@/lib/voice/stt-factory'
import { pauseWakeWord, resumeWakeWord } from '@/lib/voice/wake-word'
import { cn } from '@/lib/utils'
import { classifyProducteurNavigation } from '@/lib/ai/gemma-model'
import { isProducteurNavigationCandidate } from '@/lib/ai/producteur-navigation-intent'

const NAVIGATION_CONFIDENCE_THRESHOLD = 0.75

const PROD_COLOR = '#2E8B57'

/** Display state for the result feedback */
type FeedbackState =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'processing'; text: string }
  | { kind: 'confirm'; intent: ProdIntent; text: string }
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }

/**
 * Producteur's own voice modal — navigation plus récolte declaration,
 * deliberately not a reuse of marchand's VoiceModal (see prodIntent.ts for
 * why: different vocabulary, different routes, no sale/expense/restock
 * concept here).
 */
export function ProdVoiceModal() {
  const { showVoiceModal, closeVoiceModal, navigate, soleilMode, voiceAutoRecord, setVoiceAutoRecord, voiceStopRequested, requestVoiceStop } = useAppStore()
  const [sttAvailable] = useState(() => typeof window !== 'undefined' && isSTTAvailable())
  const sttSessionRef = useRef<STTSession | null>(null)
  const feedbackRef = useRef<FeedbackState>({ kind: 'idle' })
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingStopRef = useRef(false)
  // Pressing the mic again to say "oui"/"non" flips feedbackRef to
  // 'listening' the instant it's pressed — well before any transcript comes
  // back — so by the time processTranscript runs, feedbackRef.current.kind
  // is never still 'confirm'. This ref snapshots which intent is awaiting
  // confirmation independently of that state churn.
  const pendingConfirmRef = useRef<ProdIntent | null>(null)

  const [feedback, setFeedback] = useState<FeedbackState>({ kind: 'idle' })
  const set = useCallback((s: FeedbackState) => {
    feedbackRef.current = s
    setFeedback(s)
  }, [])

  // Pause/resume wake word — this modal can now be opened by saying "Julaba"
  // (see wake-word-manager.tsx), so avoid both listeners fighting for the mic.
  useEffect(() => {
    if (showVoiceModal) pauseWakeWord()
    else resumeWakeWord()
    return () => { resumeWakeWord() }
  }, [showVoiceModal])

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

  const executeIntent = useCallback((intent: ProdIntent) => {
    if (intent.type === 'declare-recolte' && intent.recolte) {
      const { produit, quantiteKg, qualite } = intent.recolte
      useProducteurStore.getState().addRecolte({
        produit,
        quantiteKg,
        qualite,
        dateRecolte: new Date().toISOString().slice(0, 10),
        parcelle: '',
        prixSouhaiteParKg: 0,
        photos: [],
      })
      playBeep('success')
      haptic('success')
      const confirmText = `Récolte de ${quantiteKg} kilos de ${produit.toLowerCase()} enregistrée.`
      tataSpeak(confirmText, () => {
        closeVoiceModal()
        navigate('prod-recoltes')
      })
      set({ kind: 'success', text: confirmText })
      return
    }

    if (intent.targetRoute) {
      playBeep('success')
      haptic('success')
      tataSpeak(intent.responseText, () => {
        closeVoiceModal()
        navigate(intent.targetRoute!)
      })
      set({ kind: 'success', text: intent.responseText })
    }
  }, [set, closeVoiceModal, navigate])

  const processTranscript = useCallback((text: string) => {
    // Awaiting "oui"/"non" after a récolte declaration was read back. Checked
    // via pendingConfirmRef, not feedbackRef.current.kind — pressing the mic
    // to say "oui" already moved that to 'listening' before this runs.
    if (pendingConfirmRef.current) {
      const pending = pendingConfirmRef.current
      pendingConfirmRef.current = null
      const lower = text.toLowerCase()
      if (/^(oui|c'?est (?:ça|ca)|exact|c'?est bon)/i.test(lower)) {
        executeIntent(pending)
        return
      }
      if (/^non/i.test(lower)) {
        tataSpeak("D'accord, j'annule.")
        set({ kind: 'error', text: "D'accord, j'annule." })
        scheduleAutoClose(2000)
        return
      }
      // Anything else while awaiting confirmation: re-parse it as a fresh
      // command rather than getting stuck (e.g. the producteur just moved
      // on to "stock" instead of confirming).
    }

    set({ kind: 'processing', text })

    setTimeout(async () => {
      const intent = parseProdIntent(text)

      if (isProducteurNavigationCandidate(text)) {
        const navigation = await classifyProducteurNavigation(text)
        if (
          navigation.intent === 'navigation' &&
          navigation.targetRoute &&
          navigation.confidence >= NAVIGATION_CONFIDENCE_THRESHOLD
        ) {
          executeIntent({
            type: 'navigation',
            targetRoute: navigation.targetRoute,
            responseText: navigation.targetRoute === 'prod-home'
              ? "J'ouvre l'accueil."
              : navigation.targetRoute === 'prod-recoltes'
                ? "J'ouvre vos récoltes."
                : navigation.targetRoute === 'prod-commandes'
                  ? "J'ouvre vos commandes."
                  : navigation.targetRoute === 'prod-stock'
                    ? "J'ouvre votre stock."
                    : navigation.targetRoute === 'prod-cycles'
                      ? "J'ouvre vos cycles de production."
                      : "J'ouvre votre profil.",
          })
          return
        }
      }

      if (intent.type === 'declare-recolte') {
        // Writes data — always read back and wait for "oui"/"non" first,
        // since a misheard quantity or crop would otherwise log a récolte
        // silently. Same pattern as the marchand voice modal's confirm step.
        playBeep('success')
        haptic('success')
        tataSpeak(intent.responseText)
        pendingConfirmRef.current = intent
        set({ kind: 'confirm', intent, text: intent.responseText })
        return
      }

      if (intent.targetRoute) {
        executeIntent(intent)
      } else {
        playBeep('error')
        haptic('error')
        tataSpeak(intent.responseText)
        set({ kind: 'error', text: intent.responseText })
        scheduleAutoClose(3500)
      }
    }, 300)
  }, [set, scheduleAutoClose, executeIntent])

  const startListening = useCallback(async () => {
    if (feedbackRef.current.kind === 'listening' || !sttAvailable) return

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
        if (feedbackRef.current.kind === 'listening') {
          set({ kind: 'idle' })
        }
      },
    })
    sttSessionRef.current.start()
  }, [sttAvailable, processTranscript, set, scheduleAutoClose])

  const stopListening = useCallback(() => {
    sttSessionRef.current?.stop()
  }, [])

  const toggleListening = useCallback(() => {
    if (feedbackRef.current.kind === 'listening') {
      stopListening()
    } else {
      void startListening()
    }
  }, [startListening, stopListening])

  useEffect(() => {
    if (!voiceStopRequested) return
    requestVoiceStop()
    if (feedbackRef.current.kind === 'listening') {
      sttSessionRef.current?.stop()
    } else {
      pendingStopRef.current = true
    }
  }, [voiceStopRequested, requestVoiceStop])

  useEffect(() => {
    if (!showVoiceModal || !voiceAutoRecord) return
    setVoiceAutoRecord(false)
    if (pendingStopRef.current) {
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

  useEffect(() => {
    if (!showVoiceModal && autoCloseTimer.current) {
      clearTimeout(autoCloseTimer.current)
      autoCloseTimer.current = null
    }
  }, [showVoiceModal])

  if (!showVoiceModal) return null

  const isListening = feedback.kind === 'listening'

  return (
    /* overflow-y-auto + pt/pb safe-area : le contenu reste accessible en
       paysage/petit écran (pattern du voice modal marchand). */
    <div
      className="fixed inset-0 z-[100] flex justify-center overflow-y-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]"
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" />

      <div className="relative flex flex-col items-center gap-8 my-auto" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={handleClose}
          className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white hover:bg-white/30 transition-colors"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center min-h-[80px] flex items-center justify-center animate-in fade-in duration-300 slide-in-from-bottom-2">
          {feedback.kind === 'idle' && (
            <div className="space-y-2">
              <p className="text-white/90 text-lg font-medium">Appuyez pour parler</p>
              <p className="text-white/50 text-sm">&laquo; Mes récoltes &raquo; ou &laquo; j&apos;ai récolté 100 kilos de manioc &raquo;</p>
            </div>
          )}

          {feedback.kind === 'confirm' && (
            <div className="space-y-2">
              <p className="text-white text-lg font-medium">&laquo; {feedback.text} &raquo;</p>
              <p className="text-white/50 text-sm">Dites « oui » pour confirmer, ou « non » pour annuler</p>
            </div>
          )}

          {feedback.kind === 'listening' && (
            <div className="flex items-center gap-3">
              <div className="flex items-end gap-1 h-6">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-1.5 bg-white rounded-full voice-wave-bar" style={{ height: '16px' }} />
                ))}
              </div>
              <p className="text-white text-lg font-medium">J&apos;écoute...</p>
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

        {sttAvailable ? (
          <div className="relative">
            {isListening && (
              <>
                <span className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: `${PROD_COLOR}33`, animationDuration: '1.5s' }} />
                <span className="absolute -inset-4 rounded-full animate-pulse" style={{ backgroundColor: `${PROD_COLOR}1a`, animationDuration: '1s' }} />
                <span className="absolute -inset-8 rounded-full animate-pulse" style={{ backgroundColor: `${PROD_COLOR}0d`, animationDuration: '1.2s', animationDelay: '0.3s' }} />
              </>
            )}
            <button
              onClick={toggleListening}
              aria-label={isListening ? "Appuyez pour envoyer" : "Appuyez pour parler"}
              className={cn(
                'relative w-24 h-24 rounded-full flex items-center justify-center transition-[transform,box-shadow] duration-300 select-none text-white',
                isListening ? 'scale-110 shadow-2xl' : 'bg-white/15 backdrop-blur-sm hover:bg-white/25 active:scale-95 shadow-xl'
              )}
              style={isListening ? { backgroundColor: PROD_COLOR } : undefined}
            >
              {isListening ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
            </button>
          </div>
        ) : (
          <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center">
            <Mic className="w-10 h-10 text-white/30" />
          </div>
        )}

        <p className={cn('text-sm font-medium transition-colors', isListening ? 'text-white' : 'text-white/40', soleilMode && 'text-base')}>
          {isListening ? 'Appuyez pour envoyer' : 'Assistant vocal'}
        </p>
      </div>
    </div>
  )
}
