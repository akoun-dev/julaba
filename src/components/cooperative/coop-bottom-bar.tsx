'use client'

/**
 * MODE-974 (AUDIT-007 G1/G2) — Barre basse de l'espace COOPÉRATIVE,
 * élargie de 3 à 5 onglets avec BADGES de comptage réels :
 * Accueil · Membres (adhésions en attente) · Trésorerie (écritures à
 * valider) · Gestion (besoins en attente) · Profil.
 *
 * Le stock commun et les achats groupés vivent sous l'onglet « Gestion »
 * (hub coop-gestion) ET en accès direct dans le drawer/sidebar (option C).
 * La barre est masquée ≥ lg : la sidebar permanente prend le relais
 * (comme au BO, une seule navigation primaire par taille d'écran).
 *
 * Badges : compteurs SERVEUR réels (resume.adhesionsEnAttente,
 * ecrituresEnAttente — MODE-974, besoins en_attente) — jamais décoratifs
 * (leçon du ticker BO, AUDIT-007 §2.4).
 *
 * Bandeau syncError inchangé (statut honnête synced|queued|lost).
 * Pas d'onglet « Tata » en v1 : parser vocal coopératif inexistant (suivi
 * .ai/TASKS.md) — narration lecture seule via CoopScreenRouter.
 */

import { COOP_COLOR } from '@/lib/design-tokens'
import { Home, Users, Wallet, LayoutGrid, User, AlertTriangle, X } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore } from '@/lib/stores/cooperative-store'
import { CoopBadge } from './coop-ui'
import { cn } from '@/lib/utils'

export function CoopBottomBar() {
  // Sélecteurs atomiques (convention S-14) — la version 3 onglets
  // déstructurait le store ENTIER (hors convention), corrigé au passage.
  const currentScreen = useAppStore((s) => s.currentScreen)
  const navigate = useAppStore((s) => s.navigate)
  const syncError = useCooperativeStore((s) => s.syncError)
  const clearSyncError = useCooperativeStore((s) => s.clearSyncError)
  const adhesionsEnAttente = useCooperativeStore((s) => s.resume?.adhesionsEnAttente ?? 0)
  const ecrituresEnAttente = useCooperativeStore((s) => s.ecrituresEnAttente)
  const besoinsEnAttente = useCooperativeStore((s) => s.besoins.filter((b) => b.statut === 'en_attente').length)

  const tabs = [
    { id: 'coop-home' as const, label: 'Accueil', icon: Home, badge: 0 },
    { id: 'coop-membres' as const, label: 'Membres', icon: Users, badge: adhesionsEnAttente },
    { id: 'coop-tresorerie' as const, label: 'Trésorerie', icon: Wallet, badge: ecrituresEnAttente },
    { id: 'coop-gestion' as const, label: 'Gestion', icon: LayoutGrid, badge: besoinsEnAttente },
    { id: 'coop-profil' as const, label: 'Profil', icon: User, badge: 0 },
  ]

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
      <nav
        aria-label="Navigation coopérative"
        className="coop-bottom-bar fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-stone-900 border-t border-border pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {tabs.map((tab) => {
            const isActive = currentScreen === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => navigate(tab.id)}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-target transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
                  isActive && 'font-medium',
                  !isActive && 'text-muted-foreground'
                )}
                aria-label={tab.badge > 0 ? `${tab.label} (${tab.badge} en attente)` : tab.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="relative">
                  <tab.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
                  <CoopBadge count={tab.badge} className="absolute -top-1.5 -right-2.5" />
                </span>
                <span className="text-xs leading-tight">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
