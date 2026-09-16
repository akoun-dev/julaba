'use client'

import { useCallback, useEffect, useRef } from 'react'
import { Home, Mic, User, AlertTriangle, X } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useProducteurStore } from '@/lib/stores/producteur-store'
import { cn } from '@/lib/utils'

const PROD_COLOR = '#2E8B57'

// Même philosophie que la barre marchande : 3 onglets seulement
// (Accueil / Tata / Moi). Récoltes, commandes, stock et cycles restent
// accessibles depuis le menu rapide de l'accueil et la navigation vocale.
const tabs = [
  { id: 'prod-home' as const, label: 'Accueil', icon: Home },
  { id: 'voice' as const, label: 'Tata', icon: Mic },
  { id: 'prod-profil' as const, label: 'Moi', icon: User },
]

export function ProdBottomBar() {
  const { currentScreen, navigate, openVoiceModal, voiceEnabled, setVoiceAutoRecord, requestVoiceStop, showVoiceModal } = useAppStore()
  const { syncError, clearSyncError } = useProducteurStore()
  const listeningRef = useRef(false)

  const handleMicToggle = useCallback(() => {
    if (!listeningRef.current) {
      listeningRef.current = true
      openVoiceModal()
      setVoiceAutoRecord(true)
    } else {
      listeningRef.current = false
      requestVoiceStop()
    }
  }, [openVoiceModal, setVoiceAutoRecord, requestVoiceStop])

  // Keep listeningRef in sync when modal closes
  useEffect(() => {
    if (!showVoiceModal) listeningRef.current = false
  }, [showVoiceModal])

  return (
    <>
      {syncError && (
        <div
          role="alert"
          className="fixed left-2 right-2 z-50 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 shadow-md dark:bg-red-950/50 dark:border-red-800/70 dark:text-red-300"
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{syncError}</span>
          <button onClick={clearSyncError} aria-label="Fermer l'alerte" className="shrink-0 touch-target">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <nav className="prod-bottom-bar fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-stone-900 border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {tabs.map((tab) => {
            const isVoice = tab.id === 'voice'
            const isActive = !isVoice && currentScreen === tab.id

            if (isVoice && !voiceEnabled) return null

            return (
              <button
                key={tab.id}
                onClick={isVoice ? handleMicToggle : () => { if (!isVoice) navigate(tab.id) }}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-target transition-colors',
                  isActive && 'font-medium',
                  !isActive && !isVoice && 'text-muted-foreground'
                )}
                style={isActive || isVoice ? { color: PROD_COLOR } : undefined}
                aria-current={isActive ? 'page' : undefined}
              >
                {isVoice ? (
                  <div
                    className="w-16 h-16 -mt-7 rounded-full flex items-center justify-center shadow-lg transition-transform duration-200 active:scale-95 text-white"
                    style={{ backgroundColor: PROD_COLOR }}
                  >
                    <Mic className="w-7 h-7" />
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
