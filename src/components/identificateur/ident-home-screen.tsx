'use client'

/**
 * Accueil identificateur — maquette « vues du menu » : en-tête beige clair,
 * salutation + badge En ligne, grille de compteurs 2×2, progression de la
 * mission, reprise du dernier brouillon, activité récente.
 */

import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileEdit,
  Flag,
  MapPin,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore, type Dossier, type DossierStatus } from '@/lib/stores/identificateur-store'
import { IdentTopBar } from '@/components/identificateur/ident-top-bar'
import { formatRelativeTime } from '@/lib/relative-time'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

const ACTOR_LABELS: Record<Dossier['actorType'], string> = {
  marchand: 'Marchand',
  producteur: 'Producteur',
  cooperative: 'Coopérative',
}

export function IdentHomeScreen() {
  const { navigate, merchantName, soleilMode } = useAppStore()
  const {
    dossiers,
    agentZone,
    mission,
    setCurrentDraftId,
    setDossiersFilterIntent,
    setDossierDetailId,
    identDarkMode,
  } = useIdentificateurStore()

  const [online, setOnline] = useState(true)
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  const brouillons = dossiers.filter((d) => d.status === 'brouillon')
  const enAttente = dossiers.filter((d) => d.status === 'en_attente')
  const valides = dossiers.filter((d) => d.status === 'valide')
  const rejetes = dossiers.filter((d) => d.status === 'rejete')

  const missionProgress = mission.target > 0 ? Math.min(100, Math.round((valides.length / mission.target) * 100)) : 0
  const missionRemaining = Math.max(0, mission.target - valides.length)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 17 ? 'Bon après-midi' : 'Bonsoir'
  const agentFirstName = (merchantName || 'Agent').split(' ')[0]

  const textClass = identDarkMode ? 'text-stone-100' : soleilMode ? 'text-black' : ''
  const mutedClass = identDarkMode ? 'text-stone-400' : 'text-[#78716C]'
  const cardClass = identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white'

  const counterCards: {
    label: string
    count: number
    suffix: string
    screen: 'ident-brouillons' | 'ident-suivi'
    filter?: DossierStatus
    icon: typeof FileEdit
    iconClass: string
  }[] = [
    { label: 'Brouillons', count: brouillons.length, suffix: 'fiches', screen: 'ident-brouillons', icon: FileEdit, iconClass: 'text-[#9F8170]' },
    { label: 'En attente', count: enAttente.length, suffix: 'en file', screen: 'ident-suivi', filter: 'en_attente', icon: Clock, iconClass: 'text-blue-600' },
    { label: 'Validés', count: valides.length, suffix: '+ ce mois', screen: 'ident-suivi', filter: 'valide', icon: CheckCircle2, iconClass: 'text-green-600' },
    { label: 'Rejetés', count: rejetes.length, suffix: 'à corriger', screen: 'ident-suivi', filter: 'rejete', icon: XCircle, iconClass: 'text-red-600' },
  ]

  const lastDraft = [...brouillons].sort((a, b) => b.updatedAt - a.updatedAt)[0]

  const openDetail = (dossier: Dossier) => {
    setDossierDetailId(dossier.id)
    navigate('ident-dossier-detail')
  }

  // Activité récente : les 3 derniers dossiers soumis (jamais les brouillons,
  // déjà mis en avant par « Reprendre un dossier »).
  const recentDossiers = dossiers
    .filter((d) => d.status !== 'brouillon')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 3)

  return (
    <div className={cn('screen-enter min-h-full bg-[#FAFAF7] pb-[calc(6rem+env(safe-area-inset-bottom))]', soleilMode && 'text-black', identDarkMode && 'bg-stone-950')}>
      <IdentTopBar title="Accueil" />

      <main className="space-y-4 px-4 pt-4">
        {/* Salutation + état de connexion */}
        <section className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className={cn('text-[22px] font-bold leading-tight', textClass)}>{greeting} {agentFirstName}</h1>
            <p className={cn('mt-1 flex items-center gap-1 text-xs', mutedClass)}>
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">Votre activité aujourd’hui : {agentZone}</span>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold', online ? 'bg-green-50 text-green-700' : identDarkMode ? 'bg-stone-800 text-stone-300' : 'bg-[#F5F0EB] text-[#78716C]')}>
              <span className={cn('h-1.5 w-1.5 rounded-full', online ? 'bg-green-500' : 'bg-[#78716C]')} />
              {online ? 'En ligne' : 'Hors ligne'}
            </span>
          </div>
        </section>

        {/* Compteurs 2×2 */}
        <section className="grid grid-cols-2 gap-3" aria-label="Compteurs de dossiers">
          {counterCards.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.label}
                type="button"
                onClick={() => { if (card.filter) setDossiersFilterIntent(card.filter); navigate(card.screen) }}
                className={cn('rounded-2xl border p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-transform duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]', cardClass)}
              >
                <span className="flex items-center justify-between">
                  <span className={cn('text-[13px] font-medium', identDarkMode ? 'text-stone-300' : 'text-[#57534E]')}>{card.label}</span>
                  <Icon className={cn('h-[18px] w-[18px]', identDarkMode ? 'text-stone-400' : card.iconClass)} />
                </span>
                <span className={cn('mt-2.5 flex items-baseline gap-1.5')}>
                  <span className={cn('text-[26px] font-bold leading-none', textClass)}>{card.count}</span>
                  <span className={cn('text-xs', mutedClass)}>{card.suffix}</span>
                </span>
              </button>
            )
          })}
        </section>

        {/* Progression de la mission */}
        <button
          type="button"
          onClick={() => navigate('ident-missions')}
          className={cn('block w-full rounded-2xl border p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-transform duration-150 ease-out active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]', cardClass)}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <Flag className="h-4 w-4 shrink-0 text-[#9F8170]" />
              <span className={cn('truncate text-sm font-semibold', textClass)}>Progression de la mission</span>
            </span>
            <span className="shrink-0 text-sm">
              <span className={cn('font-bold', textClass)}>{valides.length} / {mission.target}</span>
              <span className={cn('text-xs', mutedClass)}> ({missionProgress}%)</span>
            </span>
          </span>
          <span className="mt-3 block h-2 overflow-hidden rounded-full bg-[#E7E0D8]">
            <span className="block h-full rounded-full" style={{ width: `${missionProgress}%`, backgroundColor: IDENT_COLOR }} />
          </span>
          <span className="mt-3 flex items-center justify-between gap-2">
            <span className={cn('truncate text-xs', mutedClass)}>Objectif mensuel · Échéance au 30 sept.</span>
            <span className="shrink-0 rounded-full bg-[#F5F0EB] px-2.5 py-1 text-[11px] font-semibold text-[#6B584C]" style={identDarkMode ? { backgroundColor: '#292524', color: '#d6d3d1' } : undefined}>
              {missionRemaining} restants
            </span>
          </span>
        </button>

        {/* Reprendre un dossier — le brouillon le plus récent */}
        {lastDraft && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className={cn('text-sm font-bold', textClass)}>Reprendre un dossier</h2>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Brouillon récent</span>
            </div>
            <div className={cn('rounded-2xl border p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]', cardClass)}>
              <div className="flex items-center gap-3">
                {lastDraft.photoBase64 ? (
                  <img src={lastDraft.photoBase64} alt={`Photo de ${lastDraft.firstName} ${lastDraft.lastName}`} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#F5F0EB] text-sm font-bold text-[#9F8170]">
                    {(lastDraft.firstName.charAt(0) + lastDraft.lastName.charAt(0)).toUpperCase() || '?'}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm font-bold', textClass)}>{lastDraft.firstName} {lastDraft.lastName}</p>
                  <p className={cn('mt-0.5 truncate text-xs', mutedClass)}>{ACTOR_LABELS[lastDraft.actorType]} - {lastDraft.zone || 'Zone à définir'}</p>
                  <p className={cn('mt-0.5 truncate text-xs', mutedClass)}>Modifié {formatRelativeTime(lastDraft.updatedAt)} · {agentZone}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setCurrentDraftId(lastDraft.id); navigate('ident-identification') }}
                className="relative mt-3 flex h-11 w-full items-center justify-center rounded-lg text-sm font-semibold text-white transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170] focus-visible:ring-offset-2"
                style={{ backgroundColor: IDENT_COLOR }}
              >
                Reprendre le dossier
                <ArrowRight className="absolute right-3 h-4 w-4" />
              </button>
            </div>
          </section>
        )}

        {/* Activité récente */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className={cn('text-sm font-bold', textClass)}>Activité récente</h2>
            <button type="button" onClick={() => navigate('ident-suivi')} className={cn('flex items-center gap-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]', identDarkMode ? 'text-stone-300' : 'text-[#57534E]')}>
              Tout voir <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className={cn('divide-y rounded-2xl border shadow-[0_1px_2px_rgba(0,0,0,0.04)]', identDarkMode ? 'divide-stone-800 border-stone-700 bg-stone-900' : 'divide-[#F0EAE2] border-[#E7E0D8] bg-white')}>
            {recentDossiers.length === 0 && (
              <p className={cn('px-4 py-6 text-center text-xs', mutedClass)}>Aucune activité pour le moment</p>
            )}
            {recentDossiers.map((dossier) => (
              <RecentActivityRow key={dossier.id} dossier={dossier} mutedClass={mutedClass} textClass={textClass} onClick={() => openDetail(dossier)} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function RecentActivityRow({
  dossier,
  mutedClass,
  textClass,
  onClick,
}: {
  dossier: Dossier
  mutedClass: string
  textClass: string
  onClick: () => void
}) {
  const title =
    dossier.status === 'valide'
      ? `${dossier.dossierNumber} (${dossier.lastName} ${dossier.firstName.charAt(0)}.) validé`
      : dossier.status === 'rejete'
        ? `${dossier.lastName} ${dossier.firstName.charAt(0)}. à corriger`
        : `Dossier ${dossier.dossierNumber} synchronisé`
  const sub =
    dossier.status === 'valide'
      ? `${formatRelativeTime(dossier.validatedAt || dossier.updatedAt)} · ${dossier.zone}`
      : dossier.status === 'rejete'
        ? `${dossier.rejectionReason || 'Corrections demandées par la supervision'}`
        : `${formatRelativeTime(dossier.updatedAt)} · En attente de validation`
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F5F0EB]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#9F8170]"
    >
      <span className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
        dossier.status === 'valide' && 'bg-green-50 text-green-600',
        dossier.status === 'rejete' && 'bg-amber-50 text-amber-600',
        dossier.status === 'en_attente' && 'bg-[#F5F0EB] text-[#78716C]',
      )}>
        {dossier.status === 'valide' && <CheckCircle2 className="h-4 w-4" />}
        {dossier.status === 'rejete' && <AlertTriangle className="h-4 w-4" />}
        {dossier.status === 'en_attente' && <RefreshCw className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[13px] font-medium', textClass)}>{title}</span>
        <span className={cn('mt-0.5 block truncate text-xs', mutedClass)}>{sub}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#A8A29E]" />
    </button>
  )
}
