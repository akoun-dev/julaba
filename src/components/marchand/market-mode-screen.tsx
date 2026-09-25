'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ClipboardList,
  Coins,
  CreditCard,
  History,
  Globe2,
  Mic,
  Package,
  RefreshCw,
  ShoppingBag,
  Store,
  Truck,
  Wifi,
  WifiOff,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { useMarketModeStore } from '@/lib/stores/market-mode-store'
import { useNetworkStore } from '@/lib/stores/network-store'
import { useStockStore } from '@/lib/stores/stock-store'
import { flushAllPendingSync, getPendingSyncEntries } from '@/lib/offline-db'
import { formatFCFA } from '@/lib/utils'
import { AppEmpty } from '@/components/shared/app-states'
import { haptic } from '@/lib/voice/tata-tts'

export function MarketModeScreen() {
  const { navigate, merchantName, merchantSexe, openVoiceModal, setVoiceAutoRecord, openOpenCaisseModal, openCloseDay, soleilMode, voiceEnabled, wakeWordEnabled } = useAppStore()
  // UI-MP-009 — le Mode Marché est l'écran du TERRAIN : contraste et taille
  // doivent monter en soleil comme les autres écrans marchands.
  const textClass = soleilMode ? 'text-black' : ''
  const connected = useNetworkStore((state) => state.connected)
  const { session, todaySales, todaySalesCount, todaySalesJournal } = useCaisseStore()
  const products = useStockStore((state) => state.products)
  const lowStockCount = useMemo(() => useStockStore.getState().getLowStockProducts().filter((product) => product.isActive).length, [products])
  const market = useMarketModeStore()
  const [isSyncing, setIsSyncing] = useState(false)
  const [currentTime, setCurrentTime] = useState('--:--')

  const pendingCount = market.pendingSyncCount
  const latestSale = todaySalesJournal[todaySalesJournal.length - 1]
  const activeMarketName = market.marketName || 'Marché non configuré'
  const displayName = merchantName || 'Awa'
  const initials = displayName.slice(0, 2).toUpperCase()
  // MODE-951 (AUDIT-003 F-23) — même règle « never infer » que home-screen :
  // pas de valeur de sexe enregistrée = pas d'honorifique (fin du
  // « Maman » par défaut pour tout compte sans sexe connu).
  const honorific = merchantSexe === 'masculin' ? 'Papa' : merchantSexe === 'feminin' ? 'Maman' : ''
  const nomAffiche = [honorific, displayName].filter(Boolean).join(' ')

  useEffect(() => {
    void getPendingSyncEntries().then((entries) => useMarketModeStore.getState().setPendingSyncCount(entries.length))
  }, [])

  useEffect(() => {
    setCurrentTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
  }, [])

  const leaveMarketMode = () => {
    market.disable()
    haptic('light')
    navigate('home')
  }

  const startVoiceSale = () => {
    haptic('light')
    if (!session?.isOpen) {
      openOpenCaisseModal()
      return
    }
    openVoiceModal()
    setVoiceAutoRecord(true)
  }

  const synchronize = async () => {
    if (!connected || isSyncing || pendingCount === 0) return
    setIsSyncing(true)
    market.setSyncStatus('syncing')
    try {
      await flushAllPendingSync()
      const entries = await getPendingSyncEntries()
      market.setPendingSyncCount(entries.length)
      market.markSynced()
    } catch {
      market.setSyncStatus('error')
    } finally {
      setIsSyncing(false)
    }
  }

  if (!market.enabled) {
    return (
      <main className="screen-enter min-h-dvh bg-[#FAFAF7] px-4 py-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <header className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('home')} aria-label="Retour à l'accueil"><ArrowLeft /></Button>
          <div><p className="text-xs font-bold uppercase tracking-wide text-[#C66A2C]">Mode Marché</p><h1 className={`text-xl font-bold ${textClass}`}><span className={soleilMode ? 'text-2xl' : ''}>Vendre au marché</span></h1></div>
        </header>
        <section className="rounded-3xl border-2 border-[#C66A2C] bg-card p-5 shadow-sm">
          <ShoppingBag className="mb-3 h-10 w-10 text-[#C66A2C]" />
          <h2 className={`text-lg font-bold ${textClass}`}>Continuez à vendre, même sans Internet</h2>
          <p className="mt-2 text-sm text-muted-foreground">Vos ventes restent sur ce téléphone et seront synchronisées au retour du réseau.</p>
          <Button className="mt-5 h-12 w-full bg-[#C66A2C] text-white hover:bg-[#A4531E]" onClick={market.enable}>Activer le Mode Marché</Button>
        </section>
      </main>
    )
  }

  return (
    <main className="screen-enter min-h-dvh bg-[#FAFAF7] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${textClass || 'text-foreground'}`}>{currentTime}</span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${connected ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? 'En ligne' : 'Hors connexion'}
          </span>
        </div>
        <Button variant="ghost" size="sm" className="h-9 rounded-full px-3 text-xs font-bold" onClick={leaveMarketMode}>Quitter le Mode Marché</Button>
      </header>

      {!connected && (
        <section className="mb-3 flex items-center justify-between gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 text-amber-950">
          <div className="flex min-w-0 items-center gap-2"><WifiOff className="h-5 w-5 shrink-0" /><div><p className="text-xs font-extrabold">Vendre sans Internet</p><p className="text-[10px] font-medium">Vos ventes sont gardées sur ce téléphone.</p></div></div>
          {pendingCount > 0 && <Button size="sm" className="h-9 shrink-0 bg-amber-800 px-3 text-[10px] text-white hover:bg-amber-900" onClick={() => void synchronize()} disabled={isSyncing}>{pendingCount} à envoyer</Button>}
        </section>
      )}

      <section className="mb-3 flex items-center justify-between rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#C66A2C] bg-[#FDF0E8] text-sm font-black text-[#C66A2C]">{initials}</div><div className="min-w-0"><p className="truncate text-sm font-extrabold">{nomAffiche}</p><p className="truncate text-[11px] text-muted-foreground">{activeMarketName}</p></div></div>
        <button type="button" className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-[#F2D7C5] bg-[#FDF7F3] px-3 text-xs font-bold text-[#C66A2C]" onClick={() => navigate('points-vente')}><Store className="h-4 w-4" /> Gérer</button>
      </section>

      <section className="mb-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Ma journée au marché</p>
            <p className={`mt-1 text-sm font-black ${textClass || 'text-foreground'}`}>{session?.isOpen ? 'Journée en cours' : 'Caisse fermée'}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{session?.isOpen ? `Commencée à ${new Date(session.openedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Ouvrez la caisse pour commencer à vendre.'}</p>
          </div>
          {session?.isOpen ? (
            <Button className="h-11 shrink-0 rounded-xl bg-[#C66A2C] px-3 text-xs font-bold text-white hover:bg-[#A4531E]" onClick={openCloseDay}><Wallet className="mr-1.5 h-4 w-4" /> Fermer</Button>
          ) : (
            <Button className="h-11 shrink-0 rounded-xl bg-[#C66A2C] px-3 text-xs font-bold text-white hover:bg-[#A4531E]" onClick={openOpenCaisseModal}><Coins className="mr-1.5 h-4 w-4" /> Ouvrir</Button>
          )}
        </div>
      </section>

      <section className="relative mb-3 overflow-hidden rounded-3xl border-2 border-[#C66A2C] bg-gradient-to-b from-[#FFF4EA] via-white to-[#FFF9F0] p-4 text-center shadow-md">
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Caisse {session?.isOpen ? 'active' : 'fermée'}</span>
        <p className="pt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Action vocale principale</p>
        <h1 className={`mt-1 text-base font-black ${textClass || 'text-foreground'} ${soleilMode ? 'text-lg' : ''}`}>Dites votre vente à Tata</h1>
        <button type="button" onClick={startVoiceSale} aria-label="Parler à Tata pour enregistrer une vente" className="mx-auto my-4 flex h-24 w-24 flex-col items-center justify-center rounded-full border-4 border-white bg-[#C66A2C] text-white shadow-lg transition-transform duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#E8944F]">
          <Mic className="h-9 w-9" /><span className="text-[11px] font-black uppercase">Parler</span>
        </button>
        <p className={`text-xs font-bold ${textClass || 'text-foreground'}`}>Touchez pour parler à Tata</p>
        <p className="mt-1 text-xs text-muted-foreground">Dites le produit, la quantité et le montant.</p>
        <div className="mt-3 border-t border-stone-200/80 pt-3 text-left">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase text-muted-foreground">Mots de réveil</p>
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${voiceEnabled && wakeWordEnabled ? 'bg-emerald-50 text-emerald-800' : 'bg-muted text-muted-foreground'}`}>{voiceEnabled && wakeWordEnabled ? 'Actifs' : 'Désactivés'}</span>
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground">Dites l’un de ces mots, puis votre commande. Cela fonctionne ici comme sur les autres écrans.</p>
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Mots de réveil reconnus">
            {['Tata', 'Tatah', 'Ta ta', 'T ata', 'Julaba', 'Djulaba', 'Jula ba', 'Jou laba'].map((word) => <span key={word} className="rounded-full border border-[#F2D7C5] bg-[#FDF7F3] px-2 py-1 text-[10px] font-bold text-[#A4531E]">{word}</span>)}
          </div>
          <p className="mb-1 mt-3 text-xs font-bold uppercase text-muted-foreground">Exemples à dire</p>
          <div className="space-y-1.5 text-xs font-semibold text-foreground">
            {['Tata, j’ai vendu deux tomates', 'Julaba, ouvre mes ventes', 'Tata, combien j’ai vendu aujourd’hui ?', 'Tatah, annule la dernière vente'].map((example) => <button key={example} type="button" className="flex min-h-11 w-full items-center justify-between rounded-xl border border-border bg-card px-2.5 text-left" onClick={startVoiceSale}>{`« ${example} »`} <ChevronRight className="h-4 w-4 shrink-0 text-[#C66A2C]" /></button>)}
          </div>
        </div>
      </section>

      <section className="mb-3 rounded-2xl border border-border bg-card p-3 shadow-sm"><div className="mb-2 flex items-center justify-between"><p className="flex items-center gap-1 text-xs font-extrabold uppercase tracking-wide text-muted-foreground"><Check className="h-3 w-3 text-emerald-600" /> Dernière action enregistrée</p><span className="text-xs text-muted-foreground/80">Aujourd'hui</span></div>{latestSale ? <div className="flex items-center justify-between rounded-xl border border-border bg-background p-2.5"><div><p className={`text-xs font-bold ${textClass}`}>{latestSale.items.map((item) => `${item.quantity} ${item.productName}`).join(', ')}</p><p className="text-xs text-muted-foreground">Enregistrée localement</p></div><p className="text-xs font-black text-emerald-700">+ {formatFCFA(latestSale.amountCfa)}</p></div> : /* MODE-1008 : AppEmpty (miroir BoEmptyState), texte inchangé. */ <AppEmpty title="Aucune vente enregistrée aujourd'hui." soleilMode={soleilMode} className="rounded-xl bg-background p-3 text-xs" />}</section>

      <div className="mb-3 grid grid-cols-2 gap-2.5"><Stat label="Ventes du jour" value={`${todaySalesCount}`} soleilMode={soleilMode} /><Stat label="Chiffre d'affaires" value={formatFCFA(todaySales)} soleilMode={soleilMode} /><Stat label="Produits à surveiller" value={`${lowStockCount}`} soleilMode={soleilMode} /><Stat label="À synchroniser" value={`${pendingCount}`} soleilMode={soleilMode} /></div>

      <section className="mb-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Actions rapides</p>
        <div className="grid grid-cols-2 gap-2">
          <QuickAction icon={<Mic className="h-4 w-4" />} label="Nouvelle vente" onClick={startVoiceSale} />
          <QuickAction icon={<History className="h-4 w-4" />} label="Ventes passées" onClick={() => navigate('ventes')} />
          <QuickAction icon={<CreditCard className="h-4 w-4" />} label="Mes crédits" onClick={() => navigate('credits')} />
          <QuickAction icon={<Coins className="h-4 w-4" />} label="Dépenses" onClick={() => navigate('depenses')} />
          <QuickAction icon={<ClipboardList className="h-4 w-4" />} label="Commandes" onClick={() => navigate('commandes')} />
          <QuickAction icon={<Truck className="h-4 w-4" />} label="Fournisseurs" onClick={() => navigate('fournisseurs')} />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="h-12 gap-2 rounded-2xl border-border bg-card text-xs font-bold" onClick={() => navigate('stock')}><Package className="h-4 w-4" /> Mon stock</Button><Button variant="outline" className="h-12 gap-2 rounded-2xl border-border bg-card text-xs font-bold" onClick={() => void synchronize()} disabled={!connected || pendingCount === 0 || isSyncing}><RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} /> Synchroniser</Button></div>
      <button type="button" className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card text-xs font-bold text-foreground" onClick={() => navigate('profil')}><Globe2 className="h-4 w-4" /> Langue et réglages</button>
    </main>
  )
}

function Stat({ label, value, soleilMode }: { label: string; value: string; soleilMode?: boolean }) {
  return <div className="rounded-2xl border border-border bg-card p-3 shadow-sm"><p className="text-xs font-bold uppercase text-muted-foreground">{label}</p><p className={`mt-1 truncate text-lg font-black text-foreground fcfa ${soleilMode ? 'text-black text-xl' : ''}`}>{value}</p></div>
}

function QuickAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return <Button variant="outline" className="h-12 justify-start gap-2 rounded-xl border-border bg-card px-3 text-xs font-bold" onClick={onClick}>{icon}<span className="truncate">{label}</span></Button>
}
