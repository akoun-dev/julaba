'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileEdit,
  MapPin,
  PenLine,
  Wifi,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { MONTHS_FR } from '@/lib/objectifs'
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
    setCurrentDraftId,
    setDossiersFilterIntent,
    identDarkMode,
  } = useIdentificateurStore()

  const brouillons = dossiers.filter((d) => d.status === 'brouillon')
  const enAttente = dossiers.filter((d) => d.status === 'en_attente')
  const valides = dossiers.filter((d) => d.status === 'valide')
  const rejetes = dossiers.filter((d) => d.status === 'rejete')
  const missionProgress = mission.target > 0 ? Math.min(100, Math.round((valides.length / mission.target) * 100)) : 0
  const missionRemaining = Math.max(0, mission.target - valides.length)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 17 ? 'Bon après-midi' : 'Bonsoir'
  const textClass = identDarkMode ? 'text-stone-100' : soleilMode ? 'text-black' : ''
  const mutedTextClass = identDarkMode ? 'text-stone-400' : 'text-[#78716C]'

  const [showNotifications, setShowNotifications] = useState(false)
  const unreadCount = useNotificationsStore((s) => s.unreadCount)

  const recentDossiers = dossiers
    .filter((d) => d.status !== 'brouillon')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 3)

  const latestDraft = brouillons.sort((a, b) => b.updatedAt - a.updatedAt)[0]

  const counterCards: {
    label: string
    sublabel: string
    count: number
    screen: ScreenRoute
    filter?: DossierStatus
    icon: typeof FileEdit
    tone: string
    iconBg: string
  }[] = [
    { label: 'Brouillons', sublabel: 'fiches', count: brouillons.length, screen: 'ident-brouillons', icon: FileEdit, tone: 'text-[#9F8170]', iconBg: 'bg-[#FDF3ED]' },
    { label: 'En attente', sublabel: 'en file', count: enAttente.length, screen: 'ident-suivi', filter: 'en_attente', icon: Clock, tone: 'text-blue-600', iconBg: 'bg-blue-50' },
    { label: 'Validés', sublabel: '+ ce mois', count: valides.length, screen: 'ident-suivi', filter: 'valide', icon: CheckCircle2, tone: 'text-green-600', iconBg: 'bg-green-50' },
    { label: 'Rejetés', sublabel: 'à corriger', count: rejetes.length, screen: 'ident-suivi', filter: 'rejete', icon: XCircle, tone: 'text-red-500', iconBg: 'bg-red-50' },
  ]

  const goToCard = (card: (typeof counterCards)[number]) => {
    if (card.filter) setDossiersFilterIntent(card.filter)
    navigate(card.screen)
  }

  function timeAgo(ts: number) {
    const diff = Date.now() - ts
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "à l'instant"
    if (mins < 60) return `il y a ${mins} min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `il y a ${hours} h`
    const days = Math.floor(hours / 24)
    return `il y a ${days} j`
  }

  return (
    <div className={cn('screen-enter min-h-full bg-[#FAFAF7] pb-[calc(6rem+env(safe-area-inset-bottom))]', soleilMode && 'text-black', identDarkMode && 'bg-stone-950')}>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[#E7E0D8] bg-[#FAFAF7]/80 px-4 pb-4 pt-4 backdrop-blur-lg" style={identDarkMode ? { backgroundColor: 'rgba(28,25,23,0.8)', borderColor: 'rgb(68 64 60)' } : undefined}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className={cn('text-lg font-bold', textClass)}>Accueil</h1>
              <span className="flex items-center gap-1 text-[10px] text-[#78716C]">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Synchronisé il y a 2 min
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label={unreadCount > 0 ? `Voir les notifications (${unreadCount} non lues)` : 'Voir les notifications'}
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#F5F0EB]"
            onClick={() => setShowNotifications(true)}
          >
            <Bell className="h-[18px] w-[18px] text-[#9F8170]" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-[#78716C]">
          <MapPin className="h-3.5 w-3.5" />
          Votre activité aujourd&apos;hui · {agentMarche || 'Adjamé'}
          <span className="ml-1 flex items-center gap-0.5 rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
            <Wifi className="h-2.5 w-2.5" />
            En ligne
          </span>
        </p>
      </header>

      <main className="flex flex-col gap-4 px-4 pb-4">
        {/* Stat cards 2x2 */}
        <div className="grid grid-cols-2 gap-3">
          {counterCards.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.label}
                type="button"
                onClick={() => goToCard(card)}
                className={cn(
                  'rounded-2xl border p-4 text-left transition-all duration-150 ease-out active:scale-[0.98]',
                  identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn('text-sm font-semibold', textClass)}>{card.label}</span>
                  <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', card.iconBg)}>
                    <Icon className={cn('h-3.5 w-3.5', card.tone)} />
                  </span>
                </div>
                <div className="mt-2">
                  <span className={cn('text-2xl font-bold', textClass)}>{card.count}</span>
                  <span className={cn('ml-1 text-xs', mutedTextClass)}>{card.sublabel}</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Mission progress */}
        <Card className={cn('rounded-2xl border', identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FDF3ED]">
                  <CheckCircle2 className="h-4 w-4 text-[#9F8170]" />
                </span>
                <span className={cn('text-sm font-semibold', textClass)}>Progression de la mission</span>
              </div>
              <div className="text-right">
                <span className={cn('text-lg font-bold', textClass)}>{valides.length} / {mission.target}</span>
                <span className={cn('block text-xs', mutedTextClass)}>({missionProgress}%)</span>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E7E0D8]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${missionProgress}%`, backgroundColor: IDENT_COLOR }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-[#78716C]">
              {/* Échéance dérivée de la mission du mois fixée au back-office */}
              <span>Objectif mensuel · Échéance fin {MONTHS_FR[mission.month]}</span>
              <span className="font-semibold text-[#9F8170]">{missionRemaining} restants</span>
            </div>
          </CardContent>
        </Card>

        {/* Reprendre un dossier */}
        {latestDraft && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className={cn('text-sm font-semibold', textClass)}>Reprendre un dossier</h2>
              <span className="flex items-center gap-1 text-[10px] text-[#78716C]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#9F8170]" />
                Brouillon récent
              </span>
            </div>
            <Card
              role="button"
              tabIndex={0}
              onClick={() => { setCurrentDraftId(latestDraft.id); navigate('ident-identification') }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCurrentDraftId(latestDraft.id); navigate('ident-identification') } }}
              className={cn(
                'cursor-pointer rounded-2xl border transition-all duration-150 ease-out active:scale-[0.98]',
                identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white'
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#FDF3ED] text-sm font-bold text-[#9F8170]">
                    {latestDraft.photoBase64 ? (
                      <img src={latestDraft.photoBase64} alt="" className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      `${latestDraft.firstName.charAt(0)}${latestDraft.lastName.charAt(0)}`.trim() || '?'
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('truncate text-sm font-bold', textClass)}>
                        {latestDraft.firstName || 'Nouveau'} {latestDraft.lastName || 'dossier'}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-[#78716C]">
                        Étape 5/7
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-[#78716C]">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{latestDraft.zone || agentZone}</span>
                      <span>·</span>
                      <span>{timeAgo(latestDraft.updatedAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#9F8170] text-sm font-semibold text-white transition-transform active:scale-[0.98]">
                  Reprendre le dossier
                  <ChevronRight className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Activité récente */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className={cn('text-sm font-semibold', textClass)}>Activité récente</h2>
            <button type="button" onClick={() => navigate('ident-suivi')} className="flex items-center gap-0.5 text-xs font-semibold text-[#9F8170]">
              Tout voir <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {recentDossiers.length === 0 && (
              <p className={cn('py-6 text-center text-xs', mutedTextClass)}>Aucune activité récente</p>
            )}
            {recentDossiers.map((dossier) => (
              <div
                key={dossier.id}
                role="button"
                tabIndex={0}
                onClick={() => { setCurrentDraftId(dossier.id); navigate('ident-dossier-detail') }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCurrentDraftId(dossier.id); navigate('ident-dossier-detail') } }}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-3 transition-all duration-150 ease-out active:scale-[0.98]',
                  identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white'
                )}
              >
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold', dossier.status === 'valide' ? 'bg-green-50 text-green-600' : dossier.status === 'rejete' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-600')}>
                  {dossier.status === 'valide' ? <CheckCircle2 className="h-5 w-5" /> : dossier.status === 'rejete' ? <XCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('truncate text-sm font-semibold', textClass)}>
                      {dossier.dossierNumber}
                    </span>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      dossier.status === 'valide' ? 'bg-green-50 text-green-700' :
                      dossier.status === 'rejete' ? 'bg-red-50 text-red-600' :
                      'bg-blue-50 text-blue-700'
                    )}>
                      {dossier.status === 'valide' ? 'Validé' : dossier.status === 'rejete' ? 'Rejeté' : 'En attente'}
                    </span>
                  </div>
                  <p className={cn('mt-0.5 text-xs', mutedTextClass)}>
                    {dossier.firstName} {dossier.lastName} · {timeAgo(dossier.updatedAt)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#78716C]" />
              </div>
            ))}
          </div>
        </div>
      </main>

      <NotificationsPanel open={showNotifications} onOpenChange={setShowNotifications} accentColor={IDENT_COLOR} soleilMode={soleilMode} />
    </div>
  )
}
