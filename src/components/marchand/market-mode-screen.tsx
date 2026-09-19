'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowLeft,
  BarChart3,
  BatteryMedium,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Globe,
  Lightbulb,
  MapPin,
  Mic,
  Package,
  RefreshCw,
  ShoppingCart,
  Store,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
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
import { formatRelativeTime } from '@/lib/relative-time'
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

/** Exemples affichés sous l'action vocale principale (boutons « Essayer »). */
const EXAMPLE_PHRASES = [
  "J'ai vendu deux tomates à dix mille francs",
  "J'ai dépensé 500 F pour le transport",
  "Combien j'ai vendu aujourd'hui ?",
]

const KIND_LABELS: Record<string, string> = {
  boutique: 'Boutique',
  marche: 'Marché',
  autre: 'Point',
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('') || '?'

export function MarketModeScreen() {
  const { goBack, navigate, toggleDaySummary, soleilMode, merchantId, merchantName, openVoiceModal } = useAppStore()
  const connected = useNetworkStore((state) => state.connected)
  const { todaySales, todaySalesCount, todayExpenses, todaySalesJournal, session } = useCaisseStore()
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
  // Fiche complète du point actif (le snapshot ActiveSellingPoint ne porte
  // que clientId + nom — le `kind` vit sur l'entité SellingPoint).
  const activeFullPoint = useMemo(
    () => Object.values(sellingPoints).find((point) => point.clientId === activeSellingPoint.clientId),
    [sellingPoints, activeSellingPoint.clientId],
  )
  useEffect(() => {
    useSellingPointsStore.getState().activePoint()
  }, [])
  const [marketNameInput, setMarketNameInput] = useState(market.marketName)
  const [locationError, setLocationError] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [langOpen, setLangOpen] = useState(false)

  // Bandeau supérieur : horloge vivante + batterie réelle (masquée si l'API
  // n'existe pas — jamais de chiffre inventé).
  const [now, setNow] = useState(() => Date.now())
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> }
    if (typeof nav.getBattery !== 'function') return
    let cancelled = false
    nav.getBattery()
      .then((battery) => { if (!cancelled) setBatteryLevel(Math.round(battery.level * 100)) })
      .catch(() => { /* batterie indisponible : l'indicateur reste masqué */ })
    return () => { cancelled = true }
  }, [])
  const clock = useMemo(
    () => new Date(now).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    [now],
  )
  const todayLabel = useMemo(
    () => capitalize(new Date(now).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })),
    [now],
  )

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

  // Dernière vente du jour (journal local, annulations exclues).
  const lastSale = useMemo(
    () => [...todaySalesJournal].filter((sale) => !sale.annulee).sort((a, b) => b.createdAt - a.createdAt)[0],
    [todaySalesJournal],
  )
  // « Argent dans la caisse » : fond de caisse + ventes du jour − dépenses.
  const cashTotal = useMemo(
    () => (session?.fondDeCaisse ?? 0) + todaySales - todayExpenses,
    [session, todaySales, todayExpenses],
  )
  const cardTitle = merchantName ?? activeSellingPoint.name
  const cardSubtitle = useMemo(
    () => [market.marketName || 'Marché non précisé', KIND_LABELS[activeFullPoint?.kind ?? 'autre'] ?? 'Point'].join(' • '),
    [market.marketName, activeFullPoint],
  )
  const languageLabel = LANGUAGE_OPTIONS.find((option) => option.id === market.selectedLanguage)?.label ?? 'Français'

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
      {/* Bandeau d'état : retour, horloge, connexion, batterie. */}
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background px-3 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goBack} aria-label="Retour"><ArrowLeft className="h-4 w-4" /></Button>
        <span className="text-sm font-semibold tabular-nums">{clock}</span>
        <span className="flex-1" />
        <span
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
          aria-label={connected ? 'En ligne' : 'Hors connexion'}
        >
          {connected ? <Wifi className="h-3.5 w-3.5 text-emerald-600" /> : <WifiOff className="h-3.5 w-3.5 text-amber-600" />}
          <span className={connected ? 'text-emerald-700' : 'text-amber-700'}>{connected ? 'En ligne' : 'Hors connexion'}</span>
        </span>
        {batteryLevel !== null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-label={`Batterie ${batteryLevel} %`}>
            <BatteryMedium className="h-4 w-4" />
            {batteryLevel} %
          </span>
        )}
      </header>

      <main className="space-y-4 px-4 py-4">
        {/* Carte jaune — vente hors connexion + file d'envoi. */}
        <section
          className="rounded-2xl border border-[#E5C86B] bg-[#FDF8E7] p-4"
          aria-label="Vente sans internet"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold leading-tight">Vente sans internet <span className="font-normal text-muted-foreground">(Mode Marché)</span></p>
              <p className="text-xs text-muted-foreground">{todayLabel}</p>
            </div>
            {market.pendingSyncCount > 0 ? (
              <span className="shrink-0 rounded-full bg-[#7C4A21] px-2.5 py-1 text-xs font-bold text-white">
                {market.pendingSyncCount} à envoyer
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-600/40 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                <Check className="h-3.5 w-3.5" /> À jour
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Vos ventes restent sur ce téléphone et partiront dès le retour du réseau.
          </p>
          {connected && market.pendingSyncCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-9 border-[#C66A2C]/40 text-[#C66A2C] hover:bg-[#FDF3ED]"
              onClick={() => void synchronize()}
              disabled={isSyncing}
            >
              <RefreshCw className={isSyncing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Synchroniser maintenant
            </Button>
          )}
        </section>

        {/* Carte point de vente — marchand, étal, marché, langue. */}
        <section className="relative">
          <div className="flex items-center gap-3 rounded-2xl border bg-white p-3">
            <button
              type="button"
              onClick={() => navigate('points-vente')}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              aria-label={`Point de vente actif : ${activeSellingPoint.name}. Toucher pour changer`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#D2622A] text-sm font-bold text-white">
                {initialsOf(cardTitle)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-bold">{cardTitle}</span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {activeSellingPoint.name}
                  </span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">{cardSubtitle}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setLangOpen((open) => !open)}
                className="flex h-9 items-center gap-1.5 rounded-full border border-[#D2622A]/40 px-3 text-xs font-semibold text-[#C66A2C]"
                aria-haspopup="listbox"
                aria-expanded={langOpen}
                aria-label={`Langue de Tata : ${languageLabel}. Toucher pour changer`}
              >
                <Globe className="h-3.5 w-3.5" /> {languageLabel}
              </button>
              {langOpen && (
                <div
                  role="listbox"
                  aria-label="Langue de Tata"
                  className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border bg-white p-1 shadow-lg"
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={market.selectedLanguage === option.id}
                      disabled={!option.available}
                      onClick={() => {
                        if (!option.available) return
                        market.setLanguage(option.id as 'fr' | 'bci')
                        setVoiceLanguage(option.id as 'fr' | 'bci')
                        setLangOpen(false)
                      }}
                      className={`flex min-h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-sm ${!option.available ? 'opacity-50' : 'hover:bg-[#FDF3ED]'} ${market.selectedLanguage === option.id ? 'font-bold text-[#C66A2C]' : ''}`}
                    >
                      <span>{option.label}</span>
                      {market.selectedLanguage === option.id && <Check className="h-4 w-4" />}
                      {!option.available && <span className="text-[10px] text-muted-foreground">Bientôt</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ACTION VOCALE PRINCIPALE — la carte cœur du Mode Marché. */}
        <section className="rounded-2xl border-2 border-[#D2622A]/35 bg-white p-4" aria-label="Action vocale principale">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Action vocale principale</p>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" /> Vocal actif
            </span>
          </div>
          <p className="mt-2 text-center text-xl font-extrabold leading-snug">« Dites votre vente à Tata »</p>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={openVoiceModal}
              aria-label="Parler à Tata"
              className="flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-full bg-[#D2622A] text-white shadow-lg shadow-[#D2622A]/40 ring-4 ring-[#D2622A]/25 transition-transform hover:bg-[#B8551F] active:scale-95"
            >
              <Mic className="h-9 w-9" />
              <span className="text-xs font-extrabold tracking-widest">PARLER</span>
            </button>
          </div>
          <p className="mt-3 text-center text-sm"><span className="font-bold">Touchez</span> pour parler à Tata</p>
          <p className="mt-0.5 text-center text-xs text-muted-foreground">Conseil : parlez fort et clairement — Tata écoute même avec le bruit du marché.</p>
          <div className="mt-4 rounded-xl border border-[#E8944F]/30 bg-[#FDF8F2] p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#C66A2C]">
              <Lightbulb className="h-3.5 w-3.5" /> Exemples de phrases utiles à dire :
            </p>
            <ul className="mt-2 space-y-2">
              {EXAMPLE_PHRASES.map((phrase) => (
                <li key={phrase} className="flex items-center gap-2">
                  <span className="flex-1 rounded-lg border bg-white px-2.5 py-1.5 text-xs leading-snug">« {phrase} »</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 border-[#D2622A]/40 px-2.5 text-xs font-semibold text-[#C66A2C] hover:bg-[#FDF3ED]"
                    onClick={openVoiceModal}
                  >
                    Essayer
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Dernière action enregistrée (journal local du jour). */}
        <section className="rounded-2xl border bg-white p-4" aria-label="Dernière action enregistrée">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Dernière action enregistrée</p>
            {lastSale && <p className="text-xs text-muted-foreground">{formatRelativeTime(lastSale.createdAt, now)}</p>}
          </div>
          {lastSale ? (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-bold">
                  {lastSale.items.map((item) => `${item.quantity} ${item.productName}`).join(' + ')}
                </p>
                <p className="shrink-0 font-bold text-emerald-700 fcfa">+ {formatFCFA(lastSale.amountCfa)}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {lastSale.items.length} article{lastSale.items.length > 1 ? 's' : ''} • Caisse {session?.isOpen ? 'ouverte' : 'fermée'}
              </p>
              <p className="flex items-center gap-1 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Sauvegardé localement
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Aucune vente aujourd'hui — dites votre première vente à Tata.
            </p>
          )}
        </section>

        {/* Deux tuiles — caisse et stock critique. */}
        <section className="grid grid-cols-2 gap-3" aria-label="Aperçu rapide">
          <div className="rounded-2xl border bg-white p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" /> Argent en caisse
            </p>
            <p className="mt-1.5 truncate text-xl font-extrabold fcfa">{formatFCFA(cashTotal)}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              {todaySalesCount > 0 && <TrendingUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />}
              {todaySalesCount} vente{todaySalesCount > 1 ? 's' : ''}
              {todayExpenses > 0 && ` • dépenses ${formatFCFA(todayExpenses)}`}
            </p>
          </div>
          <div className="rounded-2xl border bg-white p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <Package className="h-3.5 w-3.5" /> Produits bientôt épuisés
            </p>
            <p className={`mt-1.5 text-xl font-extrabold ${lowStock.length > 0 ? 'text-[#D2622A]' : ''}`}>
              {lowStock.length} article{lowStock.length > 1 ? 's' : ''}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {lowStock.length > 0
                ? `${lowStock.slice(0, 2).map((product) => product.name).join(' • ')}${lowStock.length > 2 ? ` +${lowStock.length - 2}` : ''}`
                : 'Stock au complet'}
            </p>
          </div>
        </section>

        {/* MODE-910 (§25) — « Ma journée en chiffres » : ventes du jour,
            CA du jour (collectTodaySales — serveur + file offline),
            variation vs hier si disponible, crédits en cours (MODE-906)
            et points de vente actifs (MODE-908). Sources locales d'abord,
            raffinement en tâche de fond — jamais bloquant, jamais
            d'erreur : l'absence de données = valeur zéro honnête. */}
        <Card>
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
            {activePointsCount >= 2 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Points de vente</span>
                <span className="font-bold">{activePointsCount} point{activePointsCount > 1 ? 's' : ''} actif{activePointsCount > 1 ? 's' : ''}</span>
              </div>
            )}
          </CardContent>
        </Card>

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

        <p className="text-center text-xs text-muted-foreground">Les données locales restent sur votre appareil jusqu'à leur synchronisation. Les ventes continuent sans Internet.</p>
      </main>
    </div>
  )
}

function QuickAction({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return <Button variant="outline" className="h-14 justify-start gap-3 px-3 text-left" onClick={onClick}>{icon}<span>{label}</span></Button>
}
