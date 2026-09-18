'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Mic, Keyboard, X, Loader2, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { useStockStore } from '@/lib/stores/stock-store'
import { completeQuickSale, planQuickSale } from '@/lib/quick-sale'
import { parseIntent, formatFCFA, type ParsedIntent } from '@/lib/voice/localIntent'
import { tataSpeak, tataStop, playBeep, haptic } from '@/lib/voice/tata-tts'
import {
  canAttemptSTT,
  describeSTTError,
  startSmartSingleShotSTT,
  type STTSession,
} from '@/lib/voice/stt-factory'
import type { STTCallbacks } from '@/lib/voice/stt'
import { routeConfirmResponse } from '@/lib/voice/confirmations'
import { pauseWakeWord, resumeWakeWord } from '@/lib/voice/wake-word'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type VenteState =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'processing'; text: string }
  | { kind: 'confirm'; text: string }
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }

// Watchdog d'écoute (audit VOCAL-602) : un moteur qui ne répond JAMAIS
// (session native muette, bridge bloqué, no-op silencieux) ne doit pas
// laisser « J'écoute... » à l'infini — erreur explicite + libération.
const LISTEN_WATCHDOG_MS = 15_000
const CLOSE_DELAY_MS = 1500

const PROMPT = "Qu'est-ce que vous vendez ?"

