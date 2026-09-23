'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Mic, MicOff, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useProducteurStore } from '@/lib/stores/producteur-store'
import { parseProdIntent, type ProdIntent } from '@/lib/voice/prodIntent'
import { tataStop, playBeep, haptic } from '@/lib/voice/tata-tts'
// B5-051 — chaîne baoulé via la FAÇADE unifiée BaouleVoiceEngine :
// speakBaoule (traduit fra→bci en session baoulé, repli français explicite),
// prepareBaouleParserInput (traduction bci→fr obligatoire — garde B2-022).
import { canAttemptSTT, describeSTTError, createSmartSingleShotSTT, type STTSession } from '@/lib/voice/stt-factory'
import { beginVoiceRoundtrip } from '@/lib/voice/voice-perf'
import { VoiceLanguageSelector } from '@/components/voice/language-selector'
import { pauseWakeWord, resumeWakeWord } from '@/lib/voice/wake-word'
import { cn } from '@/lib/utils'
import { classifyProducteurNavigation } from '@/lib/ai/gemma-model'
import { isProducteurNavigationCandidate, PRODUCTEUR_NAVIGATION_CONFIDENCE_THRESHOLD } from '@/lib/ai/producteur-navigation-intent'
import { speakBaoule, prepareBaouleParserInput, describeBaouleEngineError } from '@/lib/voice/baoule-engine'
import { parseConfirmation } from '@/lib/voice/confirmations'
// UI-MP-003 — vraie boîte de dialogue Radix (rôle, aria-modal, piège de
// focus, Échap, restitution du focus).
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

