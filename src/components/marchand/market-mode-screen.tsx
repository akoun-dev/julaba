'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Languages,
  MapPin,
  Package,
  RefreshCw,
  ShoppingCart,
  Store,
  TrendingDown,
  TrendingUp,
  Truck,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { useNetworkStore } from '@/lib/stores/network-store'
import { useStockStore } from '@/lib/stores/stock-store'
import { useVoiceLanguageStore } from '@/lib/stores/voice-language-store'
import { captureMarketLocation } from '@/lib/market-mode-location'
import { flushAllPendingSync, getPendingSyncEntries } from '@/lib/offline-db'
import { formatFCFA } from '@/lib/utils'
import { useMarketModeStore, type MarketLocationChoice } from '@/lib/stores/market-mode-store'
import { useSellingPointsStore } from '@/lib/market-mode/selling-points-store'
import { activeOrDefault, isPointArchived } from '@/lib/market-mode/selling-point'
// MODE-910 (§25) — « Ma journée en chiffres » : agrégats purs partagés.
import {
  buildDayStats,
  yesterdayRevenueFromServerSales,
  yesterdayRevenueFromSession,
  yesterdayUtcRange,
  type ServerSaleMinimal,
} from '@/lib/market-mode/day-stats'
import { collectTodaySales } from '@/lib/voice/day-summary'
import { useCreditsStore } from '@/lib/market-mode/credits-store'

const LANGUAGE_OPTIONS = [
  { id: 'fr' as const, label: 'Français', available: true },
  { id: 'bci' as const, label: 'Baoulé', available: true },
  { id: 'dioula', label: 'Dioula / Jula', available: false },
  { id: 'senoufo', label: 'Sénoufo', available: false },
  { id: 'bete', label: 'Bété', available: false },
]

