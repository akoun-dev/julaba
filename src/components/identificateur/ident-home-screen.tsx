'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileEdit,
  MapPin,
  Moon,
  Plus,
  Settings,
  Shield,
  Sun,
  Users,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore } from '@/lib/stores/identificateur-store'
import { useNotificationsStore } from '@/lib/stores/notifications-store'
import { NotificationsPanel } from '@/components/shared/notifications-panel'
import { cn } from '@/lib/utils'
import type { ScreenRoute } from '@/lib/stores/app-store'
import type { DossierStatus } from '@/lib/stores/identificateur-store'

const IDENT_COLOR = '#9F8170'

export function IdentHomeScreen() {
  const { navigate, merchantName, soleilMode } = useAppStore()
  const {
    dossiers,
    agentZone,
    agentMarche,
    mission,
    screenSensitive,
    toggleScreenSensitive,
    setCurrentDraftId,
    setDossiersFilterIntent,
    identDarkMode,
    toggleIdentDarkMode,
  } = useIdentificateurStore()

  const brouillons = dossiers.filter((d) => d.status === 'brouillon')
  const enAttente = dossiers.filter((d) => d.status === 'en_attente')
  const valides = dossiers.filter((d) => d.status === 'valide')
  const rejetes = dossiers.filter((d) => d.status === 'rejete')
  const totalActeurs = valides.length + enAttente.length
  const missionProgress = mission.target > 0 ? Math.min(100, Math.round((valides.length / mission.target) * 100)) : 0
  const missionRemaining = Math.max(0, mission.target - valides.length)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 17 ? 'Bon après-midi' : 'Bonsoir'
  const textClass = identDarkMode ? 'text-stone-100' : soleilMode ? 'text-black' : ''
  const mutedTextClass = identDarkMode ? 'text-stone-400' : 'text-[#78716C]'

  const [showNotifications, setShowNotifications] = useState(false)
  const unreadCount = useNotificationsStore((s) => s.unreadCount)

  const counterCards: {
    label: string
    count: number
    screen: ScreenRoute
    filter?: DossierStatus
    icon: typeof FileEdit
    tone: string
  }[] = [
    { label: 'Brouillons', count: brouillons.length, screen: 'ident-brouillons', icon: FileEdit, tone: 'bg-[#FDF3ED] text-[#9F8170]' },
    { label: 'En attente', count: enAttente.length, screen: 'ident-suivi', filter: 'en_attente', icon: Clock, tone: 'bg-blue-50 text-blue-600' },
    { label: 'Validés', count: valides.length, screen: 'ident-suivi', filter: 'valide', icon: CheckCircle2, tone: 'bg-green-50 text-green-600' },
    { label: 'Rejetés', count: rejetes.length, screen: 'ident-suivi', filter: 'rejete', icon: XCircle, tone: 'bg-red-50 text-red-600' },
  ]

  const goToCard = (card: (typeof counterCards)[number]) => {
    if (card.filter) setDossiersFilterIntent(card.filter)
    navigate(card.screen)
  }

  const quickMenuTiles: {
    label: string
    desc: string
    screen: ScreenRoute
    icon: typeof Plus
    tone: string
    badge?: number
  }[] = [
    { label: 'Nouveau dossier', desc: 'Commencer un enrôlement', screen: 'ident-identification', icon: Plus, tone: 'bg-[#FDF3ED] text-[#9F8170]' },
    { label: 'Mes brouillons', desc: 'Reprendre un dossier', screen: 'ident-brouillons', icon: FileEdit, tone: 'bg-amber-100 text-amber-700', badge: brouillons.length },
    { label: 'Suivi des dossiers', desc: 'Statuts et validations', screen: 'ident-suivi', icon: ClipboardList, tone: 'bg-blue-50 text-blue-600' },
    { label: 'Paramètres', desc: 'Préférences de l’appli', screen: 'ident-parametres', icon: Settings, tone: identDarkMode ? 'bg-stone-800 text-stone-300' : 'bg-stone-100 text-stone-600' },
  ]

  const wizardSteps = [
    { label: 'CNI' },
    { label: 'Photo' },
    { label: 'Détails' },
    { label: 'Zone' },
    { label: 'Autorisation' },
  ]

  return (
    <div className={cn('screen-enter min-h-full bg-[#FAFAF7] pb-[calc(6rem+env(safe-area-inset-bottom))]', soleilMode && 'text-black', identDarkMode && 'bg-stone-950')}>
      <header className="rounded-b-[20px] px-4 pb-6 pt-4 text-white" style={{ backgroundColor: IDENT_COLOR }}>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold tracking-[0.08em]">IDENTIFICATEUR</span>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label={unreadCount > 0 ? `Voir les notifications (${unreadCount} non lues)` : 'Voir les notifications'} className="relative h-9 w-9 text-white/80 hover:bg-white/10 hover:text-white" onClick={() => setShowNotifications(true)}>
              <Bell className="h-[18px] w-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-400" />
              )}
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label={identDarkMode ? 'Activer le mode clair' : 'Activer le mode sombre'} className="h-9 w-9 text-white/80 hover:bg-white/10 hover:text-white" onClick={toggleIdentDarkMode}>
              {identDarkMode ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Ouvrir les paramètres" onClick={() => navigate('ident-parametres')} className="h-9 w-9 text-white/80 hover:bg-white/10 hover:text-white">
              <Settings className="h-[18px] w-[18px]" />
            </Button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-bold">
            {(merchantName || 'A').charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="text-lg font-bold leading-tight">{greeting} {merchantName || 'Agent'}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[13px] text-white/85">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{agentZone} · {agentMarche}</span>
            </div>
          </div>
        </div>

        {/* Carte mission dans le bandeau — même structure que « Ma caisse » */}
        <Card className="mt-4 border-white/20 bg-white/15 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="relative h-[64px] w-[64px] shrink-0">
                <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden="true">
                  <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="7" />
                  <circle cx="32" cy="32" r="26" fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" strokeDasharray="163.4" strokeDashoffset={163.4 - (163.4 * missionProgress) / 100} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{missionProgress}%</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{valides.length} / {mission.target} validés ce mois</p>
                <p className="mt-0.5 text-xs text-white/80">{missionRemaining > 0 ? `Il en faut ${missionRemaining} de plus` : 'Objectif atteint'}</p>
                <div className="mt-2 h-px bg-white/20" />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-white/90">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5 text-white/70" />{totalActeurs} acteurs</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-300" />{valides.length}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-white/70" />{enAttente.length}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </header>

      <main className="flex flex-col gap-4 px-4 pb-4 pt-4">
        <Button
          type="button"
          onClick={() => { setCurrentDraftId(null); navigate('ident-identification') }}
          className="h-auto justify-start gap-3.5 rounded-2xl border-0 p-[18px] text-left text-white shadow-[0_4px_14px_rgba(159,129,112,0.35)] hover:opacity-95 active:scale-[0.98]"
          style={{ backgroundColor: IDENT_COLOR }}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <Plus className="h-6 w-6" />
          </span>
          <span className="flex-1">
            <span className="block text-base font-bold">Nouveau dossier</span>
            <span className="mt-0.5 block text-xs text-white/80">Commencez par une photo</span>
          </span>
          <ChevronRight className="h-5 w-5 text-white/80" />
        </Button>

        {/* Parcours de création — mêmes 5 étapes que le wizard */}
        <Card className={cn('rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)]', identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white')}>
          <CardContent className="p-4">
            <h2 className={cn('mb-3 text-sm font-semibold', textClass)}>Votre parcours en 5 étapes</h2>
            <ol className="flex items-start" aria-label="Étapes de création de dossier">
              {wizardSteps.map((step, idx) => (
                <li key={step.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full items-center">
                    <span className={cn('h-px flex-1', idx === 0 ? 'bg-transparent' : identDarkMode ? 'bg-stone-700' : 'bg-[#E7E0D8]')} />
                    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', identDarkMode ? 'bg-stone-800 text-stone-200' : 'bg-[#FDF3ED] text-[#9F8170]')}>{idx + 1}</span>
                    <span className={cn('h-px flex-1', idx === wizardSteps.length - 1 ? 'bg-transparent' : identDarkMode ? 'bg-stone-700' : 'bg-[#E7E0D8]')} />
                  </div>
                  <span className={cn('max-w-full truncate text-center text-[9.5px] leading-tight', mutedTextClass)}>{step.label}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {/* Menu rapide — tuiles de navigation */}
        <div>
          <h2 className={cn('mb-3 text-sm font-semibold', textClass)}>Menu rapide</h2>
          <div className="grid grid-cols-2 gap-3">
            {quickMenuTiles.map((tile) => {
              const Icon = tile.icon
              return (
                <Card
                  key={tile.label}
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (tile.screen === 'ident-identification') setCurrentDraftId(null); navigate(tile.screen) }}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(tile.screen) } }}
                  className={cn(
                    'cursor-pointer rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all duration-150 ease-out hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]',
                    identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white'
                  )}
                >
                  <CardContent className="flex flex-col items-center p-3 text-center">
                    <div className="relative">
                      <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', tile.tone)}>
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      {typeof tile.badge === 'number' && tile.badge > 0 && (
                        <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white" style={{ backgroundColor: IDENT_COLOR }}>
                          {tile.badge}
                        </span>
                      )}
                    </div>
                    <h3 className={cn('mt-1.5 text-xs font-semibold', textClass)}>{tile.label}</h3>
                    <p className={cn('mt-0.5 text-[10.5px] leading-tight', mutedTextClass)}>{tile.desc}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        <Card className={cn('rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)]', identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white')}>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className={cn('text-sm font-semibold', textClass)}>Mes dossiers</h2>
              <button type="button" onClick={() => navigate('ident-suivi')} className="flex items-center gap-0.5 text-xs text-[#9F8170] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]">
                Tout voir <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {counterCards.map((card) => {
                const Icon = card.icon
                return (
                  <button key={card.label} type="button" onClick={() => goToCard(card)} className="rounded-[10px] p-2.5 text-center transition-transform duration-150 ease-out hover:shadow-sm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]">
                    <span className={cn('mx-auto flex h-8 w-8 items-center justify-center rounded-lg', card.tone, identDarkMode && 'bg-stone-800')}><Icon className="h-4 w-4" /></span>
                    <span className={cn('mt-1 block text-xl font-bold', textClass)}>{card.count}</span>
                    <span className={cn('block text-[10.5px] leading-tight', mutedTextClass)}>{card.label}</span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card className={cn('rounded-xl shadow-none', identDarkMode ? 'border-amber-800/70 bg-amber-950/40' : 'border-amber-200 bg-amber-50/60')}>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', identDarkMode ? 'bg-amber-900 text-amber-300' : 'bg-amber-100')}><Shield className={cn('h-4 w-4', identDarkMode ? 'text-amber-300' : 'text-amber-700')} /></span>
              <div>
                <p className={cn('text-sm font-semibold', textClass)}>Sécurité de l’écran</p>
                <p className={cn('text-xs', mutedTextClass)}>{screenSensitive ? 'Écran sensible activé' : 'Écran sensible désactivé'}</p>
              </div>
            </div>
            <Switch checked={screenSensitive} onCheckedChange={() => { toggleScreenSensitive(); navigate('ident-parametres') }} aria-label="Activer la sécurité de l’écran" />
          </CardContent>
        </Card>
      </main>

      <NotificationsPanel open={showNotifications} onOpenChange={setShowNotifications} accentColor={IDENT_COLOR} soleilMode={soleilMode} />
    </div>
  )
}
