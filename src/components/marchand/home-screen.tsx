'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Sun, SunMedium, Mic, ShoppingCart, Package,
  FileText, TrendingUp, Wallet, ChevronRight,
  Eye, EyeOff, BarChart3, CheckCircle2,
  AlertCircle, Clock, Radio, Bell, Volume2, HandCoins, Truck, Users,
  PiggyBank, Gift, ShieldCheck
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useMarketModeStore } from '@/lib/stores/market-mode-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { VoiceAmountInput } from '@/components/marchand/voice-amount-input'
import { useStockStore } from '@/lib/stores/stock-store'
import { useNotificationsStore } from '@/lib/stores/notifications-store'
import { NotificationsPanel } from '@/components/shared/notifications-panel'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { formatFCFA } from '@/lib/utils'
import { formatMontantParle } from '@/lib/voice/tata-phrases'
// UI-MP-013 — jeton canonique (NORM-304) : plus jamais de constante locale
// dupliquée, même sur l'écran le plus consulté.
import { MARCHAND_COLOR } from '@/lib/design-tokens'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { rateLitteratie } from '@/lib/litteratie'
import { collectTodaySales, buildDaySummarySpeech } from '@/lib/voice/day-summary'
import { isAnySTTAvailable as isSTTAvailable } from '@/lib/voice/stt-factory'
import { notify } from '@/lib/notifications/triggers'
import { caisseClosedInput, caisseNotClosedInput } from '@/lib/notifications/events'

