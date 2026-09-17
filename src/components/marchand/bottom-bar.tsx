'use client'

import { Home, Mic, User } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { cn } from '@/lib/utils'
import { getWakeWordState, onWakeStateChange, type WakeWordState } from '@/lib/voice/wake-word'
import { unlockTataAudio } from '@/lib/voice/tata-tts'
import { useState, useEffect, useCallback, useRef } from 'react'

const tabs = [
  { id: 'home' as const, label: 'Accueil', icon: Home },
  { id: 'voice' as const, label: 'Tata', icon: Mic },
  { id: 'profil' as const, label: 'Moi', icon: User },
]

export function BottomBar() {
  const { currentScreen, navigate, openVoiceModal, soleilMode, wakeWordEnabled, voiceEnabled, setVoiceAutoRecord, requestVoiceStop, showVoiceModal, openOpenCaisseModal } = useAppStore()
  const session = useCaisseStore((s) => s.session)
  const isCaisseOpen = session?.isOpen === true
  const [wakeState, setWakeState] = useState<WakeWordState>(getWakeWordState())
  const listeningRef = useRef(false)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdStartedRef = useRef(false)

  // Subscribe to wake word state changes
  useEffect(() => {
    return onWakeStateChange(setWakeState)
  }, [])

  const handleMicDown = useCallback(() => {
    // Si la caisse n'est pas ouverte, ouvrir le modal d'ouverture
    if (!isCaisseOpen) {
      openOpenCaisseModal()
      return
    }
    holdStartedRef.current = false
    listeningRef.current = true
    unlockTataAudio()
    openVoiceModal()
    holdTimerRef.current = setTimeout(() => {
      if (!listeningRef.current) return
      holdStartedRef.current = true
      setVoiceAutoRecord(true)
    }, 300)
  }, [openVoiceModal, setVoiceAutoRecord, isCaisseOpen, openOpenCaisseModal])

  const handleMicUp = useCallback(() => {
    if (!listeningRef.current) return
    listeningRef.current = false
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    holdTimerRef.current = null
    if (holdStartedRef.current && showVoiceModal) requestVoiceStop()
    else useAppStore.getState().closeVoiceModal()
  }, [requestVoiceStop, showVoiceModal])

  // Keep listeningRef in sync when modal closes (backdrop click, auto-close, etc.)
  useEffect(() => {
    if (!showVoiceModal) listeningRef.current = false
  }, [showVoiceModal])

  useEffect(() => {
    const onUp = () => handleMicUp()
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    }
  }, [handleMicUp])

  const handleTabClick = (id: string) => {
    if (id === 'voice') {
      return
    }
    navigate(id as typeof currentScreen)
  }

  // Determine wake word dot color
  const wakeDotColor =
    !voiceEnabled || !wakeWordEnabled
      ? 'bg-muted-foreground/30'
      : wakeState === 'listening'
        ? 'bg-green-500'
        : wakeState === 'detected'
          ? 'bg-[#C66A2C] animate-pulse'
          : wakeState === 'unavailable'
            ? 'bg-amber-500'
            : wakeState === 'error'
              ? 'bg-red-500'
              : 'bg-muted-foreground/30'

  return (
    <nav className="marchand-bottom-bar fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-stone-900 border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === 'voice'
            ? false
            : currentScreen === tab.id
          const isVoice = tab.id === 'voice'

          return (
            <button
              key={tab.id}
              onClick={isVoice ? undefined : () => handleTabClick(tab.id)}
              onPointerDown={isVoice ? handleMicDown : undefined}
              onPointerUp={isVoice ? handleMicUp : undefined}
              onPointerCancel={isVoice ? handleMicUp : undefined}
              style={isVoice ? { touchAction: 'none' } : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-target transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C66A2C] focus-visible:ring-inset',
                isActive && 'text-[#C66A2C]',
                !isActive && !isVoice && 'text-muted-foreground',
                isVoice && 'text-[#C66A2C]'
              )}
            >
              {isVoice ? (
                <div className="relative">
                  <div className={cn(
                    'w-16 h-16 -mt-7 rounded-full bg-[#C66A2C] flex items-center justify-center shadow-lg transition-transform duration-200 active:scale-95',
                    soleilMode && 'w-[72px] h-[72px] -mt-8'
                  )}>
                    <img
                      src="/icon-only.png"
                      alt="Tata"
                      className="h-14 w-14 object-contain"
                    />
                  </div>
                  {/* Wake word indicator dot */}
                  <div className={cn(
                    'absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white transition-colors',
                    wakeDotColor
                  )} />
                </div>
              ) : (
                <tab.icon className={cn('w-5 h-5', soleilMode && 'w-6 h-6')} strokeWidth={isActive ? 2.5 : 1.5} />
              )}
              <span className={cn(
                'text-[10px] leading-tight',
                soleilMode && 'text-xs font-semibold',
                isVoice && '-mt-0.5'
              )}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
