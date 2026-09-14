'use client'

import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Mic, Loader2 } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { createSmartSingleShotSTT, isAnySTTAvailable } from '@/lib/voice/stt-factory'
import { extractAmount } from '@/lib/voice/localIntent'
import { tataSpeak, playBeep, haptic } from '@/lib/voice/tata-tts'
import type { STTSession } from '@/lib/voice/stt'
import { cn } from '@/lib/utils'

interface VoiceAmountInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  soleilMode?: boolean
  autoFocus?: boolean
  className?: string
}

/**
 * Amount input with an attached mic button: speaking "cinquante mille francs"
 * fills the field the same as typing 50000. Falls back to keyboard-only when
 * no STT engine or microphone permission is available.
 */
export function VoiceAmountInput({ value, onChange, placeholder, soleilMode, autoFocus, className }: VoiceAmountInputProps) {
  const { voiceEnabled } = useAppStore()
  const [sttAvailable] = useState(() => typeof window !== 'undefined' && isAnySTTAvailable())
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const sttSessionRef = useRef<STTSession | null>(null)

  const canListen = voiceEnabled && sttAvailable

  const startListening = async () => {
    if (isListening || !canListen) return
    setError('')
    setIsListening(true)
    playBeep('start')
    sttSessionRef.current = await createSmartSingleShotSTT({
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
          setError('Micro indisponible. Utilisez le clavier.')
        }
      },
      onEnd: () => setIsListening(false),
    })
    sttSessionRef.current.start()
  }

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
            className={cn('h-14 w-14 shrink-0', isListening && 'bg-[#C66A2C] hover:bg-[#B55D25] text-white animate-pulse')}
            onClick={startListening}
            disabled={isListening}
            aria-label="Dire le montant à voix haute"
          >
            {isListening ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive text-center mt-2">{error}</p>}
    </div>
  )
}
