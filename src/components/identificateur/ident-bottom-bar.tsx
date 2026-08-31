'use client'

import { Home, ClipboardList, User } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore } from '@/lib/stores/identificateur-store'
import { cn } from '@/lib/utils'
import type { ScreenRoute } from '@/lib/stores/app-store'

const IDENT_COLOR = '#9F8170'

const tabs: {
  id: ScreenRoute
  label: string
  icon: typeof Home
}[] = [
  { id: 'ident-home', label: 'Accueil', icon: Home },
  { id: 'ident-suivi', label: 'Dossiers', icon: ClipboardList },
  { id: 'ident-profil', label: 'Moi', icon: User },
]

export function IdentBottomBar() {
  const { currentScreen, navigate, soleilMode } = useAppStore()
  const identDarkMode = useIdentificateurStore((state) => state.identDarkMode)

  return (
    <nav className={cn('ident-bottom-bar fixed bottom-0 left-0 right-0 z-50 border-t pb-[env(safe-area-inset-bottom)]', identDarkMode ? 'bg-stone-900 border-stone-700' : 'bg-white border-border')}>
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = currentScreen === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-target transition-colors duration-200',
                !isActive && 'text-muted-foreground',
                'cursor-pointer'
              )}
              style={isActive ? { color: IDENT_COLOR } : undefined}
              aria-current={isActive ? 'page' : undefined}
            >
              <tab.icon
                className={cn(
                  'w-5 h-5 transition-transform duration-200',
                  soleilMode && 'w-6 h-6',
                )}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              <span
                className={cn(
                  'text-[10px] leading-tight transition-colors duration-200',
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
