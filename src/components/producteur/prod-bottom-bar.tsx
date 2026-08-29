'use client'

import { Home, Wheat, ShoppingCart, Package, User } from 'lucide-react'
import { useAppStore, type ScreenRoute } from '@/lib/stores/app-store'
import { cn } from '@/lib/utils'

const tabs = [
  { id: 'prod-home' as const, label: 'Accueil', icon: Home },
  { id: 'prod-recoltes' as const, label: 'Récoltes', icon: Wheat },
  { id: 'prod-commandes' as const, label: 'Commandes', icon: ShoppingCart },
  { id: 'prod-stock' as const, label: 'Stock', icon: Package },
  { id: 'prod-profil' as const, label: 'Moi', icon: User },
]

export function ProdBottomBar() {
  const { currentScreen, navigate } = useAppStore()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = currentScreen === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.id as ScreenRoute)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-target transition-colors',
                isActive ? 'text-[#2E8B57]' : 'text-muted-foreground'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <tab.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
              <span className="text-[10px] leading-tight">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
