'use client'

/**
 * Missions identificateur — maquette « vues du menu » : carte mission avec
 * bandeau secteur, actions du jour (synchronisation différée + forçage
 * d'envoi, dossier rejeté urgent, objectif quotidien), autres affectations.
 */

import { CalendarDays, CalendarClock, CheckCircle2, ChevronRight, CloudUpload, Clock3, ListChecks, MapPin, ShieldCheck, Target, UsersRound, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore } from '@/lib/stores/identificateur-store'
import { IdentTopBar } from '@/components/identificateur/ident-top-bar'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function IdentMissionsScreen() {
  const { merchantId, merchantName, navigate, soleilMode } = useAppStore()
  const { dossiers, agentZone, agentMarche, mission, identDarkMode, setDossiersZoneIntent, syncDossiersFromServer, setCurrentDraftId } = useIdentificateurStore()
  const { toast } = useToast()

  const completed = dossiers.filter((d) => d.status === 'valide').length
  const pending = dossiers.filter((d) => d.status === 'en_attente').length
  const rejected = dossiers.filter((d) => d.status === 'rejete')
  const progress = mission.target > 0 ? Math.min(100, Math.round((completed / mission.target) * 100)) : 0

  // Le bouton de la mission ouvre « Mes dossiers » pré-filtré sur la zone
  // d'affectation de l'agent (intent consommé une fois par l'écran Suivi).
  const openZoneDossiers = () => {
    setDossiersZoneIntent(agentZone)
    navigate('ident-suivi')
  }

  // Forcer l'envoi : relance la réconciliation serveur des dossiers soumis.
  const forceSync = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast({ title: 'Hors connexion', description: 'L’envoi reprendra automatiquement dès le retour du réseau.' })
      return
    }
    if (merchantId) await syncDossiersFromServer(merchantId)
    toast({ title: 'Synchronisation lancée', description: `${pending} dossier${pending > 1 ? 's' : ''} en file d’envoi.` })
  }

  const firstRejected = [...rejected].sort((a, b) => b.updatedAt - a.updatedAt)[0]

  // Objectif quotidien : 1/10e de l'objectif mensuel (arrondi vers le haut,
  // plancher 2) — 40 dossiers/mois ⇒ 4 identifications par jour.
  const dailyTarget = Math.max(2, Math.ceil(mission.target / 10))
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  const madeToday = dossiers.filter((d) => d.status !== 'brouillon' && d.createdAt >= startOfDay.getTime()).length
  const dailyDone = Math.min(dailyTarget, madeToday)

  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const extensionLabel = `Prévue du 1er au 7 ${MONTHS_FR[nextMonth.getMonth()]} ${nextMonth.getFullYear()}`

  const textClass = identDarkMode ? 'text-stone-100' : soleilMode ? 'text-black' : ''
  const mutedClass = identDarkMode ? 'text-stone-400' : 'text-[#78716C]'
  const cardClass = identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white'

  return (
    <div className={cn('screen-enter min-h-full bg-[#FAFAF7] pb-[calc(6rem+env(safe-area-inset-bottom))]', soleilMode && 'text-black', identDarkMode && 'bg-stone-950')}>
      <IdentTopBar title="Missions" />

      <main className="space-y-4 px-4 pt-4">
        {/* Titre + secteur */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className={cn('text-xl font-bold', textClass)}>Missions</h1>
            <p className={cn('mt-0.5 text-xs', mutedClass)}>Affectations &amp; Objectifs terrain</p>
          </div>
          <span className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold text-white" style={{ backgroundColor: IDENT_COLOR }}>
            Secteur {agentZone}
          </span>
        </div>

        {/* Carte mission */}
        <section className={cn('rounded-2xl border p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]', cardClass)}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9F8170]">En cours · {MONTHS_FR[now.getMonth()]} {now.getFullYear()}</p>
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', identDarkMode ? 'bg-stone-800 text-stone-300' : 'bg-[#F5F0EB] text-[#9F8170]')}>
              <CalendarDays className="h-4 w-4" />
            </span>
          </div>
          <h2 className={cn('mt-1 text-lg font-bold leading-snug', textClass)}>Mission mensuelle — Recensement {agentZone}</h2>

          {/* Bandeau secteur (dégradé terrain, hors-ligne friendly) */}
          <div className="relative mt-3 flex h-24 items-end overflow-hidden rounded-xl" style={{ background: 'linear-gradient(120deg, #9F8170 0%, #B39380 55%, #C8AE9C 100%)' }}>
            <div className="flex flex-wrap items-center gap-1.5 p-2.5">
              <span className="flex items-center gap-1 rounded-md bg-black/25 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
                <MapPin className="h-3 w-3" /> Marché {agentMarche || agentZone}
              </span>
              <span className="rounded-md bg-black/25 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">Cadastre sectorisé</span>
              <span className="rounded-md bg-black/25 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">Recensement commerces</span>
            </div>
          </div>

          <div className="mt-3.5 flex items-end justify-between">
            <span className={cn('text-2xl font-bold', textClass)}>{completed}<span className={cn('text-base font-normal', mutedClass)}> / {mission.target} dossiers</span></span>
            <span className="text-sm font-bold text-[#9F8170]">{progress} %</span>
          </div>
          <div className={cn('mt-2 h-2 overflow-hidden rounded-full', identDarkMode ? 'bg-stone-800' : 'bg-[#E7E0D8]')}>
            <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: IDENT_COLOR }} />
          </div>
          <div className={cn('mt-3 flex items-center justify-between text-xs', mutedClass)}>
            <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Échéance : 30 septembre</span>
            <span>{Math.max(0, mission.target - completed)} dossiers restants</span>
          </div>

          <button
            type="button"
            onClick={openZoneDossiers}
            className={cn('mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border whitespace-nowrap px-2 text-[13px] font-semibold transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]', identDarkMode ? 'border-stone-700 bg-stone-900 text-stone-200' : 'border-[#E7E0D8] bg-white text-[#57534E]')}
          >
            <ListChecks className="h-4 w-4 shrink-0" />
            Voir la liste des dossiers de la zone
            <ChevronRight className="h-4 w-4 shrink-0" />
          </button>
        </section>

        {/* À faire aujourd'hui */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className={cn('text-sm font-bold', textClass)}>À faire aujourd’hui</h2>
            <span className={cn('text-xs', mutedClass)}>{pending + rejected.length} actions urgentes</span>
          </div>
          <div className="space-y-2.5">
            {pending > 0 && (
              <div className={cn('rounded-2xl border p-3.5', cardClass)}>
                <div className="flex items-start gap-3">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', identDarkMode ? 'bg-stone-800 text-stone-300' : 'bg-[#F5F0EB] text-[#9F8170]')}>
                    <Clock3 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn('truncate text-sm font-semibold', textClass)}>Synchronisation différée</p>
                      <span className={cn('shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold', identDarkMode ? 'bg-stone-800 text-stone-300' : 'bg-[#F5F0EB] text-[#6B584C]')}>{pending} en file</span>
                    </div>
                    <p className={cn('mt-0.5 text-xs', mutedClass)}>Connexion instable. {pending} dossier{pending > 1 ? 's' : ''} en attente d’envoi.</p>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className={cn('flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-green-700', identDarkMode && 'text-green-400')}>
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    Données locales sécurisées
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={forceSync}
                    className="h-8 shrink-0 gap-1.5 rounded-lg border-0 px-3 text-xs font-semibold text-white hover:opacity-95 active:scale-[0.97]"
                    style={{ backgroundColor: IDENT_COLOR }}
                  >
                    <CloudUpload className="h-3.5 w-3.5" />
                    Forcer l’envoi
                  </Button>
                </div>
              </div>
            )}

            {firstRejected && (
              <div className="rounded-2xl border border-red-100 bg-white p-3.5">
                <div className="flex items-start gap-3">
                  {firstRejected.photoBase64 ? (
                    <img src={firstRejected.photoBase64} alt={`Photo de ${firstRejected.firstName} ${firstRejected.lastName}`} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F5F0EB] text-xs font-bold text-[#9F8170]">
                      {(firstRejected.firstName.charAt(0) + firstRejected.lastName.charAt(0)).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn('truncate text-sm font-semibold', textClass)}>{firstRejected.firstName} {firstRejected.lastName}</p>
                      <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">Urgent</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-red-600">{firstRejected.rejectionReason || 'Photo du justificatif floue à reprendre'}</p>
                    <p className={cn('mt-0.5 truncate text-[11px]', mutedClass)}>Dossier {firstRejected.dossierNumber} · {firstRejected.zone}</p>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className={cn('min-w-0 truncate text-[11px]', mutedClass)}>Rejets par {firstRejected.validatedBy || 'la supervision'}</span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => { setCurrentDraftId(firstRejected.id); navigate('ident-identification') }}
                    className="h-8 shrink-0 gap-1.5 rounded-lg border-0 bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-600/90 active:scale-[0.97]"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Corriger
                  </Button>
                </div>
              </div>
            )}

            <div className={cn('rounded-2xl border p-3.5', cardClass)}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', identDarkMode ? 'bg-stone-800 text-stone-300' : 'bg-[#F5F0EB] text-[#9F8170]')}>
                    <Target className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className={cn('text-sm font-semibold', textClass)}>Objectif quotidien</p>
                    <p className={cn('mt-0.5 text-xs', mutedClass)}>Nouveaux commerces à identifier aujourd’hui</p>
                  </div>
                </div>
                <span className={cn('shrink-0 text-lg font-bold', textClass)}>{dailyDone} / {dailyTarget}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Array.from({ length: dailyTarget }, (_, i) => {
                  const done = i < dailyDone
                  return (
                    <span key={i} className={cn('rounded-md px-2 py-1 text-[10px] font-bold', done ? 'text-white' : identDarkMode ? 'bg-stone-800 text-stone-400' : 'bg-[#F5F0EB] text-[#78716C]')} style={done ? { backgroundColor: IDENT_COLOR } : undefined}>
                      #0{i + 1} {done ? 'Fait' : 'Prévu'}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Autres affectations */}
        <section>
          <h2 className={cn('mb-2 text-sm font-bold', textClass)}>Autres affectations</h2>
          <div className="space-y-2.5">
            <div className={cn('rounded-2xl border p-3.5', cardClass)}>
              <div className="flex items-start gap-3">
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', identDarkMode ? 'bg-stone-800 text-stone-300' : 'bg-[#F5F0EB] text-[#9F8170]')}>
                  <MapPin className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn('truncate text-sm font-semibold', textClass)}>Zone extension {agentZone}</p>
                    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">À venir</span>
                  </div>
                  <p className={cn('mt-0.5 text-xs', mutedClass)}>{extensionLabel}</p>
                  <p className={cn('mt-1.5 text-xs leading-relaxed', mutedClass)}>
                    Affectation programmée pour le cycle suivant. Les formulaires et fonds cartographiques seront téléchargés automatiquement 48 h avant l’ouverture.
                  </p>
                </div>
              </div>
            </div>

            <div className={cn('rounded-2xl border p-3.5', cardClass)}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: IDENT_COLOR }}>
                  {(merchantName || 'M').split(' ').map((p) => p.charAt(0)).slice(0, 2).join('').toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className={cn('truncate text-sm font-semibold', textClass)}>Équipe d’identification</p>
                  <p className={cn('truncate text-xs', mutedClass)}>Responsable superviseur : {merchantName || 'M. Touré'}</p>
                  <p className={cn('truncate text-[11px]', mutedClass)}>Secteur {agentZone} · {agentMarche}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
