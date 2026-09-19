'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Languages,
  MapPin,
  Package,
  RefreshCw,
  ShoppingCart,
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

const LANGUAGE_OPTIONS = [
  { id: 'fr' as const, label: 'Français', available: true },
  { id: 'bci' as const, label: 'Baoulé', available: true },
  { id: 'dioula', label: 'Dioula / Jula', available: false },
  { id: 'senoufo', label: 'Sénoufo', available: false },
  { id: 'bete', label: 'Bété', available: false },
]

export function MarketModeScreen() {
  const { goBack, navigate, toggleDaySummary, soleilMode } = useAppStore()
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
  const [marketNameInput, setMarketNameInput] = useState(market.marketName)
  const [locationError, setLocationError] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)

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
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Ventes" value={String(todaySalesCount)} icon={<BarChart3 className="h-4 w-4" />} />
            <Metric label="Chiffre d'affaires" value={formatFCFA(todaySales)} icon={<ShoppingCart className="h-4 w-4" />} />
            <Metric label="Produits" value={String(products.filter((product) => product.isActive).length)} icon={<Package className="h-4 w-4" />} />
            <Metric label="Stock faible" value={String(lowStock.length)} icon={<AlertCircle className="h-4 w-4" />} />
          </div>
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