export function HomeScreen() {
  const {
    soleilMode, toggleSoleil, navigate,
    merchantName, merchantSexe, merchantId, openCloseDay, showDaySummary, toggleDaySummary,
    voiceEnabled, wakeWordEnabled, toggleWakeWord,
    openOpenCaisseModal, openVenteRapideModal
  } = useAppStore()
  const enableMarketMode = useMarketModeStore((state) => state.enable)
  // Never infer a gender when the account has no recorded value.
  const honorific = merchantSexe === 'masculin' ? 'Papa' : merchantSexe === 'feminin' ? 'Maman' : ''
  const openCaissePrompt =
    merchantSexe === 'feminin' ? 'Tu commences avec combien, ma chérie ?'
    : merchantSexe === 'masculin' ? 'Tu commences avec combien, mon chéri ?'
    : 'Tu as combien pour ta caisse ?'
  const [sttAvailable] = useState(() => typeof window !== 'undefined' && isSTTAvailable())
  const {
    session, todaySales, todayExpenses, todaySalesCount,
    getCartTotal, hasActiveCart, cart, openSession
  } = useCaisseStore()
  const { getLowStockProducts } = useStockStore()
  const [showBalance, setShowBalance] = useState(true)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showOpenDay, setShowOpenDay] = useState(false)
  const [openFond, setOpenFond] = useState('')
  // Live count is kept fresh by NotificationsWatcher, mounted once at the
  // page root (see use-notifications-watcher.ts) — no fetch needed here.
  const unreadCount = useNotificationsStore((s) => s.unreadCount)
  const lowStock = getLowStockProducts()

  // Rappel quotidien « clôturer la caisse » (dédupliqué par jour) — une
  // session encore ouverte en fin de journée est l'erreur classique qui
  // fausse le bilan du lendemain. Vérifié UNE fois au montage de l'accueil.
  useEffect(() => {
    const session = useCaisseStore.getState().session
    const hour = new Date().getHours()
    if (session?.isOpen && hour >= 19) {
      void notify(caisseNotClosedInput({ openedAt: session.openedAt }))
    }
  }, [])
  const cartTotal = getCartTotal()

  // Greeting based on time of day
  const [greeting] = useState(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Bonjour'
    if (hour < 17) return 'Bon après-midi'
    return 'Bonsoir'
  })

  const handleGreeting = () => {
    tataSpeak(`${greeting}${honorific ? ` ${honorific}` : ''} ${merchantName || ''} !`)
    haptic('light')
  }

  const handleListenBalance = () => {
    const total = todaySales
    const expenses = todayExpenses
    const fond = session?.fondDeCaisse || 0
    tataSpeak(
      `Votre caisse du jour : ${formatMontantParle(fond + total - expenses)} francs. ` +
      `Ventes : ${formatFCFA(total)}. Dépenses : ${formatFCFA(expenses)}. ` +
      `${todaySalesCount} ventes aujourd'hui.`
    )
    haptic('light')
  }

  // Résumé vocal du jour (VOCAL-607 ventes, VOCAL-608 dépenses,
  // VOCAL-609 solde ventes − dépenses en fin de dicté) : Tata
  // dicte TOUTES les ventes réellement enregistrées aujourd'hui (produit,
  // quantité, montant) puis le total, PUIS les dépenses réelles du jour
  // (libellé, montant) et leur total — données réelles (serveur + file
  // offline + repli agrégats caisse), jamais inventées. Le dicté part
  // immédiatement : l'intro est parlée pendant le chargement, le résumé
  // enchaîne dès qu'il est prêt.
  const speakDaySummary = () => {
    haptic('light')
    // MODE-930 (dictée assistée) — le niveau de littératie recueilli à
    // l'onboarding ralentit le dicté pour « un peu » / « non » (le débit
    // choisi par l'utilisateur reste la base, jamais accéléré).
    const { voiceRate, litteratieNiveau } = useAppStore.getState()
    const rate = rateLitteratie(voiceRate, litteratieNiveau)
    const summaryPromise = collectTodaySales(merchantId)
    tataSpeak('Un instant, je regarde tes ventes et tes dépenses du jour.', () => {
      void summaryPromise
        .then((data) => {
          // MODE-910 (§23) — le résumé s'enrichit des alertes de stock
          // RÉELLES, lues au moment du dicté (getLowStockProducts du
          // stock-store ; la lib day-summary ne lit jamais un store) :
          // épuisés d'abord, presque épuisés ensuite, liste max 3.
          const stockAlerts = useStockStore
            .getState()
            .getLowStockProducts()
            .map((p) => ({ name: p.name, level: p.stockQty <= 0 ? ('out' as const) : ('low' as const) }))
          tataSpeak(buildDaySummarySpeech(data, stockAlerts), undefined, rate)
        })
        .catch(() => tataSpeak('Je n\'ai pas pu consulter tes ventes et dépenses. Réessaie dans un instant.', undefined, rate))
    }, rate)
  }

  const handleSoleilToggle = () => {
    toggleSoleil()
    tataSpeak(soleilMode ? 'Mode soleil désactivé.' : 'Mode soleil activé.')
    haptic('light')
  }

  const handleWakeWordToggle = () => {
    toggleWakeWord()
    tataSpeak(wakeWordEnabled ? 'Commande Tata désactivée.' : 'Commande Tata activée. Dites Tata pour me parler.')
    haptic('light')
  }

  const handleOpenSession = () => {
    const fond = parseInt(openFond) || 0
    openSession(fond)
    setShowOpenDay(false)
    setOpenFond('')
    tataSpeak(`Caisse ouverte avec ${formatMontantParle(fond)} francs. Bonne journée !`)
    haptic('success')
  }

  const caisseTotal = (session?.fondDeCaisse || 0) + todaySales - todayExpenses
  const textClass = soleilMode ? 'text-black' : ''
  const headingClass = soleilMode ? 'text-xl' : 'text-lg'
  const amountClass = soleilMode ? 'text-3xl' : 'text-2xl'

  const navTiles = [
    // MODE-905 (§40) — entrée principale du Mode Marché (fusion 0b209d4).
    { icon: ShoppingCart, label: 'Mode Marché', screen: 'mode-marche' as const, color: 'bg-[#C66A2C] text-white', desc: 'Vendre même hors connexion' },
    { icon: Package, label: 'Mes produits', screen: 'stock' as const, color: 'bg-emerald-600 text-white', desc: 'Gérer les produits' },
    { icon: FileText, label: 'Dépenses', screen: 'depenses' as const, color: 'bg-amber-600 text-white', desc: 'Suivre les dépenses' },
    // MODE-906 (§21-22) — grand livre de crédit clients (à côté de Dépenses).
    { icon: HandCoins, label: 'Mes crédits', screen: 'credits' as const, color: 'bg-rose-600 text-white', desc: 'Crédits et paiements clients' },
    // MODE-907 (§15) — annuaire fournisseurs (à côté de Mes crédits).
    { icon: Truck, label: 'Mes fournisseurs', screen: 'fournisseurs' as const, color: 'bg-violet-700 text-white', desc: 'Annuaire et achats' },
    { icon: TrendingUp, label: 'Ventes passées', screen: 'ventes' as const, color: 'bg-blue-600 text-white', desc: 'Historique des ventes' },
    { icon: BarChart3, label: 'Résumé du jour', screen: 'ventes' as const, color: 'bg-teal-600 text-white', desc: 'Bilan quotidien', action: () => { toggleDaySummary(); speakDaySummary() } },
    // MODE-921 (§5) — « Ma coopérative » : adhésion, cotisation, besoins,
    // pot commun. Tuile TACTILE (P1-5 : les écrans secondaires doivent
    // être accessibles sans la voix).
    { icon: Users, label: 'Ma coopérative', screen: 'ma-cooperative' as const, color: 'bg-[#2072AF] text-white', desc: 'Achats groupés et entraide' },
    // MODE-938 (AUDIT-003 F-08) — les 4 derniers écrans sans accès
    // tactile deviennent des tuiles : tontines/keiwa/fidélité/protection
    // sociale n'étaient atteignables QU'À LA VOIX — un micro indisponible
    // les rendait inaccessibles (contradiction avec le public faiblement
    // lettré). Même contrat que les tuiles ci-dessus : navigate direct,
    // desc parlé, aucune donnée inventée.
    { icon: PiggyBank, label: 'Tontines', screen: 'tontines' as const, color: 'bg-indigo-600 text-white', desc: 'Épargne de groupe' },
    { icon: Wallet, label: 'Keiwa', screen: 'keiwa' as const, color: 'bg-cyan-700 text-white', desc: 'Porte-monnaie mobile' },
    { icon: Gift, label: 'Fidélité', screen: 'fidelite' as const, color: 'bg-pink-600 text-white', desc: 'Mon score JULABA' },
    { icon: ShieldCheck, label: 'Protection', screen: 'protection-sociale' as const, color: 'bg-slate-700 text-white', desc: 'CNPS, CMU, assurances' },
  ]

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#C66A2C] to-[#9E5222] px-4 pt-6 pb-8 rounded-b-3xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={handleGreeting} className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center" aria-label="Écouter le message d'accueil">
              <span className="text-white text-lg font-bold">{merchantName?.charAt(0) || 'M'}</span>
            </button>
            <div>
              <p className="text-white/80 text-xs">{greeting}</p>
              <h1 className={`text-white font-bold ${headingClass}`}>{honorific ? `${honorific} ` : ''}{merchantName || 'Awa'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/10" onClick={handleSoleilToggle} aria-label={soleilMode ? 'Désactiver le mode soleil' : 'Activer le mode soleil'}>
              {soleilMode ? <Sun className="w-5 h-5" /> : <SunMedium className="w-5 h-5" />}
            </Button>
            {voiceEnabled && sttAvailable && (
              <Button
                variant="ghost"
                size="icon"
                className={`hover:text-white hover:bg-white/10 ${wakeWordEnabled ? 'text-green-300' : 'text-white/40'}`}
                onClick={handleWakeWordToggle}
                title={wakeWordEnabled ? 'Commande "Tata" activée' : 'Commande "Tata" désactivée'}
                aria-label={wakeWordEnabled ? 'Désactiver la commande vocale Tata' : 'Activer la commande vocale Tata'}
              >
                <Radio className="w-5 h-5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="relative text-white/80 hover:text-white hover:bg-white/10" onClick={() => setShowNotifications(true)} aria-label={unreadCount > 0 ? `Voir les notifications (${unreadCount} non lues)` : 'Voir les notifications'}>
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-400" />}
            </Button>
          </div>
        </div>

        {/* Caisse du jour card */}
        <Card className="bg-white/15 backdrop-blur-sm border-white/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white/80 text-sm">Ma caisse</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-11 w-11 text-white/60 hover:text-white hover:bg-white/10" onClick={() => setShowBalance(!showBalance)} aria-label={showBalance ? 'Masquer le solde' : 'Afficher le solde'}>
                  {showBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-white font-bold fcfa ${amountClass}`}>
                {showBalance ? formatFCFA(caisseTotal) : '••••••'}
              </span>
            </div>
            {/* flex-wrap : dès des montants réalistes (Ventes + Dépenses +
                N ventes ≈ 272px) la rangée débordait des 256px utiles à 320px */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-white/70 text-xs">Ventes : {formatFCFA(todaySales)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-white/70 text-xs">Dépenses : {formatFCFA(todayExpenses)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-yellow-400" />
                <span className="text-white/70 text-xs">{todaySalesCount} ventes</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Open day CTA */}
      {!session?.isOpen && (
        <div className="mx-4 -mt-4">
          <Button
            className="w-full h-12 bg-[#C66A2C] hover:bg-[#B55D25] text-white rounded-xl shadow-lg flex items-center justify-center gap-2"
            onClick={() => {
              haptic('light')
              openOpenCaisseModal()
            }}
          >
            <Wallet className="w-4 h-4" />
            <span className="font-medium">Ouvrir ma caisse</span>
          </Button>
        </div>
      )}

      {/* Active cart banner */}
      {hasActiveCart && cart.length > 0 && (
        <div className="mx-4 -mt-4">
          <Button
            className="w-full h-12 bg-[#C66A2C] hover:bg-[#B55D25] text-white rounded-xl shadow-lg flex items-center justify-between px-4"
            onClick={() => navigate('caisse')}
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              <span className="font-medium">Panier en cours</span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <Badge variant="secondary" className="bg-white/20 text-white border-0 shrink-0">
                {cart.length} article{cart.length > 1 ? 's' : ''}
              </Badge>
              <span className="font-bold truncate">{formatFCFA(cartTotal)}</span>
              <ChevronRight className="w-4 h-4 shrink-0" />
            </div>
          </Button>
        </div>
      )}

      <div className="mx-4 mt-4">
        <Button
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#C66A2C] text-white shadow-lg hover:bg-[#B55D25]"
          onClick={() => {
            haptic('light')
            if (!session?.isOpen) {
              openOpenCaisseModal()
            } else {
              openVenteRapideModal()
            }
          }}
        >
          <ShoppingCart className="h-4 w-4" />
          <span className="font-medium">Vente rapide</span>
        </Button>
      </div>

      {/* Navigation tiles */}
      <div className="px-4 mt-6">
        <h2 className={`font-semibold mb-3 ${textClass} ${soleilMode ? 'text-lg' : ''}`}>Menu rapide</h2>
        <div className="grid grid-cols-2 gap-3">
          {navTiles.map((tile) => (
            <Card
              key={tile.label}
              className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
              onClick={() => {
                haptic('light')
                if (tile.screen === 'mode-marche') {
                  enableMarketMode()
                  navigate('mode-marche')
                } else if (tile.action) {
                  tile.action()
                } else {
                  navigate(tile.screen)
                }
              }}
            >
              <CardContent className="p-2 flex flex-col items-center text-center">
                <div className={`w-8 h-8 rounded-lg ${tile.color} flex items-center justify-center mb-1.5`}>
                  <tile.icon className="w-4 h-4" />
                </div>
                <h3 className={`font-semibold text-xs ${textClass}`}>{tile.label}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">{tile.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Low stock alerts */}
      {lowStock.length > 0 && (
        <div className="px-4 mt-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <h2 className={`font-semibold ${textClass}`}>Stock bas</h2>
          </div>
          <div className="space-y-2">
            {lowStock.slice(0, 3).map((p) => (
              <Card key={p.id} className="border-amber-200 bg-amber-50/50 dark:border-amber-800/70 dark:bg-amber-950/40">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center">
                      <Package className="w-4 h-4 text-amber-700 dark:text-amber-300" />
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${textClass}`}>{p.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFCFA(p.priceUnit)}/unité</p>
                    </div>
                  </div>
                  <Badge variant="destructive" className="text-xs">{p.stockQty} restants</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Session info */}
      <div className="px-4 mt-6 mb-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className={`w-4 h-4 text-muted-foreground ${textClass}`} />
                <span className={`text-sm text-muted-foreground ${soleilMode ? 'text-base font-semibold' : ''}`}>
                  {session?.isOpen ? 'Session ouverte' : 'Aucune session'}
                </span>
              </div>
              {!session?.isOpen && (
                <Button size="sm" className="bg-[#C66A2C] hover:bg-[#B55D25] text-white text-xs" onClick={openOpenCaisseModal}>
                  Ouvrir ma caisse
                </Button>
              )}
              {session?.isOpen && (
                <Button size="sm" variant="outline" className="text-xs" onClick={openCloseDay}>
                  Fermer la journée
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Open Day Modal */}
      {/* Open Day Modal — Dialog Radix (UI-MP-003 : rôle dialog, aria-modal,
          piège de focus, Échap). */}
      {showOpenDay && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowOpenDay(false) }}>
          <DialogContent aria-describedby={undefined} className="w-full max-w-sm rounded-2xl p-6 gap-0 [&>button:last-of-type]:hidden">
              <DialogTitle asChild>
                <h3 className={`text-lg font-bold text-center mb-2 ${textClass}`}>Ouvrir ma caisse</h3>
              </DialogTitle>
              <p className={`text-sm text-muted-foreground text-center mb-4 ${soleilMode ? 'text-base' : ''}`}>
                Entrez le fond de caisse (la monnaie de départ des vendeurs) pour commencer votre journée
              </p>
              <VoiceAmountInput
                value={openFond}
                onChange={setOpenFond}
                placeholder="Ex: 50000"
                soleilMode={soleilMode}
                autoFocus
                autoPrompt={openCaissePrompt}
              />
              <p className="text-xs text-muted-foreground text-center mt-2">Saisissez au clavier ou dites le montant</p>
              <div className="flex gap-2 mt-6">
                <Button variant="outline" className="flex-1" onClick={() => setShowOpenDay(false)}>Annuler</Button>
                <Button
                  className="flex-1 bg-[#C66A2C] hover:bg-[#B55D25] text-white"
                  onClick={handleOpenSession}
                  disabled={!openFond || parseInt(openFond) < 0}
                >
                  Ouvrir
                </Button>
              </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Day Summary Modal */}
      {/* Day Summary Modal — Sheet Radix (UI-MP-003). */}
      {showDaySummary && (
        <Sheet open onOpenChange={(o) => { if (!o) toggleDaySummary() }}>
          <SheetContent side="bottom" aria-describedby={undefined} className="w-full max-w-lg mx-auto rounded-t-3xl rounded-b-none p-6 pb-10 gap-0 border-0 [&>button:last-of-type]:hidden">
            <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-6" />
            <SheetTitle asChild>
              <h3 className={`text-xl font-bold text-center mb-6 ${textClass}`}>Résumé du jour</h3>
            </SheetTitle>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-xl">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className={textClass}>Total ventes</span>
                </div>
                <span className="font-bold text-green-700 fcfa">{formatFCFA(todaySales)}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-red-50 rounded-xl">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <span className={textClass}>Total dépenses</span>
                </div>
                <span className="font-bold text-red-700 fcfa">{formatFCFA(todayExpenses)}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-xl">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                  <span className={textClass}>Nombre de ventes</span>
                </div>
                <span className="font-bold text-blue-700">{todaySalesCount}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-[#FDF3ED] rounded-xl border-2 border-[#C66A2C]/20">
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-[#C66A2C]" />
                  <span className={`font-semibold ${textClass}`}>Solde caisse</span>
                </div>
                <span className="font-bold text-[#C66A2C] fcfa">{formatFCFA(caisseTotal)}</span>
              </div>
            </div>
            <Button className="w-full mt-6 bg-[#C66A2C] hover:bg-[#B55D25] text-white" onClick={toggleDaySummary}>
              Fermer
            </Button>
            <Button
              variant="outline"
              className="w-full mt-3 border-[#C66A2C]/40 text-[#C66A2C] hover:bg-[#C66A2C]/10"
              onClick={speakDaySummary}
            >
              <Volume2 className="w-4 h-4 mr-2" />
              Écouter le détail des ventes
            </Button>
          </SheetContent>
        </Sheet>
      )}

      {/* Close Day Modal */}

      <NotificationsPanel open={showNotifications} onOpenChange={setShowNotifications} accentColor={MARCHAND_COLOR} soleilMode={soleilMode} />
    </div>
  )
}
