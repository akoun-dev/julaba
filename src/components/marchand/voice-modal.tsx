'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { X, Mic, MicOff, Volume2, Trash2, Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore, type VoiceEntry } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { useStockStore } from '@/lib/stores/stock-store'
import { parseIntent, type ParsedIntent } from '@/lib/voice/localIntent'
import { tataSpeak, tataStop, playBeep, haptic } from '@/lib/voice/tata-tts'
import { isSTTAvailable, createSingleShotSTT, type STTSession } from '@/lib/voice/stt'
import { pauseWakeWord, resumeWakeWord } from '@/lib/voice/wake-word'
import { cn } from '@/lib/utils'

type Message = { role: 'user' | 'tata'; text: string }

export function VoiceModal() {
  const { showVoiceModal, closeVoiceModal, navigate, soleilMode, addVoiceEntry } = useAppStore()
  const { addToCart } = useCaisseStore()
  const { products } = useStockStore()

  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [parsedIntent, setParsedIntent] = useState<ParsedIntent | null>(null)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [localHistory, setLocalHistory] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [sttAvailable] = useState(() => typeof window !== 'undefined' && isSTTAvailable())
  const sttSessionRef = useRef<STTSession | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const addMessage = useCallback((role: 'user' | 'tata', text: string) => {
    setLocalHistory(prev => [...prev, { role, text }])
  }, [])

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [localHistory])

  // Pause wake word when modal opens, resume when it closes
  useEffect(() => {
    if (showVoiceModal) {
      pauseWakeWord()
    } else {
      resumeWakeWord()
    }
  }, [showVoiceModal])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sttSessionRef.current?.abort()
      resumeWakeWord()
    }
  }, [])

  const executeIntent = useCallback((intent: ParsedIntent) => {
    setAwaitingConfirmation(false)
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
      addMessage('tata', 'Vente enregistrée !')
      tataSpeak('Vente enregistrée !')
      addVoiceEntry({
        id: crypto.randomUUID(),
        transcript: intent.rawTranscript,
        intent: 'sale',
        response: 'Vente enregistrée',
        timestamp: Date.now(),
      })
    } else if (intent.type === 'sale' && intent.amount) {
      addToCart({
        name: intent.product || 'Article',
        quantity: intent.quantity || 1,
        unitPrice: intent.amount,
      })
      addMessage('tata', 'Vente enregistrée !')
      tataSpeak('Vente enregistrée !')
    } else if (intent.type === 'expense' && intent.amount) {
      addMessage('tata', 'Dépense enregistrée !')
      tataSpeak('Dépense enregistrée !')
    } else if (intent.type === 'restock') {
      addMessage('tata', 'Stock mis à jour !')
      tataSpeak('Stock mis à jour !')
    }
    setParsedIntent(null)
  }, [addToCart, addMessage, addVoiceEntry])

  const processTranscript = useCallback((text: string) => {
    setTranscript(text)
    addMessage('user', text)

    if (awaitingConfirmation && parsedIntent) {
      const lower = text.toLowerCase()
      if (/^(oui|c'\?est (?:\u00e7a|ca)|exact|c'\?est bon)/i.test(lower)) {
        executeIntent(parsedIntent)
        return
      } else if (/^non/i.test(lower)) {
        addMessage('tata', "D'accord, j'annule.")
        tataSpeak("D'accord, j'annule.")
        setAwaitingConfirmation(false)
        setParsedIntent(null)
        return
      }
    }

    setIsProcessing(true)
    const intent = parseIntent(text)
    setParsedIntent(intent)
    setIsProcessing(false)

    if (intent.type === 'navigation' && intent.targetRoute) {
      addMessage('tata', intent.responseText)
      tataSpeak(intent.responseText, () => {
        closeVoiceModal()
        navigate(intent.targetRoute! as ReturnType<typeof useAppStore.getState>['currentScreen'])
      })
      return
    }

    if (intent.type === 'credit_block' || intent.type === 'unknown' || intent.type === 'cancel') {
      addMessage('tata', intent.responseText)
      tataSpeak(intent.responseText)
      if (intent.type === 'cancel') {
        setAwaitingConfirmation(false)
        setParsedIntent(null)
      }
      return
    }

    addMessage('tata', intent.responseText)
    tataSpeak(intent.responseText)
    setAwaitingConfirmation(true)
  }, [awaitingConfirmation, parsedIntent, executeIntent, addMessage, closeVoiceModal, navigate])

  const stopListening = useCallback(() => {
    sttSessionRef.current?.stop()
    setIsListening(false)
  }, [])

  const startListening = useCallback(() => {
    if (isListening || !sttAvailable) return

    // Stop TTS so it doesn't interfere with STT
    tataStop()

    setIsListening(true)
    playBeep('start')

    sttSessionRef.current = createSingleShotSTT({
      onResult: (result) => {
        playBeep('stop')
        setIsListening(false)
        processTranscript(result.transcript)
      },
      onError: () => {
        setIsListening(false)
        playBeep('error')
        addMessage('tata', "Je n'ai pas bien entendu. Réessayez.")
        tataSpeak("Je n'ai pas bien entendu. Réessayez.")
      },
    })
    sttSessionRef.current.start()
  }, [isListening, sttAvailable, processTranscript, addMessage])

  const handleClose = () => {
    sttSessionRef.current?.abort()
    setIsListening(false)
    tataStop()
    closeVoiceModal()
  }

  const handleClear = () => {
    setLocalHistory([])
    setTranscript('')
    setParsedIntent(null)
    setAwaitingConfirmation(false)
  }

  if (!showVoiceModal) return null

  const textClass = soleilMode ? 'text-black text-base' : ''

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#C66A2C] flex items-center justify-center">
            <Volume2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className={cn('font-semibold', textClass)}>Tata Nanti Lou</h2>
            <p className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm')}>Votre assistante vocale</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleClear}><Trash2 className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" onClick={handleClose}><X className="w-5 h-5" /></Button>
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 julaba-scroll">
        <div className="flex gap-2">
          <div className="w-8 h-8 rounded-full bg-[#C66A2C]/10 flex items-center justify-center shrink-0">
            <Volume2 className="w-4 h-4 text-[#C66A2C]" />
          </div>
          <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[80%]">
            <p className={cn('text-sm', textClass)}>
              Bonjour ! Que voulez-vous faire ?{' '}
              {sttAvailable ? (
                <>Dites par exemple : &laquo; Tomates deux mille &raquo; ou &laquo; Va au stock &raquo;. Maintenez le bouton pour parler.</>
              ) : (
                <>Tapez votre commande ci-dessous.</>
              )}
            </p>
          </div>
        </div>

        {localHistory.map((msg, i) => (
          <div key={i} className={cn('flex gap-2', msg.role === 'user' && 'justify-end')}>
            {msg.role === 'tata' && (
              <div className="w-8 h-8 rounded-full bg-[#C66A2C]/10 flex items-center justify-center shrink-0">
                <Volume2 className="w-4 h-4 text-[#C66A2C]" />
              </div>
            )}
            <div className={cn(
              'rounded-2xl px-4 py-2.5 max-w-[80%]',
              msg.role === 'user'
                ? 'bg-[#C66A2C] text-white rounded-tr-sm'
                : 'bg-muted rounded-tl-sm'
            )}>
              <p className={cn('text-sm', soleilMode && msg.role === 'tata' && 'text-black')}>{msg.text}</p>
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-[#C66A2C] flex items-center justify-center shrink-0">
                <Mic className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}

        {isProcessing && (
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-[#C66A2C]/10 flex items-center justify-center shrink-0">
              <Volume2 className="w-4 h-4 text-[#C66A2C]" />
            </div>
            <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1 items-end h-6">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-1 bg-[#C66A2C] rounded-full voice-wave-bar" />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {transcript && (
        <div className="px-4 py-2 bg-muted/50 border-t">
          <p className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm')}>
            Dernière transcription : &laquo; {transcript} &raquo;
          </p>
        </div>
      )}

      {/* Push-to-Talk / Fallback */}
      <div className="p-6 pb-10 flex flex-col items-center gap-3">
        {sttAvailable ? (
          <>
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              className={cn(
                'relative w-20 h-20 rounded-full flex items-center justify-center transition-all touch-target',
                isListening
                  ? 'bg-[#C66A2C] text-white scale-110 shadow-xl ptt-active'
                  : 'bg-[#C66A2C]/10 text-[#C66A2C] hover:bg-[#C66A2C]/20'
              )}
            >
              {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
            </button>
            <p className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm font-semibold')}>
              {isListening ? 'Relâchez pour arrêter' : 'Maintenez pour parler'}
            </p>
            <p className={cn('text-[10px] text-muted-foreground/60', soleilMode && 'text-xs')}>
              ou dites &laquo; Julaba &raquo; n'importe où dans l'app
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <Radio className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              Reconnaissance vocale non disponible dans ce navigateur
            </p>
            <p className="text-[10px] text-muted-foreground/60">
              Utilisez Chrome sur Android ou Safari sur iOS pour activer la voix
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
