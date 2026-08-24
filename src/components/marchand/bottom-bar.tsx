'use client'

import { Home, ShoppingBag, Mic, Package, User } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { cn } from '@/lib/utils'

const tabs = [
  { id: 'home' as const, label: 'Accueil', icon: Home },
  { id: 'marche' as const, label: 'Marché', icon: ShoppingBag },
  { id: 'voice' as const, label: 'Tata', icon: Mic },
  { id: 'commandes' as const, label: 'Commandes', icon: Package },
  { id: 'profil' as const, label: 'Moi', icon: User },
]

export function BottomBar() {
  const { currentScreen, navigate, openVoiceModal, soleilMode } = useAppStore()

  const handleTabClick = (id: string) => {
    if (id === 'voice') {
      openVoiceModal()
      return
    }
    navigate(id as typeof currentScreen)
  }

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
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-target transition-colors',
                isActive && 'text-[#C66A2C]',
                !isActive && !isVoice && 'text-muted-foreground',
                isVoice && 'text-white'
              )}
            >
              {isVoice ? (
                <div className={cn(
                  'w-12 h-12 -mt-5 rounded-full bg-[#C66A2C] flex items-center justify-center shadow-lg',
                  soleilMode && 'w-14 h-14'
                )}>
                  <Mic className="w-6 h-6" />
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