export function VenteRapideModal() {
  const { showVenteRapideModal, closeVenteRapideModal, navigate, goBack } = useAppStore()
  const { getProductByName } = useStockStore()
  // Porte d'entrée (audit VOCAL-602) : canAttemptSTT — vrai sur natif dès
  // qu'un moteur PEUT être tenté (VoiceService/Sherpa), au lieu de
  // isAnySTTAvailable qui exigeait Web Speech ou un modèle Sherpa déjà
  // chargé (vocal silencieusement indisponible sinon).
  const [sttAvailable] = useState(() => typeof window !== 'undefined' && canAttemptSTT())
  const [inputMode, setInputMode] = useState<'voice' | 'keyboard'>(sttAvailable ? 'voice' : 'keyboard')
  const [isListening, setIsListening] = useState(false)
  const [keyboardValue, setKeyboardValue] = useState('')
  const [venteState, setVenteState] = useState<VenteState>({ kind: 'idle' })
  const sttSessionRef = useRef<STTSession | null>(null)
  // Génération de session (audit VOCAL-602) : toute nouvelle écoute
  // invalide les callbacks de la précédente — plus de session fantôme
  // tenant le micro ni de résultats livrés à une closure périmée.
  const sttGenerationRef = useRef(0)
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const promptedRef = useRef(false)
  // Indirection refs breaking the callback declaration cycle
  // (handleSale → listenForConfirmation → handleConfirmResponse →
  // startListening → handleSale). Deferred speech callbacks read .current,
  // so they always invoke the latest closure (react-hooks/immutability).
  const listenForConfirmationRef = useRef<() => void>(() => {})
  const startListeningRef = useRef<() => void>(() => {})

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current)
      watchdogRef.current = null
    }
  }, [])

  const scheduleClose = useCallback((delay: number = CLOSE_DELAY_MS) => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null
      closeVenteRapideModal()
    }, delay)
  }, [closeVenteRapideModal])

  /**
   * Ouvre une NOUVELLE session d'écoute en fermet proprement la précédente
   * (abort + génération + watchdog). `create` doit créer (et démarrer) la
   * session ; `onWatchdog` décide quoi faire si rien ne se manifeste dans
   * LISTEN_WATCHDOG_MS.
   */
  const beginSession = useCallback((create: () => STTSession, onWatchdog: () => void) => {
    sttGenerationRef.current += 1
    const generation = sttGenerationRef.current
    sttSessionRef.current?.abort()
    clearWatchdog()
    const session = create()
    sttSessionRef.current = session
    watchdogRef.current = setTimeout(() => {
      if (generation !== sttGenerationRef.current) return
      session.abort()
      onWatchdog()
    }, LISTEN_WATCHDOG_MS)
    return generation
  }, [clearWatchdog])

  // ── Traitement d'un intent « vente » et des intents non métier ──────────

  const handleSale = useCallback(async (intent: ParsedIntent) => {
    // « oui » au prompt initial (audit VOCAL-605) : nouvelle écoute —
    // fini l'erreur au texte vide avec tataSpeak('').
    if (intent.type === 'yes') {
      setVenteState({ kind: 'idle' })
      tataSpeak("D'accord, dites ce que vous vendez.", () => {
        requestAnimationFrame(() => { void startListeningRef.current() })
      })
      return
    }
    // « non / stop / arrête / plus rien » : fermer poliment — la modale
    // restait ouverte sur une erreur ambre.
    if (intent.type === 'no' || intent.type === 'cancel') {
      tataSpeak("D'accord, bonne journée !")
      setVenteState({ kind: 'success', text: 'Bonne journée !' })
      scheduleClose()
      return
    }
    // Navigation : exécuter réellement (fermer puis naviguer) — avant,
    // Tata annonçait « J'ouvre… » sans rien ouvrir.
    if (intent.type === 'navigation' && intent.targetRoute) {
      // targetRoute : littéral ScreenRoute du parseur (NAV_KEYWORDS) —
      // cast identique à voice-modal (ParsedIntent.targetRoute est string).
      const route = intent.targetRoute as ReturnType<typeof useAppStore.getState>['currentScreen']
      setVenteState({ kind: 'success', text: intent.responseText })
      tataSpeak(intent.responseText, () => {
        closeVenteRapideModal()
        navigate(route)
      })
      return
    }
    if (intent.type === 'back') {
      setVenteState({ kind: 'success', text: intent.responseText })
      tataSpeak(intent.responseText, () => {
        closeVenteRapideModal()
        goBack()
      })
      return
    }
    // Consultation : annoncer le vrai total du jour (caisse-store) au lieu
    // d'un mensonger « Consultation en cours... ».
    if (intent.type === 'consultation') {
      const { todaySales, todaySalesCount } = useCaisseStore.getState()
      const text = todaySalesCount > 0
        ? `Ventes du jour : ${formatFCFA(todaySales)} pour ${todaySalesCount} vente${todaySalesCount > 1 ? 's' : ''}.`
        : 'Aucune vente enregistrée aujourd\'hui.'
      setVenteState({ kind: 'success', text })
      tataSpeak(text)
      return
    }

    // ── Vente (audit VOCAL-603 : le montant DICTÉ fait loi) ──
    if (intent.type === 'sale' && intent.amount) {
      const product = intent.product ? getProductByName(intent.product) : undefined
      // planQuickSale : total = montant dicté, prix unitaire en DÉCOUT —
      // le priceUnit du stock n'écrase plus jamais la parole du marchand.
      const plan = planQuickSale(intent, product)
      if (!plan) {
        const message = intent.responseText || 'Je n\'ai pas compris le montant. Réessayez.'
        setVenteState({ kind: 'error', text: message })
        playBeep('error')
        haptic('error')
        tataSpeak(message)
        return
      }
      const result = await completeQuickSale({
        name: plan.name,
        quantity: plan.quantity,
        unitPrice: plan.unitPrice,
        total: plan.total,
        productId: plan.productId,
      })
      if (!result.ok) {
        const message = 'Vente non enregistrée. Réessayez.'
        setVenteState({ kind: 'error', text: message })
        playBeep('error')
        haptic('error')
        tataSpeak(message)
        return
      }
      playBeep('success')
      haptic('success')
      // Annoncer ce qui a réellement été enregistré : le montant dicté
      // (plus jamais un total recalculé au prix catalogue), le statut de
      // synchronisation (audit VOCAL-604 — plus de file offline
      // silencieuse) et une éventuelle survente (audit VOCAL-605).
      const syncNote = result.synced ? '' : ' En attente de synchronisation.'
      const stockNote = result.stockShort ? ' Attention, stock épuisé.' : ''
      const confirmText = `${formatFCFA(plan.total)} enregistrés.${syncNote}${stockNote} Voulez-vous autre chose ?`
      setVenteState({ kind: 'confirm', text: confirmText })
      tataSpeak(confirmText, () => {
        requestAnimationFrame(() => { void listenForConfirmationRef.current() })
      })
      return
    }

    // Autres intents (dépense, commande fournisseur, crédit bloqué…) :
    // hors périmètre de la vente rapide — le message du parseur est repris
    // tel quel, jamais transformé en action silencieuse.
    setVenteState({ kind: 'error', text: intent.responseText })
    playBeep('error')
    haptic('error')
    tataSpeak(intent.responseText)
  }, [getProductByName, closeVenteRapideModal, navigate, goBack, scheduleClose])

  // ── Phase de confirmation (« Voulez-vous autre chose ? ») ────────────────

  const handleConfirmResponse = useCallback((text: string) => {
    // Routage bilingue fr + bci (routeConfirmResponse) : oui/non reconnus
    // (liste pilote ɛhɛ/ao incluse), sinon ré-analyse comme nouvelle
    // commande — « encore tomates 2000 » enchaîne la vente au lieu de
    // fermer la modale.
    const route = routeConfirmResponse(text)
    if (route.kind === 'yes') {
      setVenteState({ kind: 'idle' })
      tataSpeak(PROMPT, () => {
        requestAnimationFrame(() => { void startListeningRef.current() })
      })
      return
    }
    if (route.kind === 'no') {
      tataSpeak("D'accord, bonne journée !")
      setVenteState({ kind: 'success', text: 'Bonne journée !' })
      scheduleClose()
      return
    }
    const { intent } = route
    if (
      (intent.type === 'sale' && intent.amount)
      || (intent.type === 'navigation' && intent.targetRoute)
      || intent.type === 'back'
      || intent.type === 'no'
      || intent.type === 'cancel'
      || intent.type === 'consultation'
    ) {
      setVenteState({ kind: 'processing', text: intent.rawTranscript })
      void handleSale(intent)
      return
    }
    // Vraiment pas compris : repose la question, on RESTE en confirmation.
    const askText = 'Voulez-vous autre chose ? Dites oui, ou donnez-moi la vente suivante.'
    setVenteState({ kind: 'confirm', text: askText })
    tataSpeak(askText, () => {
      requestAnimationFrame(() => { void listenForConfirmationRef.current() })
    })
  }, [handleSale, scheduleClose])

  // Erreur micro en phase de confirmation (audit VOCAL-605) : la vente est
  // DÉJÀ enregistrée — on le dit et on propose le clavier oui/non au lieu
  // de fermer d'office « Bonne journée ».
  const confirmKeyboardFallback = useCallback(() => {
    const note = 'Vente enregistrée. Répondez au clavier : autre chose ?'
    setInputMode('keyboard')
    setVenteState({ kind: 'confirm', text: note })
    tataSpeak(note)
  }, [])

  const listenForConfirmation = useCallback(async () => {
    if (!sttAvailable) return
    setIsListening(true)
    setVenteState((s) => s.kind === 'confirm' ? s : { kind: 'confirm', text: s.kind === 'success' ? s.text : '' })
    tataStop()
    playBeep('start')

    const onWatchdog = () => {
      setIsListening(false)
      confirmKeyboardFallback()
    }
    const callbacks: STTCallbacks = {
      onResult: (result) => {
        if (generation !== sttGenerationRef.current) return
        clearWatchdog()
        playBeep('stop')
        setIsListening(false)
        setVenteState({ kind: 'processing', text: result.transcript })
        setTimeout(() => {
          if (generation !== sttGenerationRef.current) return
          handleConfirmResponse(result.transcript)
        }, 300)
      },
      onError: (err) => {
        if (generation !== sttGenerationRef.current) return
        clearWatchdog()
        setIsListening(false)
        if (err === 'aborted') return
        confirmKeyboardFallback()
      },
      onEnd: () => {
        if (generation !== sttGenerationRef.current) return
        setIsListening(false)
      },
    }
    const generation = beginSession(
      () => startSmartSingleShotSTT(callbacks, { lang: 'fr-FR' }),
      onWatchdog,
    )
  }, [sttAvailable, handleConfirmResponse, beginSession, clearWatchdog, confirmKeyboardFallback])

  // ── Phase de vente ───────────────────────────────────────────────────────

  const startListening = useCallback(async () => {
    if (isListening || !sttAvailable) return
    setIsListening(true)
    setVenteState({ kind: 'listening' })
    tataStop()
    playBeep('start')

    const onWatchdog = () => {
      setIsListening(false)
      const message = "Je n'ai rien entendu. Utilisez le clavier si le problème persiste."
      setVenteState({ kind: 'error', text: 'Écoute interrompue : aucune réponse du micro.' })
      tataSpeak(message)
    }
    const callbacks: STTCallbacks = {
      onResult: (result) => {
        if (generation !== sttGenerationRef.current) return
        clearWatchdog()
        playBeep('stop')
        setIsListening(false)
        setVenteState({ kind: 'processing', text: result.transcript })
        setTimeout(() => {
          if (generation !== sttGenerationRef.current) return
          const intent = parseIntent(result.transcript)
          void handleSale(intent)
        }, 300)
      },
      onError: (err) => {
        if (generation !== sttGenerationRef.current) return
        clearWatchdog()
        setIsListening(false)
        if (err === 'no-speech') {
          tataSpeak("Je n'ai rien entendu. Réessayez.")
          setVenteState({ kind: 'error', text: 'Aucune parole détectée.' })
        } else if (err !== 'aborted') {
          playBeep('error')
          // Message formulé explicite (les chaînes déjà formulées par les
          // moteurs natifs passent telles quelles via describeSTTError).
          const message = err === 'not-allowed' || err === 'service-not-allowed'
            ? 'Autorisez le micro dans les réglages du navigateur.'
            : err === 'audio-capture'
              ? 'Aucun micro détecté. Vérifiez votre appareil.'
              : err === 'network'
                ? 'Connexion internet nécessaire pour la reconnaissance vocale. Utilisez le clavier.'
                : describeSTTError(err)
          setVenteState({ kind: 'error', text: message })
          tataSpeak(message)
          setInputMode('keyboard')
        }
      },
      onEnd: () => {
        if (generation !== sttGenerationRef.current) return
        setIsListening(false)
      },
    }
    // Session hybride (audit VOCAL-602) : web → Web Speech créé et démarré
    // SYNCHRONEMENT (activation utilisateur) ; natif → factory async
    // VoiceService/Sherpa. Langue fr explicite : le parseur de vente est
    // français (prompts bci = suite B4, arbitration séparée).
    const generation = beginSession(
      () => startSmartSingleShotSTT(callbacks, { lang: 'fr-FR' }),
      onWatchdog,
    )
  }, [isListening, sttAvailable, handleSale, beginSession, clearWatchdog])

  // Keep the indirection refs in sync with the latest closures.
  useEffect(() => { listenForConfirmationRef.current = listenForConfirmation }, [listenForConfirmation])
  useEffect(() => { startListeningRef.current = startListening }, [startListening])

  // Speak the prompt on open, then auto-listen
  useEffect(() => {
    if (!showVenteRapideModal) return
    if (promptedRef.current) return
    promptedRef.current = true
    pauseWakeWord()
    if (inputMode === 'voice') {
      tataSpeak(PROMPT, () => {
        requestAnimationFrame(() => { void startListening() })
      })
    } else {
      tataSpeak(PROMPT)
    }
  }, [showVenteRapideModal, inputMode, startListening])

  // Resume wake word on close
  useEffect(() => {
    if (!showVenteRapideModal) {
      resumeWakeWord()
      promptedRef.current = false
      setVenteState({ kind: 'idle' })
    }
    return () => {
      // Audit VOCAL-604 : ne reprendre le wake word QUE si la modale ÉTAIT
      // ouverte (fermeture/démontage). Ce cleanup s'exécute AUSSI quand la
      // modale s'OUVRE (transition false→true) — y relancer le listener de
      // fond pendant la modale créait la contention de micro ; la pause
      // est désormais un état côté wake-word (annule un start en vol),
      // et la reprise ne part plus d'une ouverture.
      if (showVenteRapideModal) resumeWakeWord()
    }
  }, [showVenteRapideModal])

  // Cleanup STT + timers on unmount
  useEffect(() => {
    return () => {
      sttGenerationRef.current += 1
      sttSessionRef.current?.abort()
      if (watchdogRef.current) clearTimeout(watchdogRef.current)
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  const handleClose = useCallback(() => {
    sttGenerationRef.current += 1
    sttSessionRef.current?.abort()
    clearWatchdog()
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    tataStop()
    setKeyboardValue('')
    setVenteState({ kind: 'idle' })
    setInputMode(sttAvailable ? 'voice' : 'keyboard')
    closeVenteRapideModal()
  }, [sttAvailable, closeVenteRapideModal, clearWatchdog])

  const handleKeyboardSubmit = useCallback(() => {
    if (!keyboardValue.trim()) return
    setVenteState({ kind: 'processing', text: keyboardValue })
    setTimeout(() => {
      const intent = parseIntent(keyboardValue)
      void handleSale(intent)
      setKeyboardValue('')
    }, 300)
  }, [keyboardValue, handleSale])

  const handleToggleMode = useCallback(() => {
    if (inputMode === 'voice') {
      sttSessionRef.current?.abort()
      setIsListening(false)
      setInputMode('keyboard')
    } else {
      setInputMode('voice')
      // En phase de confirmation, repasser en voix = réécouter la réponse
      // oui/non (pas re-démarrer une vente) — audit VOCAL-605.
      if (venteState.kind === 'confirm') {
        void listenForConfirmation()
      } else {
        void startListening()
      }
    }
  }, [inputMode, startListening, listenForConfirmation, venteState.kind])

  if (!showVenteRapideModal) return null

  const isSuccess = venteState.kind === 'success'
  const isError = venteState.kind === 'error'
  const isProcessing = venteState.kind === 'processing'
  const isConfirm = venteState.kind === 'confirm'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={handleClose}>
      <div className="relative w-full max-w-sm animate-in fade-in duration-200 slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute -right-2 -top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/30 hover:text-white"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="rounded-3xl bg-stone-900 p-6 text-center shadow-2xl">
          {/* Tata icon */}
          <div className={cn(
            'mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full transition-all',
            isListening ? 'bg-[#C66A2C]/20 animate-pulse' : 'bg-white/10'
          )}>
            {isSuccess ? (
              <CheckCircle2 className="w-10 h-10 text-green-400" />
            ) : (
              <img src="/icon-only.png" alt="Tata" className="h-12 w-12 object-contain" />
            )}
          </div>

          {/* State text */}
          <div className="min-h-[60px] mb-6">
            {venteState.kind === 'idle' && (
              <>
                <p className="text-white/90 text-lg font-medium">{PROMPT}</p>
                <p className="text-white/40 text-sm mt-1">&laquo; Tomates deux mille &raquo;</p>
              </>
            )}
            {venteState.kind === 'listening' && (
              <div className="flex items-center justify-center gap-3">
                <div className="flex items-end gap-1 h-6">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-1.5 bg-[#C66A2C] rounded-full voice-wave-bar" style={{ height: '16px' }} />
                  ))}
                </div>
                <p className="text-white text-lg font-medium">J&apos;écoute...</p>
              </div>
            )}
            {venteState.kind === 'processing' && (
              <p className="text-white/70 text-sm">&laquo; {venteState.text} &raquo;</p>
            )}
            {isConfirm && (
              <div className="space-y-2">
                <p className="text-green-300 text-base font-medium">{venteState.text}</p>
                <p className="text-white/50 text-xs">
                  {isListening ? 'Répondez oui ou non...' : 'Appuyez pour répondre'}
                </p>
              </div>
            )}
            {isSuccess && (
              <p className="text-green-300 text-lg font-medium">{venteState.text}</p>
            )}
            {isError && (
              <p className="text-amber-300 text-base font-medium">{venteState.text}</p>
            )}
          </div>

          {inputMode === 'voice' ? (
            /* Voice mode */
            <div className="space-y-4">
              <button
                onClick={() => {
                  if (!isListening && !isSuccess) {
                    if (isConfirm) {
                      void listenForConfirmation()
                    } else {
                      void startListening()
                    }
                  }
                }}
                disabled={isListening || isSuccess}
                className={cn(
                  'mx-auto flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300',
                  isListening
                    ? 'bg-[#C66A2C] text-white shadow-lg shadow-[#C66A2C]/30 scale-110'
                    : 'bg-white/15 text-white hover:bg-white/25 active:scale-95'
                )}
                aria-label={isListening ? 'Écoute en cours' : 'Parler maintenant'}
              >
                {isListening ? <Loader2 className="w-7 h-7 animate-spin" /> : <Mic className="w-7 h-7" />}
              </button>
            </div>
          ) : (
            /* Keyboard mode */
            <div className="space-y-3">
              {isConfirm ? (
                <div className="space-y-2">
                  <Input
                    type="text"
                    placeholder="Tapez oui ou non"
                    value={keyboardValue}
                    onChange={(e) => setKeyboardValue(e.target.value)}
                    className="text-lg h-14 text-center bg-white/10 border-white/20 text-white placeholder:text-white/30"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && keyboardValue.trim()) {
                        handleConfirmResponse(keyboardValue)
                        setKeyboardValue('')
                      }
                    }}
                  />
                  <Button
                    className="w-full h-12 bg-[#C66A2C] hover:bg-[#B55D25] text-white font-medium"
                    onClick={() => { handleConfirmResponse(keyboardValue); setKeyboardValue('') }}
                    disabled={!keyboardValue.trim()}
                  >
                    Confirmer
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    type="text"
                    placeholder="Ex: Tomates 2000"
                    value={keyboardValue}
                    onChange={(e) => setKeyboardValue(e.target.value)}
                    className="text-lg h-14 text-center bg-white/10 border-white/20 text-white placeholder:text-white/30"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleKeyboardSubmit() }}
                  />
                  <Button
                    className="w-full h-12 bg-[#C66A2C] hover:bg-[#B55D25] text-white font-medium"
                    onClick={handleKeyboardSubmit}
                    disabled={!keyboardValue.trim() || isProcessing || isSuccess}
                  >
                    Enregistrer
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Toggle voice / keyboard */}
          {sttAvailable && !isSuccess && (
            <button
              onClick={handleToggleMode}
              className="mt-4 flex items-center gap-1.5 mx-auto text-white/40 text-xs hover:text-white/70 transition-colors"
            >
              {inputMode === 'voice' ? (
                <>
                  <Keyboard className="w-3.5 h-3.5" />
                  <span>Saisir au clavier</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  <span>Parler</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