export function MarketModeScreen() {
  const { goBack, navigate, toggleDaySummary, soleilMode, merchantId } = useAppStore()
  const connected = useNetworkStore((state) => state.connected)
  const { todaySales, todaySalesCount } = useCaisseStore()
  const products = useStockStore((state) => state.products)
  // INCIDIENT-006 — `useStockStore((s) => s.getLowStockProducts())` créait un
  // nouveau tableau à chaque snapshot → « getSnapshot should be cached »
  // (boucle React infinie) : on sélectionne les données puis on dérive en
  // useMemo, hors du sélecteur.
  const lowStock = useMemo(() => useStockStore.getState().getLowStockProducts(), [products])
  const market = useMarketModeStore()
  const setVoiceLanguage = useVoiceLanguageStore((state) => state.setVoiceLanguage)
  // MODE-908 (§18) — le point de vente actif est VISIBLE sur la carte
  // journée. Données puis dérivation en useMemo (INCIDENT-006 : jamais un
  // objet neuf par snapshot dans le sélecteur) ; le point réel « Boutique »
  // est créé au premier usage via un effet (activePoint mute le store).
  const sellingPoints = useSellingPointsStore((state) => state.points)
  const activePointClientId = useSellingPointsStore((state) => state.activePointClientId)
  const activeSellingPoint = useMemo(
    () => activeOrDefault(Object.values(sellingPoints), activePointClientId),
    [sellingPoints, activePointClientId],
  )
  useEffect(() => {
    useSellingPointsStore.getState().activePoint()
  }, [])
  const [marketNameInput, setMarketNameInput] = useState(market.marketName)
  const [locationError, setLocationError] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)

  // ── MODE-910 (§25) — « Ma journée en chiffres » ─────────────────────
  // Dérivations useMemo HORS sélecteurs zustand (INCIDENT-006 : jamais
  // une fonction ou un objet neuf dans un sélecteur). Offline-first : le
  // rendu part des sources LOCALES (agrégats caisse, crédits, points de
  // vente, session clôturée persistée) puis se raffine avec
  // collectTodaySales et la route ventes existante — jamais de fetch
  // bloquant, jamais d'erreur affichée : l'absence de données = zéro/
  // variation absente, honnête.
  const creditPartners = useCreditsStore((state) => state.partners)
  const totalCreditsDue = useMemo(
    () => useCreditsStore.getState().totalOutstandingCfa(),
    [creditPartners],
  )
  const activePointsCount = useMemo(
    () => Object.values(sellingPoints).filter((p) => !isPointArchived(p)).length,
    [sellingPoints],
  )
  const lastMarketSession = useMarketModeStore((state) => state.lastMarketSession)
  // Jour : collectTodaySales (serveur + file offline + repli agrégats,
  // ne lève jamais). Avant résolution : les agrégats locaux font foi.
  const [dayData, setDayData] = useState<{ saleCount: number; revenue: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    collectTodaySales(merchantId)
      .then((data) => { if (!cancelled) setDayData({ saleCount: data.saleCount, revenue: data.total }) })
      .catch(() => { /* offline : les agrégats locaux restent affichés */ })
    return () => { cancelled = true }
  }, [merchantId])
  // Hier : la route ventes existante (bornes UTC d'hier — même définition
  // du jour que le backoffice), en tâche de fond ; repli local = la
  // session marché clôturée hier (persistée). Échec réseau = silence,
  // la variation disparaît simplement.
  const [yesterdayFromServer, setYesterdayFromServer] = useState<number | null>(null)
  useEffect(() => {
    if (!merchantId) return
    let cancelled = false
    const range = yesterdayUtcRange()
    const params = new URLSearchParams({ merchantId, startDate: range.start, endDate: range.end })
    fetch(`/api/marchand/sales?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Erreur ${res.status}`))))
      .then((data: { sales?: unknown }) => {
        if (cancelled) return
        setYesterdayFromServer(yesterdayRevenueFromServerSales((data.sales ?? []) as ServerSaleMinimal[]))
      })
      .catch(() => { /* hors ligne : le repli local (session d'hier) reste la source */ })
    return () => { cancelled = true }
  }, [merchantId])
  const yesterdayRevenue = useMemo(
    () => (yesterdayFromServer !== null ? yesterdayFromServer : yesterdayRevenueFromSession(lastMarketSession)),
    [yesterdayFromServer, lastMarketSession],
  )
  const dayStats = useMemo(
    () => buildDayStats(
      dayData ?? { saleCount: todaySalesCount, revenue: todaySales },
      yesterdayRevenue,
    ),
    [dayData, todaySalesCount, todaySales, yesterdayRevenue],
  )

  const refreshPendingCount = async () => {
    market.setPendingSyncCount((await getPendingSyncEntries()).length)
  }

  useEffect(() => {
    void refreshPendingCount()
    const onQueueChanged = () => { void refreshPendingCount() }
    window.addEventListener('julaba-offline-queue-changed', onQueueChanged)
    return () => window.removeEventListener('julaba-offline-queue-changed', onQueueChanged)
  }, [])

  const synchronize = async () => {
    if (!connected || isSyncing) return
    setIsSyncing(true)
    market.setSyncStatus('syncing')
    try {
      await flushAllPendingSync()
      await refreshPendingCount()
      market.markSynced()
    } catch {
      market.setSyncStatus('error')
    } finally {
      setIsSyncing(false)
    }
  }

  const allowLocation = async () => {
    market.setLocationStatus('requesting')
    setLocationError('')
    try {
      market.setLocation(await captureMarketLocation())
      market.setLocationChoice('current')
    } catch (error) {
      market.setLocationStatus('refused')
      setLocationError(error instanceof Error ? error.message : 'Localisation indisponible')
    }
  }

  const selectLocationChoice = (choice: MarketLocationChoice) => {
    market.setLocationChoice(choice)
    if (choice !== 'current') market.setLocation(null)
  }

  if (!market.enabled) {
    return (
      <div className="screen-enter min-h-dvh pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b bg-background px-4 py-3">
          <Button variant="ghost" size="icon" onClick={goBack} aria-label="Retour"><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#C66A2C]">Mode Marché</p>
            <h1 className={soleilMode ? 'text-2xl font-bold' : 'text-xl font-bold'}>Activer le Mode Marché</h1>
          </div>
        </header>
        <main className="space-y-4 px-4 py-5">
          <Card className="border-[#E8944F]/30 bg-[#FDF3ED]">
            <CardContent className="space-y-3 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C66A2C] text-white"><ShoppingCart className="h-6 w-6" /></div>
              <p className="text-base leading-relaxed">Continuez à vendre et à gérer votre activité même sans connexion Internet. Vos opérations seront synchronisées automatiquement lorsque la connexion reviendra.</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <WifiOff className="h-5 w-5 text-[#C66A2C]" />
              <div className="flex-1"><p className="font-semibold">Mode hors connexion</p><p className="text-sm text-muted-foreground">Activé par défaut, vos ventes restent disponibles.</p></div>
              <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Activé" />
            </CardContent>
          </Card>
          <Button className="h-12 w-full bg-[#C66A2C] text-white hover:bg-[#9E5222]" onClick={market.enable}>Activer le Mode Marché</Button>
        </main>
      </div>
    )
  }

  return (
    <div className="screen-enter min-h-dvh pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-40 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack} aria-label="Retour"><ArrowLeft className="h-5 w-5" /></Button>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-[#C66A2C]">Mode Marché</p><h1 className="truncate text-xl font-bold">Votre activité hors connexion</h1></div>
          <div className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold" aria-label={connected ? 'En ligne' : 'Hors connexion'}>
            {connected ? <Wifi className="h-4 w-4 text-emerald-600" /> : <WifiOff className="h-4 w-4 text-amber-600" />}
            <span className={connected ? 'text-emerald-700' : 'text-amber-700'}>{connected ? 'En ligne' : 'Hors connexion'}</span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-xs">
          <span>{market.pendingSyncCount > 0 ? `${market.pendingSyncCount} opération${market.pendingSyncCount > 1 ? 's' : ''} en attente` : 'Toutes vos opérations sont synchronisées'}</span>
          {connected && market.pendingSyncCount > 0 && <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void synchronize()} disabled={isSyncing}><RefreshCw className={isSyncing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /> Synchroniser</Button>}
        </div>
      </header>

      <main className="space-y-5 px-4 py-5">
        <section>
          <h2 className="mb-3 text-lg font-bold">Aujourd'hui</h2>
          {/* MODE-908 (§18) — carte journée : le point actif est visible et
              cliquable (ouvre « Mes points de vente »). */}
          <button
            type="button"
            onClick={() => navigate('points-vente')}
            className="mb-3 flex w-full items-center gap-3 rounded-xl border border-[#E8944F]/30 bg-[#FDF3ED] px-4 py-3 text-left transition-colors hover:bg-[#F9E5D4]"
            aria-label={`Point de vente actif : ${activeSellingPoint.name}. Toucher pour changer`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C66A2C] text-white"><Store className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold uppercase tracking-wide text-[#C66A2C]">Point de vente</span>
              <span className="block truncate font-bold">{activeSellingPoint.name}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[#C66A2C]" aria-hidden="true" />
          </button>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Ventes" value={String(todaySalesCount)} icon={<BarChart3 className="h-4 w-4" />} />
            <Metric label="Chiffre d'affaires" value={formatFCFA(todaySales)} icon={<ShoppingCart className="h-4 w-4" />} />
            <Metric label="Produits" value={String(products.filter((product) => product.isActive).length)} icon={<Package className="h-4 w-4" />} />
            <Metric label="Stock faible" value={String(lowStock.length)} icon={<AlertCircle className="h-4 w-4" />} />
          </div>
          {/* MODE-910 (§25) — « Ma journée en chiffres » : ventes du jour,
              CA du jour (collectTodaySales — serveur + file offline),
              variation vs hier si disponible, crédits en cours (MODE-906)
              et points de vente actifs (MODE-908). Sources locales d'abord,
              raffinement en tâche de fond — jamais bloquant, jamais
              d'erreur : l'absence de données = valeur zéro honnête. */}
          <Card className="mt-3">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2 font-bold"><BarChart3 className="h-5 w-5 text-[#C66A2C]" /> Ma journée en chiffres</div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Ventes du jour</span>
                <span className="font-bold">{dayStats.saleCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Chiffre d'affaires</span>
                <span className="font-bold fcfa">{formatFCFA(dayStats.revenue)}</span>
              </div>
              {dayStats.changeVsYesterday !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Comparé à hier</span>
                  <span className={`flex items-center gap-1 text-sm font-semibold ${dayStats.changeVsYesterday >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {dayStats.changeVsYesterday >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {dayStats.changeVsYesterday >= 0 ? 'En hausse de' : 'En baisse de'} {dayStats.changeVsYesterday} %
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Crédits en cours</span>
                <span className="font-bold fcfa">{formatFCFA(totalCreditsDue)}</span>
              </div>
              {/* Si pertinent : au-delà de la « Boutique » seule (déjà
                  visible sur la carte point de vente ci-dessus). */}
              {activePointsCount >= 2 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Points de vente</span>
                  <span className="font-bold">{activePointsCount} point{activePointsCount > 1 ? 's' : ''} actif{activePointsCount > 1 ? 's' : ''}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">Actions rapides</h2>
          <div className="grid grid-cols-2 gap-3">
            <QuickAction label="Nouvelle vente" icon={<ShoppingCart />} onClick={() => navigate('caisse')} />
            <QuickAction label="Mon stock" icon={<Package />} onClick={() => navigate('stock')} />
            <QuickAction label="Ventes passées" icon={<BarChart3 />} onClick={() => navigate('ventes')} />
            {/* MODE-906 (§21-22) — le grand livre de crédit est vivant. */}
            <QuickAction label="Mes crédits" icon={<BookOpen />} onClick={() => navigate('credits')} />
            {/* MODE-907 (§15) — l'annuaire fournisseurs est vivant. */}
            <QuickAction label="Mes fournisseurs" icon={<Truck />} onClick={() => navigate('fournisseurs')} />
            {/* MODE-908 (§18) — les points de vente sont vivants. */}
            <QuickAction label="Points de vente" icon={<Store />} onClick={() => navigate('points-vente')} />
            <QuickAction label="Résumé du jour" icon={<BarChart3 />} onClick={() => { navigate('home'); toggleDaySummary() }} />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">Configuration</h2>
          <Card><CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-3"><MapPin className="h-5 w-5 text-[#C66A2C]" /><div><p className="font-semibold">Localisation du marché</p><p className="text-sm text-muted-foreground">La localisation est facultative et ne bloque jamais vos ventes.</p></div></div>
            <div className="grid gap-2">
              {(['current', 'market', 'none'] as MarketLocationChoice[]).map((choice) => {
                const labels = { current: 'Utiliser ma position actuelle', market: 'Choisir un marché', none: 'Ne pas enregistrer la position' }
                return <button key={choice} type="button" onClick={() => choice === 'current' ? void allowLocation() : selectLocationChoice(choice)} className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 text-left text-sm ${market.locationChoice === choice ? 'border-[#C66A2C] bg-[#FDF3ED]' : 'border-border'}`}><span className={`h-4 w-4 rounded-full border-2 ${market.locationChoice === choice ? 'border-[#C66A2C] bg-[#C66A2C]' : 'border-muted-foreground'}`} />{labels[choice]}</button>
              })}
            </div>
            {market.locationChoice === 'market' && <Input value={marketNameInput} onChange={(event) => { setMarketNameInput(event.target.value); market.setMarketName(event.target.value) }} placeholder="Nom du marché" aria-label="Nom du marché" />}
            {market.locationStatus === 'requesting' && <p className="text-sm text-muted-foreground">Recherche de votre position…</p>}
            {market.location && <p className="text-sm text-emerald-700">Position enregistrée{market.location.accuracy ? ` à ${Math.round(market.location.accuracy)} m près` : ''}.</p>}
            {locationError && <p className="text-sm text-amber-700">{locationError} Le Mode Marché reste disponible sans localisation.</p>}
          </CardContent></Card>
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Languages className="h-5 w-5 text-[#C66A2C]" /> Langue de Tata</h2>
          <Card><CardContent className="space-y-2 p-4">{LANGUAGE_OPTIONS.map((language) => <button key={language.id} type="button" disabled={!language.available} onClick={() => { if (!language.available) return; const selected = language.id as 'fr' | 'bci'; market.setLanguage(selected); setVoiceLanguage(selected) }} className={`flex min-h-11 w-full items-center justify-between rounded-xl border px-3 text-left text-sm ${market.selectedLanguage === language.id ? 'border-[#C66A2C] bg-[#FDF3ED]' : 'border-border'} ${!language.available ? 'opacity-50' : ''}`}><span>{language.label}</span><span className="text-xs text-muted-foreground">{language.available ? (market.selectedLanguage === language.id ? 'Sélectionné' : '') : 'Bientôt disponible'}</span></button>)}</CardContent></Card>
        </section>

        <p className="text-center text-xs text-muted-foreground">Les données locales restent sur votre appareil jusqu'à leur synchronisation. Les ventes continuent sans Internet.</p>
      </main>
    </div>
  )
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return <Card><CardContent className="p-3"><div className="mb-2 flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div><p className="truncate text-lg font-bold">{value}</p></CardContent></Card>
}

function QuickAction({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return <Button variant="outline" className="h-14 justify-start gap-3 px-3 text-left" onClick={onClick}>{icon}<span>{label}</span></Button>
}
