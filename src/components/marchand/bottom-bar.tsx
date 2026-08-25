'use client'

import { Home, ShoppingBag, Mic, MicOff, Package, User } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { cn } from '@/lib/utils'
import { getWakeWordState, onWakeStateChange, type WakeWordState } from '@/lib/voice/wake-word'
import { useState, useEffect, useCallback, useRef } from 'react'

const tabs = [
  { id: 'home' as const, label: 'Accueil', icon: Home },
  { id: 'marche' as const, label: 'Marché', icon: ShoppingBag },
  { id: 'voice' as const, label: 'Tata', icon: Mic },
  { id: 'commandes' as const, label: 'Commandes', icon: Package },
  { id: 'profil' as const, label: 'Moi', icon: User },
]

export function BottomBar() {
  const { currentScreen, navigate, openVoiceModal, soleilMode, wakeWordEnabled, voiceEnabled, setVoiceAutoRecord, requestVoiceStop, showVoiceModal } = useAppStore()
  const [wakeState, setWakeState] = useState<WakeWordState>(getWakeWordState())
  const pressingRef = useRef(false)

  // Subscribe to wake word state changes
  useEffect(() => {
    return onWakeStateChange(setWakeState)
  }, [])

  const handleMicDown = useCallback(() => {
    pressingRef.current = true
    setVoiceAutoRecord(true)
    openVoiceModal()
  }, [openVoiceModal, setVoiceAutoRecord])

  const handleMicUp = useCallback(() => {
    if (!pressingRef.current) return
    pressingRef.current = false
    if (showVoiceModal) {
      requestVoiceStop()
    }
  }, [showVoiceModal, requestVoiceStop])

  const handleTabClick = (id: string) => {
    if (id === 'voice') return // handled by PTT handlers
    navigate(id as typeof currentScreen)
  }

  // Global mouseup/touchend to catch releases that leave the button
  useEffect(() => {
    const onUp = () => handleMicUp()
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchend', onUp)
    }
  }, [handleMicUp])

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
            : 'bg-muted-foreground/30'

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === 'voice'
            ? false
            : currentScreen === tab.id
          const isVoice = tab.id === 'voice'

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              onMouseDown={isVoice ? handleMicDown : undefined}
              onTouchStart={isVoice ? handleMicDown : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-target transition-colors',
                isActive && 'text-[#C66A2C]',
                !isActive && !isVoice && 'text-muted-foreground',
                isVoice && 'text-[#C66A2C]'
              )}
            >
              {isVoice ? (
                <div className="relative">
                  <div className={cn(
                    'w-12 h-12 -mt-5 rounded-full bg-[#C66A2C] flex items-center justify-center shadow-lg transition-all duration-200 active:scale-95',
                    soleilMode && 'w-14 h-14'
                  )}>
                    <Mic className="w-6 h-6" />
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
