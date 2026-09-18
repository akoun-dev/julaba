'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { useStockStore } from '@/lib/stores/stock-store'
import { parseIntent, buildClarifyingIntent, formatFCFA, type ParsedIntent } from '@/lib/voice/localIntent'
import { classifyIntentFallback, isConfidentGuess } from '@/lib/voice/nlu-ml'
import { tataStop, playBeep, haptic } from '@/lib/voice/tata-tts'
// B4-040 — orchestrateur conversation bci→fr→IA→fr→bci : tout texte narré
// passe par narrateResponse (traduit fra→bci en session baoulé, repli
// français explicite) et tout transcript passe par resolveConversationInput
// (traduction bci→fr obligatoire — garde B2-022, jamais de baoulé brut au
// parseur français).
import { canAttemptSTT, describeSTTError, createSmartSingleShotSTT, type STTSession } from '@/lib/voice/stt-factory'
import { VoiceLanguageSelector } from '@/components/voice/language-selector'
import { pauseWakeWord, resumeWakeWord } from '@/lib/voice/wake-word'
import { queuePendingSync } from '@/lib/offline-db'
import { completeQuickSale } from '@/lib/quick-sale'
import { findCatalogEntry, catalogSummaryText } from '@/lib/supplier-catalog'
import { cn } from '@/lib/utils'
import { classifyNavigation } from '@/lib/ai/gemma-model'
import { isNavigationCandidate, NAVIGATION_CONFIDENCE_THRESHOLD } from '@/lib/ai/navigation-intent'
import { narrateResponse, resolveConversationInput, describeConversationError } from '@/lib/voice/conversation'

/** Display state for the result feedback */
type FeedbackState =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'processing'; text: string }
  | { kind: 'confirm'; intent: ParsedIntent; text: string }
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }

