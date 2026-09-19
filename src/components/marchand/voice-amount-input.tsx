'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Mic } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { createSmartSingleShotSTT, isAnySTTAvailable, describeSTTError } from '@/lib/voice/stt-factory'
import { extractAmount } from '@/lib/voice/localIntent'
import { tataSpeak, playBeep, haptic } from '@/lib/voice/tata-tts'
import { createSingleShotSTT, type STTSession } from '@/lib/voice/stt'
import { Capacitor } from '@capacitor/core'
import { cn } from '@/lib/utils'

interface VoiceAmountInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  soleilMode?: boolean
  autoFocus?: boolean
  className?: string
  /**
   * When set, Tata asks this question out loud as soon as the input mounts
   * and, once she's done speaking, starts listening automatically — no tap
   * on the mic needed. Fires once per mount (e.g. once per modal open).
   */
  autoPrompt?: string
}

/**
 * Amount input with an attached mic button: speaking "cinquante mille francs"
 * fills the field the same as typing 50000. Falls back to keyboard-only when
 * no STT engine or microphone permission is available.
 */
export function VoiceAmountInput({ value, onChange, placeholder, soleilMode, autoFocus, className, autoPrompt }: VoiceAmountInputProps) {
  const { voiceEnabled } = useAppStore()
  const [sttAvailable] = useState(() => typeof window !== 'undefined' && isAnySTTAvailable())
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const sttSessionRef = useRef<STTSession | null>(null)
  const hasPromptedRef = useRef(false)

  const canListen = voiceEnabled && sttAvailable
  const canListenRef = useRef(canListen)
  useEffect(() => { canListenRef.current = canListen })

  const startListening = useCallback(async () => {
    if (isListening || !canListenRef.current) return
    setError('')
    setIsListening(true)
    playBeep('start')
    const createSession = Capacitor.isNativePlatform()
      ? createSmartSingleShotSTT
      : (callbacks: Parameters<typeof createSingleShotSTT>[0]) => createSingleShotSTT(callbacks, { lang: 'fr-FR' })
    sttSessionRef.current = await createSession({
      onResult: (result) => {
        playBeep('stop')
        setIsListening(false)
        const amount = extractAmount(result.transcript)
        if (amount !== null) {
          onChange(String(amount))
          haptic('success')
          tataSpeak(`${amount} francs.`)
        } else {
          playBeep('error')
          haptic('error')
          setError('Montant non compris. Réessayez ou saisissez au clavier.')
          tataSpeak("Je n'ai pas compris le montant. Réessayez ou entrez-le au clavier.")
        }
      },
      onError: (err) => {
        setIsListening(false)
        if (err === 'no-speech') {
          setError('Aucune parole détectée.')
          } else if (err !== 'aborted') {
            playBeep('error')
            setError(err === 'network'
              ? 'Micro autorisé, mais le service vocal du navigateur est indisponible. Vérifiez la connexion ou utilisez le clavier.'
              : err === 'not-allowed'
                ? 'Micro non autorisé pour cette page. Vérifiez les permissions du navigateur.'
                : err === 'audio-capture'
                  ? 'Aucun micro détecté. Vérifiez le micro sélectionné sur votre appareil.'
                  // Task 32 : messages déjà formulés (VoiceService, Baoulé…) → tels quels.
                  : describeSTTError(err))
        }
      },
      onEnd: () => setIsListening(false),
    })
    sttSessionRef.current.start()
  }, [isListening, onChange])
  const startListeningRef = useRef(startListening)
  useEffect(() => { startListeningRef.current = startListening })

  // Ask the question out loud once, right when this field appears, then
  // hand off to the mic automatically when voice input is enabled. Opening
  // the cash register always announces the prompt; the keyboard remains the
  // fallback when speech input is unavailable or disabled.
  useEffect(() => {
    if (hasPromptedRef.current || !autoPrompt) return
    hasPromptedRef.current = true
    tataSpeak(autoPrompt, (state) => {
      if (state === 'done' && canListenRef.current) startListeningRef.current()
    })
  }, [autoPrompt, voiceEnabled])

  return (
    <div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn('text-xl h-14 fcfa text-center', soleilMode && 'text-2xl', className)}
          autoFocus={autoFocus}
        />
        {canListen && (
          <Button
            type="button"
            variant={isListening ? 'default' : 'outline'}
            size="icon"
            className={cn(
              'h-14 w-14 shrink-0 transition-all duration-300',
              // Effet d'écoute aligné sur la page d'authentification
              // (orange vif + halo ring-4), même signature que le modal vocal.
              isListening &&
                'bg-[#D2622A] hover:bg-[#D2622A] text-white shadow-lg shadow-[#D2622A]/40 ring-4 ring-[#D2622A]/25 animate-pulse'
            )}
            onClick={startListening}
            disabled={isListening}
            aria-label="Dire le montant à voix haute"
          >
            {/* Même langage que l'auth : le micro pulse, pas de spinner. */}
            <Mic className={cn('w-5 h-5', isListening && 'animate-pulse')} />
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive text-center mt-2">{error}</p>}
    </div>
  )
}
