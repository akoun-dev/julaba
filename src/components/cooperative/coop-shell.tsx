'use client'

/**
 * MODE-974 (AUDIT-007 G1/G5/G6/G7/G8/G11) — Shell commun de l'espace
 * coopérative (rôle président), option C « hybride adaptatif » :
 *  - header commun : hamburger (mobile), identité de la coopérative, cloche
 *    de notifications (MODE-931) — fini le header recopié dans 7 écrans ;
 *  - navigation DOUBLE alimentée par UNE source (COOP_NAV_GROUPS, comme
 *    SIDEBAR_GROUPS alimente sidebar + palette BO) :
 *      · mobile  → drawer « Menu » (overlay + inert, pattern bo-layout:376-430),
 *      · ≥ lg    → sidebar permanente (comme le back-office) ;
 *    la bottom bar 5 onglets reste la navigation primaire mobile (rendue par
 *    page.tsx, masquée ≥ lg) ;
 *  - erreurs centralisées : `loadError` global (bannière réessayable) +
 *    `sectionsEnErreur` (chargement partiel) affichés sur TOUS les écrans
 *    et plus seulement sur l'accueil (G8) ;
 *  - cloche + NotificationsPanel portés par le shell ;
 *  - MODE-977 (G4) — recherche transversale : loupe dans le header (raccourci
 *    Ctrl+K / ⌘K conservé), palette ancrée sur les données réelles du store
 *    (coop-command-palette.tsx, index module pur coop-search.ts).
 *
 * Non inclus volontairement : garde de session serveur (CoopGate, livrée
 * MODE-975), thème sombre (Phase 6).
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Bell, Menu, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore } from '@/lib/stores/cooperative-store'
import { useNotificationsStore } from '@/lib/stores/notifications-store'
import { NotificationsPanel } from '@/components/shared/notifications-panel'
import { COOP_COLOR } from '@/lib/design-tokens'
import { COOP_NAV_GROUPS } from './coop-nav'
import { CoopIconProxy } from './coop-icon-proxy'
import { CoopBadge, CoopErrorBanner, CoopPartialBanner } from './coop-ui'
import { CoopCommandPalette } from './coop-command-palette'
import { cn } from '@/lib/utils'

/** Compteur réel associé à un écran de navigation (jamais décoratif). */
function useBadgeCoop(id: string): number {
  const adhesions = useCooperativeStore((s) => s.resume?.adhesionsEnAttente ?? 0)
  const ecritures = useCooperativeStore((s) => s.ecrituresEnAttente)
  const besoinsEnAttente = useCooperativeStore((s) => s.besoins.filter((b) => b.statut === 'en_attente').length)
  if (id === 'coop-membres') return adhesions
  if (id === 'coop-tresorerie') return ecritures
  if (id === 'coop-besoins') return besoinsEnAttente
  return 0
}

function CoopNavButton({ id, label, icon, onNavigate, isActive }: {
  id: string
  label: string
  icon: string
  onNavigate: (id: string) => void
  isActive: boolean
}) {
  const badge = useBadgeCoop(id)
  return (
    <button
      type="button"
      onClick={() => onNavigate(id)}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors min-h-[44px]',
        isActive
          ? 'font-semibold'
          : 'text-muted-foreground hover:bg-foreground/5'
      )}
      style={isActive ? { backgroundColor: `${COOP_COLOR}18`, color: COOP_COLOR } : undefined}
    >
      <CoopIconProxy name={icon} className="w-5 h-5 shrink-0" />
      <span className="flex-1 text-left truncate">{label}</span>
      <CoopBadge count={badge} />
    </button>
  )
}

