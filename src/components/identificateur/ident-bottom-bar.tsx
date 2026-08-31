'use client'

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

// v4 - 3 tabs + a voice entry point. The voice ("Tata") tab is present but
// permanently disabled here, per PD-007 (product-judgment.md): field agents
// use company-issued devices and may be in formal settings, so voice input
// is inappropriate for this role. No handler, no STT call, nothing to open
// — this is the one place that could reach identificateur voice, since
// there's no wake word for this role and page.tsx no longer mounts a voice
// modal for it at all.
export function IdentBottomBar() {
  const { currentScreen, navigate, soleilMode } = useAppStore()
  const identDarkMode = useIdentificateurStore((state) => state.identDarkMode)

  const handleTabClick = (id: ScreenRoute | 'voice') => {
    if (id === 'voice') return
    navigate(id)
  }

  return (
    <nav className={cn('ident-bottom-bar fixed bottom-0 left-0 right-0 z-50 border-t pb-[env(safe-area-inset-bottom)]', identDarkMode ? 'bg-stone-900 border-stone-700' : 'bg-white border-border')}>
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isVoice = tab.id === 'voice'
          const isActive = !isVoice && currentScreen === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              disabled={isVoice}
              aria-disabled={isVoice || undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-target transition-colors duration-200',
                !isActive && !isVoice && 'text-muted-foreground',
                isVoice ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
              )}
              style={isActive ? { color: IDENT_COLOR } : undefined}
              aria-current={isActive ? 'page' : undefined}
            >
              {isVoice ? (
                <div className="w-12 h-12 -mt-5 rounded-full flex items-center justify-center shadow-lg text-white" style={{ backgroundColor: IDENT_COLOR }}>
                  <Mic className="w-6 h-6" />
                </div>
              ) : (
                <tab.icon
                  className={cn(
                    'w-5 h-5 transition-transform duration-200',
                    soleilMode && 'w-6 h-6',
                  )}
                  strokeWidth={isActive ? 2.5 : 1.5}
                />
              )}
              <span
                className={cn(
                  'text-[10px] leading-tight transition-colors duration-200',
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