const NAVIGATION_CONFIDENCE_THRESHOLD = PRODUCTEUR_NAVIGATION_CONFIDENCE_THRESHOLD


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
  const { showVoiceModal, closeVoiceModal, navigate, soleilMode, voiceAutoRecord, setVoiceAutoRecord, consumePendingVoiceCommand, voiceStopRequested, requestVoiceStop } = useAppStore()
  const [sttAvailable] = useState(() => typeof window !== 'undefined' && canAttemptSTT())
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
  // Cleanup : ne reprendre le wake word QUE si la modale ÉTAIT ouverte —
  // ce cleanup s'exécute AUSSI à l'OUVERTURE (transition false→true) et un
  // resume inconditionnel y créait un start de fond concurrençant la pause
  // (audit mot de réveil F1 ; même motif que vente-rapide-modal VOCAL-604).
  useEffect(() => {
    if (showVoiceModal) pauseWakeWord()
    else resumeWakeWord()
    return () => { if (showVoiceModal) resumeWakeWord() }
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
      void speakBaoule(confirmText, () => {
        closeVoiceModal()
        navigate('prod-recoltes')
      })
      set({ kind: 'success', text: confirmText })
      return
    }

    if (intent.targetRoute) {
      playBeep('success')
      haptic('success')
      void speakBaoule(intent.responseText, () => {
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
      // B4-041 — confirmations bilingues fr + bci (liste pilote) : null =
      // hors vocabulaire → re-parse comme commande fraîche (comportement
      // historique conservé).
      const confirmed = parseConfirmation(text)
      if (confirmed === 'yes') {
        executeIntent(pending)
        return
      }
      if (confirmed === 'no') {
        void speakBaoule("D'accord, j'annule.")
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
        void speakBaoule(intent.responseText)
        pendingConfirmRef.current = intent
        set({ kind: 'confirm', intent, text: intent.responseText })
        return
      }

      if (intent.targetRoute) {
        executeIntent(intent)
      } else {
        playBeep('error')
        haptic('error')
        void speakBaoule(intent.responseText)
        set({ kind: 'error', text: intent.responseText })
        scheduleAutoClose(3500)
      }
    }, 300)
  }, [set, scheduleAutoClose, executeIntent])

  // B5-051 — lien montant via la façade : traduction bci→fr obligatoire en
  // session baoulé (garde B2-022) ; échec → erreur explicite, chaîne arrêtée
  // avant parseProdIntent (jamais de baoulé brut au parseur).
  const handleTranscript = useCallback(async (raw: string) => {
    set({ kind: 'processing', text: raw })
    try {
      const input = await prepareBaouleParserInput(raw)
      processTranscript(input.text)
    } catch (err) {
      playBeep('error')
      const msg = describeBaouleEngineError(err)
      set({ kind: 'error', text: msg })
      void speakBaoule(msg)
      scheduleAutoClose(4000)
    }
  }, [processTranscript, set, scheduleAutoClose])

  const startListening = useCallback(async () => {
    if (feedbackRef.current.kind === 'listening' || !sttAvailable) return

    if (autoCloseTimer.current) { clearTimeout(autoCloseTimer.current); autoCloseTimer.current = null }

    tataStop()
    set({ kind: 'listening' })
    playBeep('start')

    sttSessionRef.current = await createSmartSingleShotSTT({
      onStatus: (status) => {
        if (status === 'preparing') set({ kind: 'processing', text: 'Je prépare la voix...' })
        if (status === 'listening') set({ kind: 'listening' })
      },
      onResult: (result) => {
        playBeep('stop')
        // I-05 — T0 : réception du transcript final. T1 est posé dans
        // narrateResponse (début de la synthèse, traduction NLLB incluse)
        // qui émet le roundtrip_ms.
        beginVoiceRoundtrip('prod-voice-modal')
        void handleTranscript(result.transcript)
      },
      onError: (err) => {
        if (err === 'aborted') return
        if (err === 'no-speech') {
          void speakBaoule("Je n'ai rien entendu. Réessayez.")
          set({ kind: 'error', text: "Je n'ai rien entendu. Réessayez." })
        } else {
          playBeep('error')
          // Cas « réseau » explicite (audit P1) ; autres codes → messages
          // dédiés, messages déjà formulés (VoiceService, Baoulé…) → tels
          // quels (Task 32).
          const msg = describeSTTError(err)
          void speakBaoule(msg)
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
  }, [sttAvailable, handleTranscript, set, scheduleAutoClose])

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
    const pendingCommand = consumePendingVoiceCommand()
    setVoiceAutoRecord(false)
    if (pendingCommand) {
      void handleTranscript(pendingCommand)
      return
    }
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
  }, [showVoiceModal, setVoiceAutoRecord, consumePendingVoiceCommand, handleTranscript, startListening])

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
    <Dialog open onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent
        aria-describedby={undefined}
        className="w-auto max-w-none overflow-visible bg-transparent border-0 shadow-none rounded-none p-0 gap-0 [&>button:last-of-type]:hidden"
      >
      <DialogTitle className="sr-only">Assistant vocal producteur</DialogTitle>

      <div className="relative w-full max-w-sm animate-in fade-in duration-200 slide-in-from-bottom-4">
        <button
          onClick={handleClose}
          className="absolute -right-2 -top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/30 hover:text-white"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative flex w-full flex-col items-center gap-6 px-2 text-center sm:gap-8">
        <div className={cn(
          'mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full shadow-md transition-all duration-300',
          isListening
            ? 'bg-[var(--vl-prod)] shadow-[var(--vl-prod-shadow)] ring-4 ring-[var(--vl-prod-ring)] animate-pulse'
            : 'bg-white/10 shadow-none'
        )}>
          <img src="/icon-only.png" alt="Tata" className="h-12 w-12 object-contain" />
        </div>

        <div className="min-h-[80px] flex items-center justify-center animate-in fade-in duration-300 slide-in-from-bottom-2" role="status" aria-live="polite">
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
                  <div key={i} className="w-1.5 bg-[var(--vl-prod)] rounded-full voice-wave-bar" style={{ height: '16px' }} />
                ))}
              </div>
              <p className="text-white text-lg font-medium">J&apos;écoute...</p>
            </div>
          )}

          {feedback.kind === 'processing' && (
            <div className="flex items-center gap-2">
              <div className="flex items-end gap-1 h-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1 bg-[var(--vl-prod)]/50 rounded-full voice-wave-bar" style={{ height: '12px' }} />
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
            {/* Signature d'écoute unifiée (style vente rapide) : orange vif
                qui pulse avec halo ring-4 — mêmes classes que le marchand. */}
            <button
              onClick={toggleListening}
              aria-label={isListening ? "Appuyez pour envoyer" : "Appuyez pour parler"}
              className={cn(
                'relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 select-none text-white',
                isListening
                  ? 'bg-[var(--vl-prod)] shadow-lg shadow-[var(--vl-prod-shadow)] ring-4 ring-[var(--vl-prod-ring)] animate-pulse'
                  : 'bg-white/15 backdrop-blur-sm hover:bg-white/25 active:scale-95 shadow-xl'
              )}
            >
              {isListening ? <MicOff className="w-10 h-10 animate-pulse" /> : <Mic className="w-10 h-10" />}
            </button>
          </div>
        ) : (
          <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center">
            <Mic className="w-10 h-10 text-white/30" />
          </div>
        )}

        <p className={cn('mt-5 text-sm font-medium transition-colors', isListening ? 'text-white' : 'text-white/40', soleilMode && 'text-base')}>
          {isListening ? 'Appuyez pour envoyer' : 'Assistant vocal'}
        </p>

        {/* Task 32 — langue de reconnaissance (Français / Baoulé β) */}
        <VoiceLanguageSelector />
        </div>
      </div>
      </DialogContent>
    </Dialog>
  )
}