export function VoiceModal() {
  const { showVoiceModal, closeVoiceModal, navigate, goBack, soleilMode, voiceAutoRecord, setVoiceAutoRecord, voiceStopRequested, requestVoiceStop, voiceConfirmation } = useAppStore()
  const [sttAvailable] = useState(() => typeof window !== 'undefined' && canAttemptSTT())
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

  const executeIntent = useCallback(async (intent: ParsedIntent) => {
    playBeep('success')
    haptic('success')

    if (intent.type === 'sale' && intent.amount && intent.product) {
      const product = useStockStore.getState().getProductByName(intent.product)
      const unitPrice = product?.priceUnit || Math.floor(intent.amount / (intent.quantity || 1))
      const result = await completeQuickSale({
        name: intent.product,
        quantity: intent.quantity || 1,
        unitPrice,
        productId: product?.id,
      })
      if (!result.ok) {
        void narrateResponse('Vente non enregistrée. Réessayez.')
        set({ kind: 'error', text: 'Vente non enregistrée.' })
        scheduleAutoClose(3000)
        return
      }
      void narrateResponse(result.synced ? 'Vente enregistrée !' : 'Vente enregistrée, en attente de synchronisation.')
      set({ kind: 'success', text: 'Vente enregistrée !' })
      scheduleAutoClose(2500)
    } else if (intent.type === 'sale' && intent.amount) {
      const result = await completeQuickSale({
        name: intent.product || 'Article',
        quantity: intent.quantity || 1,
        unitPrice: intent.amount,
      })
      if (!result.ok) {
        void narrateResponse('Vente non enregistrée. Réessayez.')
        set({ kind: 'error', text: 'Vente non enregistrée.' })
        scheduleAutoClose(3000)
        return
      }
      void narrateResponse(result.synced ? 'Vente enregistrée !' : 'Vente enregistrée, en attente de synchronisation.')
      set({ kind: 'success', text: 'Vente enregistrée !' })
      scheduleAutoClose(2500)
    } else if (intent.type === 'expense' && intent.amount) {
      const merchantId = useAppStore.getState().merchantId
      if (!merchantId) {
        void narrateResponse('Compte non identifié.')
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
      try {
        const res = await fetch('/api/marchand/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(expensePayload),
        })
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
      } catch {
        const queued = await queuePendingSync('expense', expensePayload)
        if (!queued.ok) {
          // Neither the live request nor the offline queue worked — the
          // expense genuinely was not recorded. Say so instead of the usual
          // success line.
          void narrateResponse('Dépense non enregistrée. Réessayez.')
          set({ kind: 'error', text: 'Dépense non enregistrée.' })
          scheduleAutoClose(3000)
          return
        }
      }
      useCaisseStore.getState().addTodayExpense(intent.amount)
      void narrateResponse('Dépense enregistrée !')
      set({ kind: 'success', text: 'Dépense enregistrée !' })
      scheduleAutoClose(2500)
    } else if (intent.type === 'restock') {
      const product = intent.product ? useStockStore.getState().getProductByName(intent.product) : undefined
      if (!product) {
        void narrateResponse('Produit introuvable dans le stock. Utilisez le formulaire pour un nouveau produit.')
        set({ kind: 'error', text: 'Produit introuvable dans le stock.' })
        scheduleAutoClose(3000)
        return
      }
      const addedQty = intent.quantity || 1
      useStockStore.getState().updateProduct(product.id, { stockQty: product.stockQty + addedQty })
      void narrateResponse(`Stock de ${product.name} mis à jour !`)
      set({ kind: 'success', text: `Stock de ${product.name} mis à jour !` })
      scheduleAutoClose(2500)
    } else if (intent.type === 'order') {
      // Commande fournisseur à la voix — même contrat que l'écran Marché :
      // total et prix viennent du catalogue partagé (jamais du client),
      // création queue-safe offline (rejeu idempotent sur clientId).
      const merchantId = useAppStore.getState().merchantId
      if (!merchantId) {
        void narrateResponse('Compte non identifié.')
        set({ kind: 'error', text: 'Compte non identifié.' })
        scheduleAutoClose(3000)
        return
      }
      // Re-résolution depuis le transcript : le prix unitaire officiel ne
      // peut pas venir d'un intent reconstruit, uniquement du catalogue.
      const catalogEntry = findCatalogEntry(intent.rawTranscript)
      if (!catalogEntry) {
        const msg = `Je ne trouve pas ce produit au marché. Produits disponibles : ${catalogSummaryText()}.`
        void narrateResponse(msg)
        set({ kind: 'error', text: 'Produit indisponible au marché.' })
        scheduleAutoClose(4500)
        return
      }
      const orderPayload = {
        merchantId,
        supplier: catalogEntry.supplier,
        productName: catalogEntry.name,
        quantity: intent.quantity || 1,
        unitPrice: catalogEntry.price,
        note: 'Commande vocale Tata',
        clientId: `sorder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }
      let queuedInstead = false
      try {
        const res = await fetch('/api/marchand/supplier-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload),
        })
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
      } catch {
        // Hors ligne : pure création (aucun solde, aucun état serveur à
        // dériver) — même règle que le bouton « Commander » de l'écran Marché.
        const queued = await queuePendingSync('supplier-order', orderPayload)
        if (!queued.ok) {
          void narrateResponse('Commande non enregistrée. Réessayez.')
          set({ kind: 'error', text: 'Commande non enregistrée.' })
          scheduleAutoClose(3000)
          return
        }
        queuedInstead = true
      }
      const total = orderPayload.quantity * catalogEntry.price
      const successText = queuedInstead
        ? 'Commande en attente de synchronisation.'
        : `Commande envoyée chez ${catalogEntry.supplier}. Total ${formatFCFA(total)}.`
      void narrateResponse(
        queuedInstead
          ? `Commande de ${catalogEntry.name} enregistrée, en attente de synchronisation.`
          : `Commande envoyée chez ${catalogEntry.supplier}. Total ${formatFCFA(total)}.`,
      )
      set({ kind: 'success', text: successText })
      scheduleAutoClose(3000)
    }
  }, [set, scheduleAutoClose])

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
        void narrateResponse("D'accord, j'annule.")
        set({ kind: 'error', text: "D'accord, j'annule." })
        scheduleAutoClose(2000)
        return
      }
    }

    set({ kind: 'processing', text })

    setTimeout(async () => {
      // Business intent always remains local. Gemma only receives clear screen
      // or consultation requests, and failure is intentionally silent.
      let intent = parseIntent(text)

      if (isNavigationCandidate(text)) {
        set({ kind: 'processing', text })
        const navigation = await classifyNavigation(text)
        if (
          navigation.intent === 'navigation' &&
          navigation.targetRoute &&
          navigation.confidence >= NAVIGATION_CONFIDENCE_THRESHOLD
        ) {
          const responseText = `J'ouvre ${navigation.targetRoute === 'keiwa' ? 'votre portefeuille' : `votre écran ${navigation.targetRoute}`}.`
          void narrateResponse(responseText, () => {
            closeVoiceModal()
            navigate(navigation.targetRoute!)
          })
          haptic('success')
          set({ kind: 'success', text: responseText })
          return
        }
      }

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
        void narrateResponse(intent.responseText, () => {
          closeVoiceModal()
          navigate(intent.targetRoute! as ReturnType<typeof useAppStore.getState>['currentScreen'])
        })
        set({ kind: 'success', text: intent.responseText })
        return
      }

      if (intent.type === 'back') {
        void narrateResponse(intent.responseText, () => {
          closeVoiceModal()
          goBack()
        })
        set({ kind: 'success', text: intent.responseText })
        return
      }

      if (intent.type === 'credit_block' || intent.type === 'unknown' || intent.type === 'consultation' || intent.type === 'cancel') {
        void narrateResponse(intent.responseText)
        set({ kind: 'error', text: intent.responseText })
        scheduleAutoClose(3000)
        return
      }

      // Sale / expense / restock — check voiceConfirmation preference
      const shouldConfirm =
        voiceConfirmation === 'always' ||
        (voiceConfirmation === 'high-amount' && (intent.amount || 0) > 10000)

      if (shouldConfirm) {
        void narrateResponse(intent.responseText)
        pendingConfirmRef.current = intent
        set({ kind: 'confirm', intent, text: intent.responseText })
      } else {
        void executeIntent(intent)
      }
    }, 300)
  }, [executeIntent, set, closeVoiceModal, navigate, scheduleAutoClose, voiceConfirmation])

  // B4-040 — lien montant de la chaîne : le transcript brut passe par
  // l'orchestrateur AVANT le parseur. En session baoulé, la traduction
  // bci→fr est obligatoire (garde B2-022) : si elle échoue, la chaîne
  // s'arrête ici avec une erreur explicite — jamais de baoulé brut au
  // parseur français, jamais de repli silencieux.
  const handleTranscript = useCallback(async (raw: string) => {
    set({ kind: 'processing', text: raw })
    try {
      const input = await resolveConversationInput(raw)
      processTranscript(input.text)
    } catch (err) {
      playBeep('error')
      const msg = describeConversationError(err)
      set({ kind: 'error', text: msg })
      void narrateResponse(msg)
      scheduleAutoClose(4000)
    }
  }, [processTranscript, set, scheduleAutoClose])

  const startListening = useCallback(async () => {
    if (feedbackRef.current.kind === 'listening' || !sttAvailable) return

    // Cancel pending auto-close
    if (autoCloseTimer.current) { clearTimeout(autoCloseTimer.current); autoCloseTimer.current = null }

    tataStop()
    set({ kind: 'listening' })
    playBeep('start')

    sttSessionRef.current = await createSmartSingleShotSTT({
      onResult: (result) => {
        playBeep('stop')
        void handleTranscript(result.transcript)
      },
      onError: (err) => {
        if (err === 'aborted') return
        if (err === 'no-speech') {
          void narrateResponse("Je n'ai rien entendu. Réessayez.")
          set({ kind: 'error', text: "Je n'ai rien entendu. Réessayez." })
        } else {
          playBeep('error')
          // Codes STT connus → message dédié ; tout autre message est déjà
          // formulé (VoiceService : micro, moteur, Baoulé non prêt…) →
          // affiché tel quel (Task 32).
          const msg = describeSTTError(err)
          void narrateResponse(msg)
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
  }, [sttAvailable, handleTranscript, set, scheduleAutoClose])

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

  // 2) Consume start signal from the bottom Tata button. The bottom-bar
  // gesture is the only activation control (click-to-toggle since 0e14560);
  // the modal is feedback only.
  useEffect(() => {
    if (!showVoiceModal || !voiceAutoRecord) return
    setVoiceAutoRecord(false)
    if (pendingStopRef.current) {
      // Bottom bar already released — don't start, just show idle overlay
      pendingStopRef.current = false
      return
    }
    void startListening()
    // voiceAutoRecord deliberately left out of the dependency array: this
    // effect consumes the one-shot signal immediately.
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
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto px-4 py-[max(1rem,env(safe-area-inset-top))]"
      onClick={handleClose}
    >
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" />

      {/* Centered floating content */}
      <div
        className="relative flex w-full max-w-sm flex-col items-center gap-6 px-2 sm:gap-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute -right-2 -top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/30 hover:text-white sm:-right-3"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Feedback text */}
          <div className="flex min-h-[80px] w-full max-w-[min(90vw,24rem)] items-center justify-center text-center leading-snug animate-in fade-in duration-300 slide-in-from-bottom-2">
          {feedback.kind === 'idle' && (
            <div className="space-y-2">
               <p className="text-white/90 text-lg font-medium">Appuyez pour parler</p>
              <p className="text-white/50 text-sm">« Tomates deux mille » · « Ouvre Keiwa »</p>
              <p className="text-white/50 text-sm">« Commander 5 sacs de riz »</p>
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
               <p className="text-amber-300 text-base font-medium sm:text-lg">{feedback.text}</p>
            </div>
          )}
        </div>

        {/* Tata is controlled only from the bottom navigation button. */}
        <div className={cn('flex h-20 w-20 items-center justify-center rounded-full sm:h-24 sm:w-24', isListening ? 'bg-[#C66A2C]/20 animate-pulse' : 'bg-white/10')}>
          <img src="/icon-only.png" alt="Tata" className="h-12 w-12 object-contain" />
        </div>

        {/* Bottom label */}
        <p className={cn(
          'text-sm font-medium transition-colors',
          isListening ? 'text-white' : 'text-white/40',
          soleilMode && 'text-base'
        )}>
          {isListening ? 'Appuyez pour envoyer' : 'Tata Nanti Lou'}
        </p>

        {/* Task 32 — langue de reconnaissance (Français / Baoulé β) */}
        <VoiceLanguageSelector />
      </div>
    </div>
  )
}
