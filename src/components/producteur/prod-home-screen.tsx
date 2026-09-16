'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Wheat, ShoppingCart, Package, Sprout,
  TrendingUp, TrendingDown, Minus, AlertCircle, ChevronRight, Bell,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import { useProducteurStore, PRIX_MARCHE_REFERENCE } from '@/lib/stores/producteur-store'
import { useNotificationsStore } from '@/lib/stores/notifications-store'
import { NotificationsPanel } from '@/components/shared/notifications-panel'
import { formatFCFA } from '@/lib/voice/localIntent'
import { cn } from '@/lib/utils'

const PROD_COLOR = '#2E8B57'

// Même philosophie que l'accueil marchand : un seul CTA pleine largeur,
// puis un menu rapide 2×2. Récoltes, commandes, stock et cycles ne sont
// plus des onglets — ce sont des tuiles, ce qui permet une barre de
// navigation à 3 onglets identique à celle du marchand.
const NAV_TILES = [
  { screen: 'prod-recoltes' as const, label: 'Récoltes', desc: 'Déclarer et publier', icon: Wheat, chip: 'bg-[#2E8B57]' },
  { screen: 'prod-commandes' as const, label: 'Commandes', desc: 'Offres des acheteurs', icon: ShoppingCart, chip: 'bg-orange-600' },
  { screen: 'prod-stock' as const, label: 'Stock', desc: 'Mon entrepôt', icon: Package, chip: 'bg-sky-600' },
  { screen: 'prod-cycles' as const, label: 'Cycles', desc: 'Calendrier cultural', icon: Sprout, chip: 'bg-amber-600' },
]

