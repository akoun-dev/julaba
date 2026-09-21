'use client'

/**
 * Missions identificateur — la mission mensuelle est pilotée par le
 * back-office : la cible affichée (et son échéance) vient de l'objectif du
 * mois fixé au BO (individuel, sinon zone), lu au montage via
 * GET /api/identificateur/mission (boucle complète BO -> terrain).
 */

import { useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MONTHS_FR } from '@/lib/objectifs'
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  CloudOff,
  MapPin,
  Phone,
  Shield,
  Target,
  Users,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore } from '@/lib/stores/identificateur-store'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

export function IdentMissionsScreen() {
  const { soleilMode, merchantId, merchantName, navigate } = useAppStore()
  const { dossiers, agentZone, mission, missionSource, fetchMissionFromServer, identDarkMode, setDossiersZoneIntent, setCurrentDraftId } = useIdentificateurStore()

  // Boucle complète avec le back-office : la cible affichée est celle que
  // l'objectif du mois a fixée au BO (individuelle, sinon zone). Le repli
  // local persisté reste valable hors ligne / sans objectif BO.
  useEffect(() => {
    if (!merchantId) return
    fetchMissionFromServer(merchantId)
  }, [merchantId, fetchMissionFromServer])
  const completed = dossiers.filter((d) => d.status === 'valide').length
  const pending = dossiers.filter((d) => d.status === 'en_attente').length
  const rejected = dossiers.filter((d) => d.status === 'rejete').length
  // MODE-948 (D-4, F-16) — la progression n'existe QUE si le back-office a
  // fixé un objectif pour le mois courant (mission non nulle).
  const progress = mission && mission.target > 0
    ? Math.min(100, Math.round((completed / mission.target) * 100))
    : 0
  const maintenant = new Date()

  const openZoneDossiers = () => {
    setDossiersZoneIntent(agentZone)
    navigate('ident-suivi')
  }

  const rejectedDossiers = dossiers.filter((d) => d.status === 'rejete').slice(0, 3)
  const dailyTarget = 4
  const dailyCompleted = Math.min(dailyTarget, completed)

  const textClass = identDarkMode ? 'text-stone-100' : soleilMode ? 'text-black' : ''
  const mutedTextClass = identDarkMode ? 'text-stone-400' : 'text-[#78716C]'

  const agentSteps = [
    { label: 'Fait', done: dailyCompleted >= 1 },
    { label: 'Fait', done: dailyCompleted >= 2 },
    { label: 'Prévu', done: false },
    { label: 'Prévu', done: false },
  ]

  return (
    <div className={cn('screen-enter min-h-full bg-[#FAFAF7] pb-[calc(6rem+env(safe-area-inset-bottom))]', identDarkMode && 'bg-stone-950 text-stone-100')}>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[#E7E0D8] bg-[#FAFAF7]/80 px-4 pb-4 pt-4 backdrop-blur-lg" style={identDarkMode ? { backgroundColor: 'rgba(28,25,23,0.8)', borderColor: 'rgb(68 64 60)' } : undefined}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className={cn('text-lg font-bold', textClass)}>Missions</h1>
            </div>
          </div>
          <span className="rounded-full bg-[#F5F0EB] px-3 py-1 text-[11px] font-semibold text-[#6B584C]">
            Secteur {agentZone}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-[#78716C]">
          Affectations & Objectifs terrain
        </p>
      </header>

      <main className="flex flex-col gap-4 px-4 pb-4">
        {/* Mission card */}
        <Card className={cn('overflow-hidden rounded-2xl border', identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white')}>
          <div className="relative h-28 w-full bg-gradient-to-r from-[#9F8170] to-[#C4A882]">
            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute bottom-2 left-3 right-3">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-white/80">
                En cours · {MONTHS_FR[maintenant.getMonth()]} {maintenant.getFullYear()}
              </span>
            </div>
          </div>
          <CardContent className="p-4">
            <h2 className={cn('text-base font-bold', textClass)}>
              Mission mensuelle — Recensement Marché {agentZone}
            </h2>

            {mission ? (
              <>
                {/* MODE-948 (D-4, F-16) — la cible affichée est celle du BO
                    pour le mois courant ; plus jamais un fallback inventé. */}
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <span className={cn('text-2xl font-bold', textClass)}>{completed}</span>
                    <span className={cn('text-sm', mutedTextClass)}> / {mission.target} dossiers</span>
                  </div>
                  <span className="text-sm font-bold text-[#9F8170]">{progress} %</span>
                </div>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E7E0D8]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progress}%`, backgroundColor: IDENT_COLOR }}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-[#78716C]">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Échéance : fin {MONTHS_FR[mission.month]}
                  </span>
                  <span>{Math.max(0, mission.target - completed)} dossiers restants</span>
                </div>

                {missionSource && (
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-[#78716C]">
                    <Shield className="h-3 w-3 shrink-0" style={{ color: IDENT_COLOR }} />
                    Objectif fixé par le back-office{missionSource === 'zone' ? ` (zone ${agentZone})` : ''}
                  </p>
                )}
              </>
            ) : (
              /* MODE-948 (D-4, F-16) — sans objectif BO pour ce mois, l'écran
                 le DIT au lieu d'afficher une course vers « 300 ». Le nombre
                 de dossiers validés reste un fait réel, lui. */
              <div className="mt-3">
                <p className={cn('text-sm font-semibold', textClass)}>
                  {completed} dossier{completed > 1 ? 's' : ''} validé{completed > 1 ? 's' : ''} ce mois
                </p>
                <p className={cn('mt-1 text-xs', mutedTextClass)}>
                  Aucun objectif défini par le back-office pour {MONTHS_FR[maintenant.getMonth()]} — votre
                  superviseur peut en fixer un depuis la console Objectifs.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={openZoneDossiers}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#F5F0EB] text-sm font-semibold text-[#6B584C] transition-transform active:scale-[0.98]"
            >
              Voir la liste des dossiers de la zone
              <ChevronRight className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>

        {/* À faire aujourd'hui */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className={cn('text-sm font-bold', textClass)}>À faire aujourd&apos;hui</h2>
            <span className="text-xs text-[#78716C]">{pending + rejected} actions urgentes</span>
          </div>

          <div className="space-y-2">
            {/* Sync deferred */}
            <Card className={cn('rounded-2xl border', identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white')}>
              <CardContent className="flex items-center gap-3 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F5F0EB] text-[#9F8170]">
                  <CloudOff className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-semibold', textClass)}>Synchronisation différée</p>
                  <p className={cn('text-xs', mutedTextClass)}>{pending} dossier{pending > 1 ? 's' : ''} en attente d&apos;envoi</p>
                </div>
                <span className="rounded-full bg-[#F5F0EB] px-2.5 py-1 text-[10px] font-semibold text-[#6B584C]">
                  3 en file
                </span>
              </CardContent>
            </Card>

            {/* Rejected dossiers */}
            {rejectedDossiers.map((d) => (
              <Card
                key={d.id}
                role="button"
                tabIndex={0}
                onClick={() => { setCurrentDraftId(d.id); navigate('ident-dossier-detail') }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCurrentDraftId(d.id); navigate('ident-dossier-detail') } }}
                className={cn(
                  'cursor-pointer rounded-2xl border transition-all duration-150 active:scale-[0.98]',
                  identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-red-100 bg-white'
                )}
              >
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-sm font-bold text-red-600">
                    {d.firstName.charAt(0)}{d.lastName.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm font-semibold', textClass)}>{d.firstName} {d.lastName}</p>
                    <p className={cn('text-xs', mutedTextClass)}>
                      <Camera className="mr-1 inline h-3 w-3" /> Photo de registre à reprendre
                    </p>
                    <p className={cn('text-[11px]', mutedTextClass)}>
                      Étape #2 · Adjamé B Marché
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1 border-red-200 text-xs text-red-600 hover:bg-red-50"
                  >
                    Corriger
                  </Button>
                </CardContent>
              </Card>
            ))}

            {rejected === 0 && (
              <Card className={cn('rounded-2xl border', identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white')}>
                <CardContent className="flex items-center gap-3 p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                  <div>
                    <p className={cn('text-sm font-semibold', textClass)}>Dossiers à corriger</p>
                    <p className={cn('text-xs', mutedTextClass)}>Aucun dossier rejeté</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        {/* Objectif quotidien */}
        <Card className={cn('rounded-2xl border', identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <h3 className={cn('text-sm font-semibold', textClass)}>Objectif quotidien</h3>
              <span className={cn('text-xs font-bold text-[#9F8170]')}>{dailyCompleted} / {dailyTarget}</span>
            </div>
            <p className={cn('mt-0.5 text-xs', mutedTextClass)}>Nouveaux commerçants à identifier aujourd&apos;hui</p>
            <div className="mt-3 flex items-center gap-3">
              {agentSteps.map((step, idx) => (
                <div key={idx} className="flex flex-1 flex-col items-center gap-1">
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold', step.done ? 'bg-[#9F8170] text-white' : 'bg-[#F5F0EB] text-[#9F8170]')}>
                    #{idx + 1}
                  </div>
                  <span className={cn('text-[10px]', mutedTextClass)}>{step.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Autres affectations */}
        <section>
          <h2 className={cn('mb-2 text-sm font-bold', textClass)}>Autres affectations</h2>
          <div className="space-y-2">
            <Card className={cn('rounded-2xl border', identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white')}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F5F0EB] text-[#9F8170]">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm font-semibold', textClass)}>Zone extension Abobo Nord</p>
                    <p className={cn('text-xs', mutedTextClass)}>Prévue du 15 au 30 octobre</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-[#78716C]">À venir</span>
                </div>
                <p className={cn('mt-2 text-[11px] leading-relaxed', mutedTextClass)}>
                  Affectation prévisionnelle hors cycle actuel. Les formalisateurs et forêts cartographiques seront téléchargés automatiquement 48h avant l&apos;émission.
                </p>
              </CardContent>
            </Card>

            <Card className={cn('rounded-2xl border', identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white')}>
              <CardContent className="flex items-center gap-3 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F5F0EB] text-[#9F8170]">
                  <Users className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-semibold', textClass)}>Équipe d&apos;identification 03</p>
                  <p className={cn('text-xs', mutedTextClass)}>
                    Responsable superviseur : M. Touré
                  </p>
                </div>
              </CardContent>
              <div className="flex items-center gap-2 border-t border-[#E7E0D8] px-3 py-2">
                <span className="flex items-center gap-1 text-[10px] text-[#78716C]">
                  <Users className="h-3 w-3" /> 4 agents actifs
                </span>
                <span className="text-[10px] text-[#78716C]">·</span>
                <span className="flex items-center gap-1 text-[10px] text-[#78716C]">
                  <MapPin className="h-3 w-3" /> Nord-Est
                </span>
              </div>
            </Card>
          </div>
        </section>
      </main>
    </div>
  )
}
