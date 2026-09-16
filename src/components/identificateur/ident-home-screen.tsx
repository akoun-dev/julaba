'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileEdit,
  MapPin,
  Moon,
  Plus,
  Settings,
  Shield,
  Sun,
  Target,
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

  return (
    <div className={cn('screen-enter min-h-full bg-[#FAFAF7] pb-[calc(6rem+env(safe-area-inset-bottom))]', soleilMode && 'text-black', identDarkMode && 'bg-stone-950')}>
      <header className="rounded-b-[20px] px-4 pb-5 pt-4 text-white" style={{ backgroundColor: IDENT_COLOR }}>
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
        <div className="mt-3">
          <div className="text-lg font-bold">{greeting} {merchantName || 'Agent'}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[13px] text-white/85">
            <MapPin className="h-3.5 w-3.5" />
            {agentZone} · {agentMarche}
          </div>
        </div>
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

        <Card className={cn('rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)]', identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white')}>
          <CardContent className="p-4">
            <h2 className={cn('mb-3.5 text-sm font-semibold', textClass)}>Ma progression</h2>
            <div className="flex items-center gap-4">
              <div className="relative h-[76px] w-[76px] shrink-0">
                <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90" aria-hidden="true">
                  <circle cx="38" cy="38" r="32" fill="none" stroke={identDarkMode ? '#44403C' : '#F5F0EB'} strokeWidth="8" />
                  <circle cx="38" cy="38" r="32" fill="none" stroke={IDENT_COLOR} strokeWidth="8" strokeLinecap="round" strokeDasharray="201" strokeDashoffset={201 - (201 * missionProgress) / 100} />
                </svg>
                <span className={cn('absolute inset-0 flex items-center justify-center text-lg font-bold', textClass)}>{missionProgress}%</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn('text-[13.5px] font-semibold', textClass)}>{valides.length} / {mission.target} validés ce mois</p>
                <p className={cn('mt-0.5 text-xs', mutedTextClass)}>{missionRemaining > 0 ? `Il en faut ${missionRemaining} de plus` : 'Objectif atteint'}</p>
                <div className={cn('my-2.5 h-px', identDarkMode ? 'bg-stone-700' : 'bg-[#E7E0D8]')} />
                <div className={cn('flex gap-4 text-xs font-semibold', identDarkMode ? 'text-stone-300' : 'text-[#57534E]')}>
                  <span className="flex items-center gap-1"><Users className={cn('h-3.5 w-3.5', mutedTextClass)} />{totalActeurs}</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" />{valides.length}</span>
                  <span className="flex items-center gap-1"><Clock className={cn('h-3.5 w-3.5', mutedTextClass)} />{enAttente.length}</span>
                </div>
              </div>
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
