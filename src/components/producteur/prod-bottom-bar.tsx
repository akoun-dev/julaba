'use client'

import { useCallback, useEffect, useRef } from 'react'
import { Home, Wheat, ShoppingCart, Mic, Package, User, AlertTriangle, X } from 'lucide-react'
import { useAppStore, type ScreenRoute } from '@/lib/stores/app-store'
import { useProducteurStore } from '@/lib/stores/producteur-store'
import { cn } from '@/lib/utils'

const PROD_COLOR = '#2E8B57'

const tabs = [
  { id: 'prod-home' as const, label: 'Accueil', icon: Home },
  { id: 'prod-recoltes' as const, label: 'Récoltes', icon: Wheat },
  { id: 'voice' as const, label: 'Tata', icon: Mic },
  { id: 'prod-commandes' as const, label: 'Commandes', icon: ShoppingCart },
  { id: 'prod-stock' as const, label: 'Stock', icon: Package },
  { id: 'prod-profil' as const, label: 'Moi', icon: User },
]

export function ProdBottomBar() {
  const { currentScreen, navigate, openVoiceModal, voiceEnabled, setVoiceAutoRecord, requestVoiceStop, showVoiceModal } = useAppStore()
  const { syncError, clearSyncError } = useProducteurStore()
  const pressingRef = useRef(false)

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
    <>
      {syncError && (
        <div
          role="alert"
          className="fixed left-2 right-2 z-50 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 shadow-md"
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{syncError}</span>
          <button onClick={clearSyncError} aria-label="Fermer l'alerte" className="shrink-0 touch-target">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isVoice = tab.id === 'voice'
          const isActive = !isVoice && currentScreen === tab.id

          if (isVoice && !voiceEnabled) return null

          return (
            <button
              key={tab.id}
              onClick={() => { if (!isVoice) navigate(tab.id as ScreenRoute) }}
              onMouseDown={isVoice ? handleMicDown : undefined}
              onTouchStart={isVoice ? handleMicDown : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-target transition-colors',
                isActive && 'font-medium',
                !isActive && !isVoice && 'text-muted-foreground'
              )}
              style={isActive || isVoice ? { color: PROD_COLOR } : undefined}
              aria-current={isActive ? 'page' : undefined}
            >
              {isVoice ? (
                <div className="w-12 h-12 -mt-5 rounded-full flex items-center justify-center shadow-lg transition-transform duration-200 active:scale-95 text-white" style={{ backgroundColor: PROD_COLOR }}>
                  <Mic className="w-6 h-6" />
                </div>
              ) : (
                <tab.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
              )}
              <span className={cn('text-[10px] leading-tight', isVoice && '-mt-0.5')}>{tab.label}</span>
            </button>
          )
        })}
      </div>
      </nav>
    </>
  )
}