function CoopNavList({ onNavigate, currentScreen }: {
  onNavigate: (id: string) => void
  currentScreen: string
}) {
  return (
    <>
      {COOP_NAV_GROUPS.map((group) => (
        <div key={group.id} className="mb-3">
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <CoopNavButton
                key={item.id}
                id={item.id}
                label={item.label}
                icon={item.icon}
                onNavigate={onNavigate}
                isActive={currentScreen === item.id}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

export function CoopScreenShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  // MODE-977 (G4) — état de la palette porté par le shell : la loupe du
  // header ouvre, la palette se referme elle-même après navigation.
  const [paletteOuverte, setPaletteOuverte] = useState(false)

  // Sélecteurs atomiques (convention S-14 — jamais de store entier).
  const currentScreen = useAppStore((s) => s.currentScreen)
  const navigate = useAppStore((s) => s.navigate)
  const merchantId = useAppStore((s) => s.merchantId)
  const cooperative = useCooperativeStore((s) => s.cooperative)
  const loadError = useCooperativeStore((s) => s.loadError)
  const sectionsEnErreur = useCooperativeStore((s) => s.sectionsEnErreur)
  const chargerEspaceCooperateur = useCooperativeStore((s) => s.chargerEspaceCooperateur)
  const unreadCount = useNotificationsStore((s) => s.unreadCount)

  // MODE-931 — la cloche est un espace fermé à l'ouverture d'un autre
  // écran (les deux overlays ne se chevauchent jamais).
  useEffect(() => {
    setMenuOpen(false)
  }, [currentScreen])

  const naviguer = (id: string) => {
    navigate(id as Parameters<typeof navigate>[0])
    setMenuOpen(false)
  }

  const rechargerTout = () => {
    if (merchantId) void chargerEspaceCooperateur(merchantId)
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#FDF3ED] to-[#F5E6D5] pb-24 lg:pb-10">
      {/* Header commun (fini l'habillage dupliqué — G11) */}
      <header className="sticky top-0 z-30 bg-card/85 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Ouvrir le menu"
              className="lg:hidden w-11 h-11 -ml-2 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-foreground/5"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: COOP_COLOR }}>
                Espace coopérative
              </p>
              <h1 className="text-sm font-bold text-foreground truncate leading-tight">
                {cooperative ? cooperative.nom : 'Ma coopérative'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-muted-foreground hover:text-foreground hover:bg-foreground/5"
              onClick={() => setPaletteOuverte(true)}
              aria-label="Rechercher (écrans, membres, produits, besoins)"
            >
              <Search className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-11 w-11 text-muted-foreground hover:text-foreground hover:bg-foreground/5"
              onClick={() => setShowNotifications(true)}
              aria-label={unreadCount > 0 ? `Voir les notifications (${unreadCount} non lues)` : 'Voir les notifications'}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-400" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Erreurs centralisées sur TOUS les écrans (G8) */}
      {loadError ? (
        <CoopErrorBanner message={loadError} onRetry={rechargerTout} />
      ) : (
        <CoopPartialBanner sections={sectionsEnErreur} />
      )}

      <div className="max-w-5xl mx-auto flex items-start">
        {/* Sidebar permanente ≥ lg (option C — comme le back-office) */}
        <aside
          className="hidden lg:block w-60 shrink-0 sticky top-14 self-start border-r border-border/70 py-4 pr-2"
          aria-label="Navigation de la coopérative"
        >
          <CoopNavList onNavigate={naviguer} currentScreen={currentScreen} />
        </aside>

        <main className="flex-1 min-w-0">{children}</main>
      </div>

      {/* Drawer mobile (overlay + inert — pattern bo-layout.tsx:376-430) */}
      <button
        type="button"
        aria-label="Fermer le menu"
        tabIndex={menuOpen ? 0 : -1}
        onClick={() => setMenuOpen(false)}
        className={cn(
          'fixed inset-0 z-40 bg-black/40 lg:hidden transition-opacity duration-200',
          menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />
      <aside
        aria-hidden={!menuOpen}
        inert={!menuOpen}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-card shadow-xl lg:hidden transition-transform duration-200 ease-out',
          menuOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-4 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: COOP_COLOR }}>
              Espace coopérative
            </p>
            <p className="text-sm font-bold text-foreground truncate leading-tight">
              {cooperative ? cooperative.nom : 'Navigation'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Fermer le menu"
            tabIndex={menuOpen ? 0 : -1}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Menu de la coopérative">
          <CoopNavList onNavigate={naviguer} currentScreen={currentScreen} />
        </nav>
      </aside>

      {/* MODE-931 — centre de notifications du président, porté par le shell */}
      <NotificationsPanel
        open={showNotifications}
        onOpenChange={setShowNotifications}
        accentColor={COOP_COLOR}
      />

      {/* MODE-977 (G4) — recherche transversale, sources réelles du store */}
      <CoopCommandPalette open={paletteOuverte} onOpenChange={setPaletteOuverte} />
    </div>
  )
}
