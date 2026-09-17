'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Mic, Keyboard, X, Loader2, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { useStockStore } from '@/lib/stores/stock-store'
import { parseIntent, type ParsedIntent } from '@/lib/voice/localIntent'
import { tataSpeak, tataStop, playBeep, haptic } from '@/lib/voice/tata-tts'
import { isAnySTTAvailable, type STTSession } from '@/lib/voice/stt-factory'
import { createSingleShotSTT } from '@/lib/voice/stt'
import { pauseWakeWord, resumeWakeWord } from '@/lib/voice/wake-word'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type VenteState =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'processing'; text: string }
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }

export function VenteRapideModal() {
  const { showVenteRapideModal, closeVenteRapideModal, soleilMode } = useAppStore()
  const { addToCart } = useCaisseStore()
  const { getProductByName } = useStockStore()
  const [sttAvailable] = useState(() => typeof window !== 'undefined' && isAnySTTAvailable())
  const [inputMode, setInputMode] = useState<'voice' | 'keyboard'>(sttAvailable ? 'voice' : 'keyboard')
  const [isListening, setIsListening] = useState(false)
  const [keyboardValue, setKeyboardValue] = useState('')
  const [error, setError] = useState('')
  const [venteState, setVenteState] = useState<VenteState>({ kind: 'idle' })
  const sttSessionRef = useRef<STTSession | null>(null)
  const promptedRef = useRef(false)

  const prompt = "Qu'est-ce que vous vendez ?"

  const handleSale = useCallback((intent: ParsedIntent) => {
    if (intent.type === 'sale' && intent.amount) {
      const product = intent.product ? getProductByName(intent.product) : undefined
      addToCart({
        name: intent.product || 'Article',
        quantity: intent.quantity || 1,
        unitPrice: product?.priceUnit || Math.floor(intent.amount / (intent.quantity || 1)),
        productId: product?.id,
      })
      const text = `${intent.product || 'Article'} : ${intent.amount} francs`
      setVenteState({ kind: 'success', text })
      playBeep('success')
      haptic('success')
      tataSpeak('Vente enregistrée !')
      setTimeout(() => closeVenteRapideModal(), 2000)
    } else {
      setVenteState({ kind: 'error', text: intent.responseText })
      playBeep('error')
      haptic('error')
      tataSpeak(intent.responseText)
    }
  }, [addToCart, getProductByName, closeVenteRapideModal])

  const startListening = useCallback(async () => {
    if (isListening || !sttAvailable) return
    setError('')
    setIsListening(true)
    setVenteState({ kind: 'listening' })
    tataStop()
    playBeep('start')

    // The browser implementation must be created synchronously from the
    // button handler; awaiting the native-aware factory can lose user
    // activation before SpeechRecognition.start() is called.
    sttSessionRef.current = createSingleShotSTT({
      onResult: (result) => {
        playBeep('stop')
        setIsListening(false)
        setVenteState({ kind: 'processing', text: result.transcript })
        setTimeout(() => {
          const intent = parseIntent(result.transcript)
          handleSale(intent)
        }, 300)
      },
      onError: (err) => {
        setIsListening(false)
        if (err === 'no-speech') {
          tataSpeak("Je n'ai rien entendu. Réessayez.")
          setVenteState({ kind: 'error', text: "Aucune parole détectée." })
        } else if (err !== 'aborted') {
          playBeep('error')
          const message = err === 'not-allowed' || err === 'service-not-allowed'
            ? 'Autorisez le micro dans les réglages du navigateur.'
            : err === 'audio-capture'
              ? 'Aucun micro détecté. Vérifiez votre appareil.'
              : err === 'network'
                ? 'Connexion internet nécessaire pour la reconnaissance vocale. Utilisez le clavier.'
                : "Le micro n'est pas disponible. Utilisez le clavier."
          setVenteState({ kind: 'error', text: message })
          tataSpeak(message)
          setInputMode('keyboard')
        }
      },
      onEnd: () => setIsListening(false),
    })
    sttSessionRef.current.start()
  }, [isListening, sttAvailable, handleSale])

  // Speak the prompt on open. Listening starts from the button so browsers
  // receive the user gesture required by SpeechRecognition.
  useEffect(() => {
    if (!showVenteRapideModal) return
    if (promptedRef.current) return
    promptedRef.current = true
    pauseWakeWord()
    tataSpeak(prompt)
  }, [showVenteRapideModal, prompt])

  // Resume wake word on close
  useEffect(() => {
    if (!showVenteRapideModal) {
      resumeWakeWord()
      promptedRef.current = false
      setVenteState({ kind: 'idle' })
    }
    return () => { resumeWakeWord() }
  }, [showVenteRapideModal])

  // Cleanup STT on unmount
  useEffect(() => {
    return () => { sttSessionRef.current?.abort() }
  }, [])

  const handleClose = useCallback(() => {
    sttSessionRef.current?.abort()
    tataStop()
    setKeyboardValue('')
    setError('')
    setVenteState({ kind: 'idle' })
    setInputMode(sttAvailable ? 'voice' : 'keyboard')
    closeVenteRapideModal()
  }, [sttAvailable, closeVenteRapideModal])

  const handleKeyboardSubmit = useCallback(() => {
    if (!keyboardValue.trim()) return
    setVenteState({ kind: 'processing', text: keyboardValue })
    setTimeout(() => {
      const intent = parseIntent(keyboardValue)
      handleSale(intent)
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
      void startListening()
    }
  }, [inputMode, startListening])

  if (!showVenteRapideModal) return null

  const isSuccess = venteState.kind === 'success'
  const isError = venteState.kind === 'error'
  const isProcessing = venteState.kind === 'processing'

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
                <p className="text-white/90 text-lg font-medium">{prompt}</p>
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
                onClick={() => { if (!isListening && !isSuccess) void startListening() }}
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
              {error && <p className="text-amber-400 text-sm">{error}</p>}
            </div>
          ) : (
            /* Keyboard mode */
            <div className="space-y-3">
              <Input
                type="text"
                placeholder="Ex: Tomates 2000"
                value={keyboardValue}
                onChange={(e) => { setKeyboardValue(e.target.value); setError('') }}
                className="text-lg h-14 text-center bg-white/10 border-white/20 text-white placeholder:text-white/30"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleKeyboardSubmit() }}
              />
              {error && <p className="text-amber-400 text-sm">{error}</p>}
              <Button
                className="w-full h-12 bg-[#C66A2C] hover:bg-[#B55D25] text-white font-medium"
                onClick={handleKeyboardSubmit}
                disabled={!keyboardValue.trim() || isProcessing || isSuccess}
              >
                Enregistrer
              </Button>
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
