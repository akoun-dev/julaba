'use client'

import { PROD_COLOR } from '@/lib/design-tokens'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Home, Mic, User, AlertTriangle, X } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useProducteurStore } from '@/lib/stores/producteur-store'
import { cn } from '@/lib/utils'
import { getWakeWordState, onWakeStateChange, type WakeWordState } from '@/lib/voice/wake-word'


// Même philosophie que la barre marchande : 3 onglets seulement
// (Accueil / Tata / Moi). Récoltes, commandes, stock et cycles restent
// accessibles depuis le menu rapide de l'accueil et la navigation vocale.
const tabs = [
  { id: 'prod-home' as const, label: 'Accueil', icon: Home },
  { id: 'voice' as const, label: 'Tata', icon: Mic },
  { id: 'prod-profil' as const, label: 'Moi', icon: User },
]

/**
 * Barre producteur — même grammaire d'interaction que la barre marchande
 * (audit P2/F9 : un seul pattern d'activation, une visibilité alignée sur
 * les réglages, une pastille d'état partout), à savoir le BASCULEMENT CLIC
 * généralisé par 0e14560 : premier clic — la modale s'ouvre et l'écoute
 * démarre ; second clic — l'écoute s'arrête. L'onglet reste toujours
 * visible (comme chez le marchand — le cacher quand « Voix activée » est
 * off rendait la fonction invisible au lieu d'expliciter qu'elle est
 * éteinte ; la modale reste ouvrable et explique l'état).
 */
export function ProdBottomBar() {
  const { currentScreen, navigate, openVoiceModal, voiceEnabled, wakeWordEnabled, setVoiceAutoRecord, requestVoiceStop, showVoiceModal, soleilMode } = useAppStore()
  const { syncError, clearSyncError } = useProducteurStore()
  const listeningRef = useRef(false)
  const [wakeState, setWakeState] = useState<WakeWordState>(getWakeWordState())

  // Subscribe to wake word state changes (pastille d'état, parité marchand)
  useEffect(() => {
    return onWakeStateChange(setWakeState)
  }, [])

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

  // Keep listeningRef in sync when modal closes (backdrop click, auto-close, etc.)
  useEffect(() => {
    if (!showVoiceModal) listeningRef.current = false
  }, [showVoiceModal])

  const handleTabClick = (id: string) => {
    if (id === 'voice') {
      return
    }
    navigate(id as typeof currentScreen)
  }

  // Determine wake word dot color — same semantics as marchand
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

            return (
              <button
                key={tab.id}
                onClick={isVoice ? handleMicToggle : () => { if (!isVoice) navigate(tab.id) }}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-target transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
                  isActive && 'font-medium',
                  !isActive && !isVoice && 'text-muted-foreground',
                  isVoice && 'focus-visible:ring-[#2E8B57]'
                )}
                aria-label={isVoice ? 'Assistant vocal Tata — appuyez pour parler' : undefined}
                aria-current={isActive ? 'page' : undefined}
              >
                {isVoice ? (
                  <div className="relative">
                    {/* UI-MP-009 — le FAB grossit en soleil, même grammaire que
                        la barre marchande (bottom-bar.tsx). */}
                    <div
                      className={cn(
                        'w-16 h-16 -mt-7 rounded-full flex items-center justify-center shadow-lg transition-transform duration-200 active:scale-95 text-white',
                        soleilMode && 'w-[72px] h-[72px] -mt-8',
                      )}
                      style={{ backgroundColor: PROD_COLOR }}
                    >
                      <img
                        src="/icon-only.png"
                        alt="Tata"
                        className="h-14 w-14 object-contain"
                      />
                    </div>
                    {/* Pastille d'état du mot d'appel — identique au marchand */}
                    <div className={cn(
                      'absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white transition-colors',
                      wakeDotColor
                    )} />
                  </div>
                ) : (
                  <tab.icon className={cn('w-5 h-5', soleilMode && 'w-6 h-6')} strokeWidth={isActive ? 2.5 : 1.5} />
                )}
                <span className={cn('text-xs leading-tight', isVoice && '-mt-0.5', soleilMode && 'text-sm font-semibold')}>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
