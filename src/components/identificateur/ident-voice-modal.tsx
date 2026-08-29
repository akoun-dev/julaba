'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Mic, MicOff, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { parseIdentIntent } from '@/lib/voice/identIntent'
import { tataSpeak, tataStop, playBeep, haptic } from '@/lib/voice/tata-tts'
import { isAnySTTAvailable as isSTTAvailable, createSmartSingleShotSTT as createSingleShotSTT, type STTSession } from '@/lib/voice/stt-factory'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

/** Display state for the result feedback */
type FeedbackState =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'processing'; text: string }
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }

/**
 * Identificateur's own voice modal — navigation only, deliberately not a
 * reuse of marchand's VoiceModal (see identIntent.ts for why).
 */
export function IdentVoiceModal() {
  const { showVoiceModal, closeVoiceModal, navigate, soleilMode, voiceAutoRecord, setVoiceAutoRecord, voiceStopRequested, requestVoiceStop } = useAppStore()
  const [sttAvailable] = useState(() => typeof window !== 'undefined' && isSTTAvailable())
  const sttSessionRef = useRef<STTSession | null>(null)
  const feedbackRef = useRef<FeedbackState>({ kind: 'idle' })
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingStopRef = useRef(false)

  const [feedback, setFeedback] = useState<FeedbackState>({ kind: 'idle' })
  const set = useCallback((s: FeedbackState) => {
    feedbackRef.current = s
    setFeedback(s)
  }, [])

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

  const processTranscript = useCallback((text: string) => {
    set({ kind: 'processing', text })

    setTimeout(() => {
      const intent = parseIdentIntent(text)
      playBeep(intent.targetRoute ? 'success' : 'error')
      haptic(intent.targetRoute ? 'success' : 'error')

      if (intent.targetRoute) {
        tataSpeak(intent.responseText, () => {
          closeVoiceModal()
          navigate(intent.targetRoute!)
        })
        set({ kind: 'success', text: intent.responseText })
      } else {
        tataSpeak(intent.responseText)
        set({ kind: 'error', text: intent.responseText })
        scheduleAutoClose(3500)
      }
    }, 300)
  }, [set, closeVoiceModal, navigate, scheduleAutoClose])

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
  }, [showVoiceModal, voiceAutoRecord, setVoiceAutoRecord, startListening])

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" />

      <div className="relative flex flex-col items-center gap-8 px-8" onClick={(e) => e.stopPropagation()}>
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
              <p className="text-white/90 text-lg font-medium">Maintenez pour parler</p>
              <p className="text-white/50 text-sm">&laquo; Mes dossiers &raquo;</p>
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
                <span className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: `${IDENT_COLOR}33`, animationDuration: '1.5s' }} />
                <span className="absolute -inset-4 rounded-full animate-pulse" style={{ backgroundColor: `${IDENT_COLOR}1a`, animationDuration: '1s' }} />
                <span className="absolute -inset-8 rounded-full animate-pulse" style={{ backgroundColor: `${IDENT_COLOR}0d`, animationDuration: '1.2s', animationDelay: '0.3s' }} />
              </>
            )}
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              className={cn(
                'relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 select-none text-white',
                isListening ? 'scale-110 shadow-2xl' : 'bg-white/15 backdrop-blur-sm hover:bg-white/25 active:scale-95 shadow-xl'
              )}
              style={isListening ? { backgroundColor: IDENT_COLOR } : undefined}
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
          {isListening ? 'Relâchez pour envoyer' : 'Assistant vocal'}
        </p>
      </div>
    </div>
  )
}
