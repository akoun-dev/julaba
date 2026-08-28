'use client'

import { Home, Users, ClipboardList, User } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { cn } from '@/lib/utils'
import type { ScreenRoute } from '@/lib/stores/app-store'

const IDENT_COLOR = '#9F8170'

const tabs: {
  id: ScreenRoute
  label: string
  icon: typeof Home
  disabled?: boolean
  tooltip?: string
}[] = [
  { id: 'ident-home', label: 'Accueil', icon: Home },
  { id: 'ident-acteurs', label: 'Acteurs', icon: Users },
  { id: 'ident-suivi', label: 'Suivi', icon: ClipboardList },
  { id: 'ident-profil', label: 'Moi', icon: User, disabled: false },
]


// v2 - 4 tabs (no Micro)
export function IdentBottomBar() {
  const { currentScreen, navigate, soleilMode } = useAppStore()

  const handleTabClick = (id: ScreenRoute) => {
    navigate(id)
  }

  return (
    <nav className="ident-bottom-bar fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = currentScreen === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-target transition-all duration-200',
                isActive && `text-[${IDENT_COLOR}]`,
                !isActive && 'text-muted-foreground',
                'cursor-pointer'
              )}
            >
              <tab.icon
                className={cn(
                  'w-5 h-5 transition-all duration-200',
                  soleilMode && 'w-6 h-6',
                )}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              <span
                className={cn(
                  'text-[10px] leading-tight transition-all duration-200',
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
