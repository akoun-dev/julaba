'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Mic, Keyboard, X } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { extractAmount } from '@/lib/voice/localIntent'
import { tataSpeak, tataStop, playBeep, haptic } from '@/lib/voice/tata-tts'
import { createSmartSingleShotSTT, isAnySTTAvailable, describeSTTError, type STTSession } from '@/lib/voice/stt-factory'
import { pauseWakeWord, resumeWakeWord } from '@/lib/voice/wake-word'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
// UI-MP-003 — vraie boîte de dialogue Radix (rôle, aria-modal, piège de
// focus, Échap, restitution du focus).
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

export function OpenCaisseModal() {
  const { showOpenCaisseModal, closeOpenCaisseModal, merchantSexe, soleilMode } = useAppStore()
  const { openSession } = useCaisseStore()
  const [sttAvailable] = useState(() => typeof window !== 'undefined' && isAnySTTAvailable())
  const [inputMode, setInputMode] = useState<'voice' | 'keyboard'>(sttAvailable ? 'voice' : 'keyboard')
  const [isListening, setIsListening] = useState(false)
  const [keyboardValue, setKeyboardValue] = useState('')
  const [error, setError] = useState('')
  const sttSessionRef = useRef<STTSession | null>(null)
  const promptedRef = useRef(false)

  const prompt =
    merchantSexe === 'feminin' ? 'Avec combien commencez-vous, madame ?'
    : merchantSexe === 'masculin' ? 'Avec combien commencez-vous, monsieur ?'
    : 'Avec combien commencez-vous pour votre caisse ?'

  const openSessionWithAmount = useCallback((amount: number) => {
    playBeep('success')
    haptic('success')
    tataSpeak(`Caisse ouverte avec ${amount} francs. Bonne journée !`, () => {
      closeOpenCaisseModal()
    })
  }, [closeOpenCaisseModal])

  const startListening = useCallback(async () => {
    if (isListening || !sttAvailable) return
    setError('')
    setIsListening(true)
    tataStop()
    playBeep('start')

    sttSessionRef.current = await createSmartSingleShotSTT({
      onResult: (result) => {
        playBeep('stop')
        setIsListening(false)
        const amount = extractAmount(result.transcript)
        if (amount !== null && amount > 0) {
          openSession(amount)
          openSessionWithAmount(amount)
        } else {
          playBeep('error')
          haptic('error')
          setError('Montant non compris. Réessayez ou saisissez au clavier.')
          tataSpeak("Je n'ai pas compris le montant. Réessayez.")
        }
      },
      onError: (err) => {
        setIsListening(false)
        if (err === 'no-speech') {
          tataSpeak("Je n'ai rien entendu. Réessayez.")
          setError("Aucune parole détectée. Réessayez.")
        } else if (err !== 'aborted') {
          playBeep('error')
          // Task 32 : problèmes micro classiques → bascule clavier avec le
          // message dédié ; messages déjà formulés (VoiceService, Baoulé…)
          // → affichés tels quels, bascule clavier conservée.
          const micFatal = err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture' || err === 'network' || err === 'failed'
          const msg = micFatal ? 'Micro indisponible. Utilisez le clavier.' : describeSTTError(err)
          setError(msg)
          tataSpeak(msg)
          setInputMode('keyboard')
        }
      },
      onEnd: () => setIsListening(false),
    })
    sttSessionRef.current.start()
  }, [isListening, sttAvailable, openSession, openSessionWithAmount])

  // Speak prompt + auto-listen on open
  useEffect(() => {
    if (!showOpenCaisseModal) return
    if (promptedRef.current) return
    promptedRef.current = true
    pauseWakeWord()
    if (inputMode === 'voice') {
      tataSpeak("Je t'écoute.", () => {
        tataSpeak(prompt, () => {
          requestAnimationFrame(() => { void startListening() })
        })
      })
    } else {
      tataSpeak("Je t'écoute.", () => tataSpeak(prompt))
    }
  }, [showOpenCaisseModal, prompt, inputMode, startListening])

  // Resume wake word on close.
  // Cleanup : ne reprendre le wake word QUE si la modale ÉTAIT ouverte —
  // un resume inconditionnel partait aussi à l'OUVERTURE (transition
  // false→true) et créait un start de fond concurrençant la pause
  // (audit mot de réveil F1 ; même motif que vente-rapide-modal VOCAL-604).
  useEffect(() => {
    if (!showOpenCaisseModal) {
      resumeWakeWord()
      promptedRef.current = false
    }
    return () => { if (showOpenCaisseModal) resumeWakeWord() }
  }, [showOpenCaisseModal])

  // Cleanup STT on unmount
  useEffect(() => {
    return () => { sttSessionRef.current?.abort() }
  }, [])

  const handleClose = useCallback(() => {
    sttSessionRef.current?.abort()
    tataStop()
    setKeyboardValue('')
    setError('')
    setInputMode(sttAvailable ? 'voice' : 'keyboard')
    closeOpenCaisseModal()
  }, [sttAvailable, closeOpenCaisseModal])

  const stopListening = useCallback(() => {
    sttSessionRef.current?.abort()
    tataStop()
    setIsListening(false)
  }, [])

  const handleKeyboardSubmit = useCallback(() => {
    const amount = parseInt(keyboardValue) || 0
    if (amount <= 0) {
      playBeep('error')
      haptic('error')
      setError('Entrez un montant valide.')
      return
    }
    openSession(amount)
    openSessionWithAmount(amount)
  }, [keyboardValue, openSession, openSessionWithAmount])

  const handleToggleMode = useCallback(() => {
    if (inputMode === 'voice') {
      sttSessionRef.current?.abort()
      setIsListening(false)
      setInputMode('keyboard')
    } else {
      setInputMode('voice')
      void startListening()
    }
  }, [inputMode, startListening])

  if (!showOpenCaisseModal) return null

  return (
    <Dialog open onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent
        aria-describedby={undefined}
        className="w-auto max-w-none overflow-visible bg-transparent border-0 shadow-none rounded-none p-0 gap-0 [&>button:last-of-type]:hidden"
      >
      <DialogTitle className="sr-only">Ouvrir ma caisse</DialogTitle>
      <div className="relative w-full max-w-sm animate-in fade-in duration-200 slide-in-from-bottom-4">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute -right-2 -top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/30 hover:text-white"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative flex w-full flex-col items-center gap-6 px-2 text-center sm:gap-8">
          {/* Tata icon — effet d'écoute aligné sur la page d'authentification
              (cercle orange vif qui pulse avec un halo ring-4), même signature
              que le modal vocal (Task 70). */}
          <div className={cn(
            'mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full shadow-md transition-all duration-300',
            isListening
              ? 'bg-[var(--vl-marchand)] shadow-[var(--vl-marchand-shadow)] ring-4 ring-[var(--vl-marchand-ring)] animate-pulse'
              : 'bg-white/10 shadow-none'
          )}>
            <img src="/icon-only.png" alt="Tata" className="h-12 w-12 object-contain" />
          </div>

          {/* Prompt */}
          <div role="status" aria-live="polite">
            <p className="text-white/90 text-lg font-medium mb-1">{prompt}</p>
            <p className="text-white/40 text-sm mb-6">Dites le montant ou saisissez au clavier</p>
          </div>

          {inputMode === 'voice' ? (
            /* Voice mode */
            <div className="space-y-4">
              <button
                onClick={() => { if (!isListening) void startListening() }}
                disabled={isListening}
                className={cn(
                  'mx-auto flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300',
                  isListening
                    ? 'bg-[var(--vl-marchand)] text-white shadow-lg shadow-[var(--vl-marchand-shadow)] ring-4 ring-[var(--vl-marchand-ring)] animate-pulse'
                    : 'bg-white/15 text-white hover:bg-white/25 active:scale-95'
                )}
                aria-label={isListening ? 'Écoute en cours' : 'Parler maintenant'}
              >
                {/* Même langage que l'auth : le micro pulse, pas de spinner. */}
                <Mic className={cn('w-7 h-7', isListening && 'animate-pulse')} />
              </button>
              {isListening && <p className="text-white/70 text-sm">J&apos;écoute...</p>}
              {error && <p className="text-amber-400 text-sm">{error}</p>}
            </div>
          ) : (
            /* Keyboard mode */
            <div className="space-y-3">
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Montant en FCFA"
                value={keyboardValue}
                onChange={(e) => { setKeyboardValue(e.target.value); setError('') }}
                className="text-xl h-14 fcfa text-center bg-white/10 border-white/20 text-white placeholder:text-white/30"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleKeyboardSubmit() }}
              />
              {error && <p className="text-amber-400 text-sm">{error}</p>}
              <Button
                className="w-full h-12 bg-[#C66A2C] hover:bg-[#B55D25] text-white font-medium"
                onClick={handleKeyboardSubmit}
                disabled={!keyboardValue || parseInt(keyboardValue) < 0}
              >
                Ouvrir
              </Button>
            </div>
          )}

          {/* Toggle voice / keyboard */}
          {sttAvailable && (
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
      {/* UI-MP-032 — calque flottant VoiceListeningIndicator supprimé : un seul
          overlay ; l'état d'écoute est porté par la modale (halo + ondes). */}
      </DialogContent>
    </Dialog>
  )
}
