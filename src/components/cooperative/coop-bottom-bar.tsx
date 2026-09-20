'use client'

/**
 * MODE-921 — Barre basse de l'espace COOPÉRATIVE.
 * 3 onglets (Accueil / Membres / Moi) — même grammaire que la barre
 * producteur (audit F9 : un seul pattern d'activation). La trésorerie, le
 * stock commun et les achats groupés restent accessibles depuis les
 * actions de l'accueil. Bandeau syncError identique (statut honnête des
 * mutations synchronisées / en file / perdues).
 *
 * Pas d'onglet « Tata » en v1 : le parser vocal coopératif n'existe pas
 * encore (suivi dans .ai/TASKS.md) — la narration de navigation (lecture
 * seule) reste active via CoopScreenRouter.
 */

import { COOP_COLOR } from '@/lib/design-tokens'
import { Home, Users, User, AlertTriangle, X } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore } from '@/lib/stores/cooperative-store'
import { cn } from '@/lib/utils'

const tabs = [
  { id: 'coop-home' as const, label: 'Accueil', icon: Home },
  { id: 'coop-membres' as const, label: 'Membres', icon: Users },
  { id: 'coop-profil' as const, label: 'Moi', icon: User },
]

export function CoopBottomBar() {
  const { currentScreen, navigate } = useAppStore()
  const { syncError, clearSyncError } = useCooperativeStore()

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
      <nav className="coop-bottom-bar fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-stone-900 border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {tabs.map((tab) => {
            const isActive = currentScreen === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => navigate(tab.id)}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-target transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
                  isActive && 'font-medium',
                  !isActive && 'text-muted-foreground'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <tab.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
                <span className="text-xs leading-tight">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
