'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Wheat, Wallet, Package, ShoppingCart,
  CloudSun, Camera, TrendingUp, TrendingDown,
  Minus, AlertCircle, ChevronRight, Bell,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import { useProducteurStore, PRIX_MARCHE_REFERENCE } from '@/lib/stores/producteur-store'
import { useNotificationsStore } from '@/lib/stores/notifications-store'
import { NotificationsPanel } from '@/components/shared/notifications-panel'
import { formatFCFA } from '@/lib/voice/localIntent'
import { cn } from '@/lib/utils'

const PROD_COLOR = '#2E8B57'

export function ProdHomeScreen() {
  const { soleilMode, navigate, merchantName, merchantSexe } = useAppStore()
  // The identificateur records the actor's sexe at enrollment — honor it
  // when known; "Papa" stays the fallback for actors enrolled before this
  // field existed, or whose sexe was left unset.
  const honorific = merchantSexe === 'feminin' ? 'Maman' : 'Papa'
  const { getKpis, cycleEnCours, commandes, loadFromServer } = useProducteurStore()

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
  const commandesEnAttente = commandes.filter((c) => c.statut === 'a_traiter').length
  const textClass = soleilMode ? 'text-black' : ''

  return (
    <div className="screen-enter pb-24">
      {/* Header */}
      <div
        className="px-4 pt-6 pb-8 rounded-b-3xl"
        style={{ background: `linear-gradient(to bottom right, ${PROD_COLOR}, #1F6B41)` }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-white/80 text-xs">{greeting}</p>
            <h1 className={`text-white font-bold ${soleilMode ? 'text-2xl' : 'text-xl'}`}>
              {honorific} {merchantName || 'Kouadio'}
            </h1>
            <p className="text-white/70 text-xs mt-0.5">{merchantName ? `Exploitation de ${merchantName}` : 'Exploitation'}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="relative text-white/80 hover:text-white hover:bg-white/10"
              onClick={() => setShowNotifications(true)}
              aria-label={unreadCount > 0 ? `Voir les notifications (${unreadCount} non lues)` : 'Voir les notifications'}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-400" />}
            </Button>
          </div>
        </div>

        {/* Weather info — data fetched from a real API in production.
            Until then, show a placeholder that does not give false
            agricultural advice. */}
        <Card className="bg-white/15 backdrop-blur-sm border-white/20">
          <CardContent className="p-3 flex items-center gap-2">
            <CloudSun className="w-5 h-5 text-white/70" />
            <span className="text-white/70 text-xs">
              Informations météo bientôt disponibles
            </span>
          </CardContent>
        </Card>
      </div>

      {/* KPIs */}
      <div className="px-4 mt-4">
        <h3 className={cn('text-sm font-semibold text-muted-foreground mb-2', soleilMode && 'text-base')}>
          Mes chiffres
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${PROD_COLOR}15` }}>
                <Wheat className="w-5 h-5" style={{ color: PROD_COLOR }} />
              </div>
              <div className="min-w-0">
                <p className={`font-bold ${textClass}`}>{kpis.recolteMoisKg.toLocaleString('fr-FR')} kg</p>
                <p className="text-[11px] text-muted-foreground">Récolté ce mois</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className={`font-bold fcfa ${textClass}`}>{formatFCFA(kpis.venduFcfa)}</p>
                <p className="text-[11px] text-muted-foreground">Vendu</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-sky-600" />
              </div>
              <div className="min-w-0">
                <p className={`font-bold ${textClass}`}>{kpis.stockDisponibleKg.toLocaleString('fr-FR')} kg</p>
                <p className="text-[11px] text-muted-foreground">Stock dispo</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                <ShoppingCart className="w-5 h-5 text-orange-600" />
              </div>
              <div className="min-w-0">
                <p className={`font-bold ${textClass}`}>{kpis.commandesEnAttente}</p>
                <p className="text-[11px] text-muted-foreground">Commandes en attente</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-4 mt-5 space-y-2">
        <Button
          className="w-full h-14 text-white font-semibold text-base gap-2"
          style={{ backgroundColor: PROD_COLOR }}
          onClick={() => navigate('prod-recoltes')}
        >
          <Wheat className="w-5 h-5" />
          Déclarer une récolte
        </Button>
        <Button
          variant="outline"
          className="w-full h-12 font-medium gap-2"
          style={{ borderColor: PROD_COLOR, color: PROD_COLOR }}
          onClick={() => navigate('prod-recoltes')}
        >
          <Camera className="w-4 h-4" />
          Publier sur le marché
        </Button>
      </div>

      {/* Cycle cultural */}
      {cycleEnCours && (
        <div className="px-4 mt-5">
          <h3 className={cn('text-sm font-semibold text-muted-foreground mb-2', soleilMode && 'text-base')}>
            Calendrier cultural
          </h3>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => navigate('prod-cycles')}
            onKeyDown={(e) => { if (e.key === 'Enter') navigate('prod-cycles') }}
            className="cursor-pointer hover:shadow-md transition-shadow"
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`font-medium text-sm ${textClass}`}>
                  Cycle en cours : {cycleEnCours.produit} (J+{cycleEnCours.joursEcoules}/{cycleEnCours.joursTotal})
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
              <p className="text-xs text-muted-foreground">
                Phase : {cycleEnCours.phase} · Récolte prévue le{' '}
                {new Date(cycleEnCours.dateRecoltePrevue).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Alerts */}
      <div className="px-4 mt-5">
        <h3 className={cn('text-sm font-semibold text-muted-foreground mb-2', soleilMode && 'text-base')}>
          Alertes
        </h3>
        <div className="space-y-2">
          {commandesEnAttente > 0 && (
            <Card className="border-orange-200 bg-orange-50 dark:border-orange-800/70 dark:bg-orange-950/40">
              <CardContent className="p-3 flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
                <span className={`text-sm ${textClass}`}>
                  {commandesEnAttente} nouvelle{commandesEnAttente > 1 ? 's' : ''} commande{commandesEnAttente > 1 ? 's' : ''} à traiter
                </span>
              </CardContent>
            </Card>
          )}
          {Object.entries(PRIX_MARCHE_REFERENCE)
            .filter(([, info]) => info.tendance !== 'stable')
            .slice(0, 1)
            .map(([produit, info]) => (
              <Card key={produit} className="border-emerald-200 bg-emerald-50 dark:border-emerald-800/70 dark:bg-emerald-950/40">
                <CardContent className="p-3 flex items-center gap-2.5">
                  {info.tendance === 'hausse' ? (
                    <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500 shrink-0" />
                  )}
                  <span className={`text-sm ${textClass}`}>
                    Prix {produit.toLowerCase()} {info.tendance === 'hausse' ? 'en hausse' : 'en baisse'} ({formatFCFA(info.prixFcfaKg)}/kg)
                  </span>
                </CardContent>
              </Card>
            ))}
          {commandesEnAttente === 0 && (
            <Card>
              <CardContent className="p-3 flex items-center gap-2.5 text-muted-foreground">
                <Minus className="w-4 h-4 shrink-0" />
                <span className="text-sm">Aucune alerte pour le moment</span>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Prix du marché */}
      <div className="px-4 mt-5">
        <h3 className={cn('text-sm font-semibold text-muted-foreground mb-2', soleilMode && 'text-base')}>
          Prix du marché
        </h3>
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