export function ProdHomeScreen() {
  const { soleilMode, navigate, merchantName, merchantSexe } = useAppStore()
  // The identificateur records the actor's sexe at enrollment — honor it
  // when known; "Papa" stays the fallback for actors enrolled before this
  // field existed, or whose sexe was left unset.
  const honorific = merchantSexe === 'feminin' ? 'Maman' : 'Papa'
  const { getKpis, cycleEnCours, loadFromServer } = useProducteurStore()

  // Home is the producteur module's entry screen, so this is where a fresh
  // session picks up whatever récoltes/commandes/journal actually exist
  // server-side — every write already synced, but nothing ever read it back
  // before this, so the app just kept showing the seeded demo data forever.
  useEffect(() => {
    loadFromServer()
  }, [loadFromServer])

  const [showNotifications, setShowNotifications] = useState(false)
  // Live count is kept fresh by NotificationsWatcher, mounted once at the
  // page root (see use-notifications-watcher.ts) — no fetch needed here.
  const unreadCount = useNotificationsStore((s) => s.unreadCount)
  const kpis = getKpis()
  const [greeting] = useState(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Bonjour'
    if (hour < 17) return 'Bon après-midi'
    return 'Bonsoir'
  })
  const textClass = soleilMode ? 'text-black' : ''

  // Une seule alerte prix : la tendance la plus forte (l'ancienne version
  // répétait aussi ce prix dans la carte « Prix du marché » plus bas).
  const prixFort = Object.entries(PRIX_MARCHE_REFERENCE)
    .filter(([, info]) => info.tendance !== 'stable')
    .sort((a, b) => Math.abs(b[1].variationPct) - Math.abs(a[1].variationPct))[0]

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {/* Header — seul écran du module avec un header héro, comme chez le marchand */}
      <div
        className="px-4 pt-6 pb-8 rounded-b-3xl"
        style={{ background: `linear-gradient(to bottom right, ${PROD_COLOR}, #1F6B41)` }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <p className="text-white/80 text-xs">{greeting}</p>
            <h1 className={cn('text-white font-bold truncate', soleilMode ? 'text-2xl' : 'text-xl')}>
              {honorific} {merchantName || 'Kouadio'}
            </h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="relative text-white/80 hover:text-white hover:bg-white/10 shrink-0"
            onClick={() => setShowNotifications(true)}
            aria-label={unreadCount > 0 ? `Voir les notifications (${unreadCount} non lues)` : 'Voir les notifications'}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-400" />}
          </Button>
        </div>

        {/* Carte KPI glassmorphism — remplace la grille 2×2 de chiffres et la
            carte météo sans données : le chiffre qui compte (le stock) en
            héros, les trois autres en légende discrète. */}
        <Card className="bg-white/15 backdrop-blur-sm border-white/20">
          <CardContent className="p-4">
            <p className="text-white/80 text-xs">Stock disponible</p>
            <p className="text-white font-bold text-2xl fcfa">{kpis.stockDisponibleKg.toLocaleString('fr-FR')} kg</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              <span className="flex items-center gap-1.5 text-xs text-white/80">
                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                Récolté ce mois : {kpis.recolteMoisKg.toLocaleString('fr-FR')} kg
              </span>
              <span className="flex items-center gap-1.5 text-xs text-white/80">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                Vendu : {formatFCFA(kpis.venduFcfa)}
              </span>
              {kpis.commandesEnAttente > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-white/80">
                  <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                  {kpis.commandesEnAttente} commande{kpis.commandesEnAttente > 1 ? 's' : ''} à traiter
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CTA unique chevauchant la courbe du header — l'ancienne version avait
          deux CTA distincts pointant vers le même écran. */}
      <div className="px-4 -mt-4">
        <Button
          className="w-full h-12 text-white font-semibold text-base rounded-xl shadow-lg gap-2 bg-[#2E8B57] hover:bg-[#27794D]"
          onClick={() => navigate('prod-recoltes')}
        >
          <Wheat className="w-5 h-5" />
          Déclarer une récolte
        </Button>
      </div>

      {/* Menu rapide — pattern 2×2 du marchand */}
      <div className="px-4 mt-6">
        <h2 className={cn('font-semibold mb-3', textClass, soleilMode ? 'text-lg' : '')}>Menu rapide</h2>
        <div className="grid grid-cols-2 gap-3">
          {NAV_TILES.map((tile) => {
            const showDot = tile.screen === 'prod-commandes' && kpis.commandesEnAttente > 0
            return (
              <Card
                key={tile.screen}
                role="button"
                tabIndex={0}
                onClick={() => navigate(tile.screen)}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(tile.screen) }}
                className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
              >
                <CardContent className="p-2 flex flex-col items-center text-center">
                  <div className={cn('relative w-8 h-8 rounded-lg text-white flex items-center justify-center mb-1.5', tile.chip)}>
                    <tile.icon className="w-4 h-4" />
                    {showDot && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-white dark:border-stone-900" />
                    )}
                  </div>
                  <h3 className={cn('font-semibold text-xs', textClass)}>{tile.label}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{tile.desc}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Cycle cultural */}
      {cycleEnCours && (
        <div className="px-4 mt-6">
          <h2 className={cn('font-semibold mb-3', textClass, soleilMode ? 'text-lg' : '')}>Calendrier cultural</h2>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => navigate('prod-cycles')}
            onKeyDown={(e) => { if (e.key === 'Enter') navigate('prod-cycles') }}
            className="cursor-pointer hover:shadow-md transition-shadow"
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className={cn('font-medium text-sm truncate', textClass)}>
                  {cycleEnCours.produit} (J+{cycleEnCours.joursEcoules}/{cycleEnCours.joursTotal})
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{
                    width: `${Math.min(100, Math.round((cycleEnCours.joursEcoules / cycleEnCours.joursTotal) * 100))}%`,
                    backgroundColor: PROD_COLOR,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground truncate">
                Phase : {cycleEnCours.phase} · Récolte prévue le{' '}
                {new Date(cycleEnCours.dateRecoltePrevue).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Alertes — la section n'existe que s'il y a quelque chose à signaler,
          plus de carte « aucune alerte » permanente ni de doublon avec le KPI. */}
      {(kpis.commandesEnAttente > 0 || prixFort) && (
        <div className="px-4 mt-6">
          <h2 className={cn('font-semibold mb-3', textClass, soleilMode ? 'text-lg' : '')}>Alertes</h2>
          <div className="space-y-2">
            {kpis.commandesEnAttente > 0 && (
              <Card
                role="button"
                tabIndex={0}
                onClick={() => navigate('prod-commandes')}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate('prod-commandes') }}
                className="cursor-pointer border-orange-200 bg-orange-50 dark:border-orange-800/70 dark:bg-orange-950/40 hover:shadow-md transition-shadow"
              >
                <CardContent className="p-3 flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
                  <span className={cn('text-sm flex-1', textClass)}>
                    {kpis.commandesEnAttente} commande{kpis.commandesEnAttente > 1 ? 's' : ''} à traiter
                  </span>
                  <ChevronRight className="w-4 h-4 text-orange-400 shrink-0" />
                </CardContent>
              </Card>
            )}
            {prixFort && (
              <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-800/70 dark:bg-emerald-950/40">
                <CardContent className="p-3 flex items-center gap-2.5">
                  {prixFort[1].tendance === 'hausse' ? (
                    <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500 shrink-0" />
                  )}
                  <span className={cn('text-sm', textClass)}>
                    Prix {prixFort[0].toLowerCase()} {prixFort[1].tendance === 'hausse' ? 'en hausse' : 'en baisse'} ({formatFCFA(prixFort[1].prixFcfaKg)}/kg)
                  </span>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Prix du marché */}
      <div className="px-4 mt-6">
        <h2 className={cn('font-semibold mb-3', textClass, soleilMode ? 'text-lg' : '')}>Prix du marché</h2>
        <Card>
          <CardContent className="p-4 divide-y">
            {Object.entries(PRIX_MARCHE_REFERENCE).map(([produit, info]) => (
              <div key={produit} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                <span className={cn('text-sm', textClass)}>{produit}</span>
                <div className="flex items-center gap-2">
                  <span className={cn('text-sm font-semibold fcfa', textClass)}>{formatFCFA(info.prixFcfaKg)}/kg</span>
                  <span
                    className={cn(
                      'flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full',
                      info.tendance === 'hausse' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300',
                      info.tendance === 'baisse' && 'bg-red-100 text-red-600 dark:bg-red-900/60 dark:text-red-300',
                      info.tendance === 'stable' && 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                    )}
                  >
                    {info.tendance === 'hausse' && <TrendingUp className="w-3 h-3" />}
                    {info.tendance === 'baisse' && <TrendingDown className="w-3 h-3" />}
                    {info.tendance === 'stable' && <Minus className="w-3 h-3" />}
                    {info.variationPct !== 0 ? `${info.variationPct > 0 ? '+' : ''}${info.variationPct}%` : 'stable'}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <NotificationsPanel open={showNotifications} onOpenChange={setShowNotifications} accentColor={PROD_COLOR} soleilMode={soleilMode} />
    </div>
  )
}
