'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Sun, SunMedium, Mic, ShoppingCart, Package,
  FileText, TrendingUp, Wallet, ChevronRight,
  Eye, EyeOff, BarChart3, CheckCircle2,
  AlertCircle, Clock, Radio, Bell
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { VoiceAmountInput } from '@/components/marchand/voice-amount-input'
import { useStockStore } from '@/lib/stores/stock-store'
import { useNotificationsStore } from '@/lib/stores/notifications-store'
import { NotificationsPanel } from '@/components/shared/notifications-panel'
import { formatFCFA } from '@/lib/voice/localIntent'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { isAnySTTAvailable as isSTTAvailable } from '@/lib/voice/stt-factory'

const MARCHAND_COLOR = '#C66A2C'

export function HomeScreen() {
  const {
    soleilMode, toggleSoleil, navigate,
    merchantName, merchantSexe, openCloseDay, showDaySummary, toggleDaySummary,
    voiceEnabled, wakeWordEnabled, toggleWakeWord,
    openOpenCaisseModal, openVenteRapideModal
  } = useAppStore()
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
      `Votre caisse du jour : ${formatFCFA(fond + total - expenses)} FCFA. ` +
      `Ventes : ${formatFCFA(total)}. Dépenses : ${formatFCFA(expenses)}. ` +
      `${todaySalesCount} ventes aujourd'hui.`
    )
    haptic('light')
  }

  const handleSoleilToggle = () => {
    toggleSoleil()
    tataSpeak(soleilMode ? 'Mode soleil désactivé.' : 'Mode soleil activé.')
    haptic('light')
  }

  const handleWakeWordToggle = () => {
    toggleWakeWord()
    tataSpeak(wakeWordEnabled ? 'Mot Julaba désactivé.' : 'Mot Julaba activé. Dites Julaba pour me parler.')
    haptic('light')
  }

  const handleOpenSession = () => {
    const fond = parseInt(openFond) || 0
    openSession(fond)
    setShowOpenDay(false)
    setOpenFond('')
    tataSpeak(`Caisse ouverte avec ${formatFCFA(fond)} FCFA. Bonne journée !`)
    haptic('success')
  }

  const caisseTotal = (session?.fondDeCaisse || 0) + todaySales - todayExpenses
  const textClass = soleilMode ? 'text-black' : ''
  const headingClass = soleilMode ? 'text-xl' : 'text-lg'
  const amountClass = soleilMode ? 'text-3xl' : 'text-2xl'

  const navTiles = [
    { icon: Package, label: 'Mes produits', screen: 'stock' as const, color: 'bg-emerald-600 text-white', desc: 'Gérer les produits' },
    { icon: FileText, label: 'Dépenses', screen: 'depenses' as const, color: 'bg-amber-600 text-white', desc: 'Suivre les dépenses' },
    { icon: TrendingUp, label: 'Ventes passées', screen: 'ventes' as const, color: 'bg-blue-600 text-white', desc: 'Historique des ventes' },
    { icon: BarChart3, label: 'Résumé du jour', screen: 'ventes' as const, color: 'bg-teal-600 text-white', desc: 'Bilan quotidien', action: toggleDaySummary },
  ]

  return (
    <div className="screen-enter pb-24">
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
                title={wakeWordEnabled ? 'Mot "Julaba" activé' : 'Mot "Julaba" désactivé'}
                aria-label={wakeWordEnabled ? 'Désactiver le mot d\'activation Julaba' : 'Activer le mot d\'activation Julaba'}
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
              <span className="text-white/80 text-sm">Caisse du jour</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-9 w-9 text-white/60 hover:text-white hover:bg-white/10" onClick={() => setShowBalance(!showBalance)} aria-label={showBalance ? 'Masquer le solde' : 'Afficher le solde'}>
                  {showBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-white/60 hover:text-white hover:bg-white/10" onClick={handleListenBalance} aria-label="Écouter le solde">
                  <Mic className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-white font-bold fcfa ${amountClass}`}>
                {showBalance ? formatFCFA(caisseTotal) : '••••••'}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-3">
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
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-white/20 text-white border-0">
                {cart.length} article{cart.length > 1 ? 's' : ''}
              </Badge>
              <span className="font-bold">{formatFCFA(cartTotal)}</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </Button>
        </div>
      )}

      <div className="mx-4 mt-4">
        <Button
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#C66A2C] text-white shadow-lg hover:bg-[#B55D25]"
          onClick={() => {
            haptic('light')
            openVenteRapideModal()
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
                if (tile.action) {
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
      {showOpenDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowOpenDay(false)}>
          <Card className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <CardContent className="p-6">
              <h3 className={`text-lg font-bold text-center mb-2 ${textClass}`}>Ouvrir ma caisse</h3>
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
            </CardContent>
          </Card>
        </div>
      )}

      {/* Day Summary Modal */}
      {showDaySummary && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={toggleDaySummary}>
          <Card className="w-full max-w-lg rounded-t-3xl rounded-b-none p-6 pb-10 animate-in slide-in-from-bottom">
            <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-6" />
            <h3 className={`text-xl font-bold text-center mb-6 ${textClass}`}>Résumé du jour</h3>
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
          </Card>
        </div>
      )}

      {/* Close Day Modal */}
      <CloseDayModal />

      <NotificationsPanel open={showNotifications} onOpenChange={setShowNotifications} accentColor={MARCHAND_COLOR} soleilMode={soleilMode} />
    </div>
  )
}

function CloseDayModal() {
  const { showCloseDay, closeCloseDay, soleilMode } = useAppStore()
  const { todaySales, todayExpenses, session, closeSession } = useCaisseStore()
  const [fond, setFond] = useState(0)
  const [step, setStep] = useState<'confirm' | 'fond' | 'done'>('confirm')
  const textClass = soleilMode ? 'text-black' : ''

  if (!showCloseDay) return null

  const handleConfirm = () => {
    if (fond <= 0) {
      tataSpeak('Entrez le montant réel de votre caisse.')
      haptic('error')
      return
    }
    closeSession()
    setStep('done')
    tataSpeak(`Journée fermée. Votre caisse finale est de ${formatFCFA(fond)}. Bonne soirée !`)
    haptic('success')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeCloseDay}>
      <Card className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <CardContent className="p-6">
          {step === 'confirm' && (
            <>
              <h3 className={`text-lg font-bold text-center mb-4 ${textClass}`}>Fermer la journée ?</h3>
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm"><span className={textClass}>Ventes</span><span className="font-semibold fcfa">{formatFCFA(todaySales)}</span></div>
                <div className="flex justify-between text-sm"><span className={textClass}>Dépenses</span><span className="font-semibold fcfa">{formatFCFA(todayExpenses)}</span></div>
                <div className="border-t pt-2 flex justify-between font-bold"><span className={textClass}>Net</span><span className="text-[#C66A2C] fcfa">{formatFCFA(todaySales - todayExpenses)}</span></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={closeCloseDay}>Annuler</Button>
                <Button className="flex-1 bg-[#C66A2C] hover:bg-[#B55D25] text-white" onClick={() => setStep('fond')}>Confirmer</Button>
              </div>
            </>
          )}
          {step === 'fond' && (
            <>
              <h3 className={`text-lg font-bold text-center mb-4 ${textClass}`}>Fond de caisse réellement compté</h3>
              <Input
                type="number"
                placeholder="Montant en FCFA"
                value={fond || ''}
                onChange={e => setFond(parseInt(e.target.value) || 0)}
                className={`text-xl text-center h-14 fcfa ${soleilMode ? 'text-2xl' : ''}`}
                autoFocus
              />
              <p className="text-xs text-muted-foreground text-center mt-2">Comptez votre argent et entrez le montant</p>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" className="flex-1" onClick={() => setStep('confirm')}>Retour</Button>
                <Button className="flex-1 bg-[#C66A2C] hover:bg-[#B55D25] text-white" onClick={handleConfirm} disabled={!fond}>Valider</Button>
              </div>
            </>
          )}
          {step === 'done' && (
            <>
              <div className="text-center">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className={`text-lg font-bold ${textClass}`}>Journée fermée !</h3>
                <p className={`text-sm text-muted-foreground mt-2 ${soleilMode ? 'text-base' : ''}`}>Fond de caisse : {formatFCFA(fond)}</p>
              </div>
              <Button className="w-full mt-6 bg-[#C66A2C] hover:bg-[#B55D25] text-white" onClick={closeCloseDay}>OK</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
