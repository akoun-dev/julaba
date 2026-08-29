'use client'

import { useCallback, useEffect, useRef } from 'react'
import { Home, ClipboardList, Mic, User } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore } from '@/lib/stores/identificateur-store'
import { cn } from '@/lib/utils'
import type { ScreenRoute } from '@/lib/stores/app-store'

const IDENT_COLOR = '#9F8170'

const tabs: {
  id: ScreenRoute | 'voice'
  label: string
  icon: typeof Home
}[] = [
  { id: 'ident-home', label: 'Accueil', icon: Home },
  { id: 'ident-suivi', label: 'Dossiers', icon: ClipboardList },
  { id: 'voice', label: 'Tata', icon: Mic },
  { id: 'ident-profil', label: 'Moi', icon: User },
]


// v4 - 3 tabs + a voice entry point, "Dossiers" matches the screen's own "Mes dossiers" title
export function IdentBottomBar() {
  const { currentScreen, navigate, soleilMode, openVoiceModal, voiceEnabled, setVoiceAutoRecord, requestVoiceStop, showVoiceModal } = useAppStore()
  const identDarkMode = useIdentificateurStore((state) => state.identDarkMode)
  const pressingRef = useRef(false)

  const handleTabClick = (id: ScreenRoute | 'voice') => {
    if (id === 'voice') return // handled by PTT handlers
    navigate(id)
  }

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

  useEffect(() => {
    const onUp = () => handleMicUp()
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchend', onUp)
    }
  }, [handleMicUp])

  return (
    <nav className={cn('ident-bottom-bar fixed bottom-0 left-0 right-0 z-50 border-t pb-[env(safe-area-inset-bottom)]', identDarkMode ? 'bg-stone-900 border-stone-700' : 'bg-white border-border')}>
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isVoice = tab.id === 'voice'
          if (isVoice && !voiceEnabled) return null
          const isActive = !isVoice && currentScreen === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              onMouseDown={isVoice ? handleMicDown : undefined}
              onTouchStart={isVoice ? handleMicDown : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-target transition-all duration-200',
                !isActive && !isVoice && 'text-muted-foreground',
                'cursor-pointer'
              )}
              style={isActive || isVoice ? { color: IDENT_COLOR } : undefined}
              aria-current={isActive ? 'page' : undefined}
            >
              {isVoice ? (
                <div className="w-12 h-12 -mt-5 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 active:scale-95 text-white" style={{ backgroundColor: IDENT_COLOR }}>
                  <Mic className="w-6 h-6" />
                </div>
              ) : (
                <tab.icon
                  className={cn(
                    'w-5 h-5 transition-all duration-200',
                    soleilMode && 'w-6 h-6',
                  )}
                  strokeWidth={isActive ? 2.5 : 1.5}
                />
              )}
              <span
                className={cn(
                  'text-[10px] leading-tight transition-all duration-200',
                  isVoice && '-mt-0.5',
                  soleilMode && 'text-xs font-semibold',
                )}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
