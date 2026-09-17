'use client'

import { CalendarDays, CheckCircle2, ChevronRight, Clock3, MapPin, Target, UsersRound } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore } from '@/lib/stores/identificateur-store'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

export function IdentMissionsScreen() {
  const { soleilMode, merchantName, navigate } = useAppStore()
  const { dossiers, agentZone, mission, identDarkMode, setDossiersZoneIntent } = useIdentificateurStore()
  const completed = dossiers.filter((d) => d.status === 'valide').length
  const pending = dossiers.filter((d) => d.status === 'en_attente').length
  const rejected = dossiers.filter((d) => d.status === 'rejete').length
  const progress = mission.target > 0 ? Math.min(100, Math.round((completed / mission.target) * 100)) : 0

  // Le bouton de la mission ouvre « Mes dossiers » pré-filtré sur la zone
  // d'affectation de l'agent (intent consommé une fois par l'écran Suivi).
  const openZoneDossiers = () => {
    setDossiersZoneIntent(agentZone)
    navigate('ident-suivi')
  }

  return (
    <div className={cn('screen-enter min-h-full bg-[#FAFAF7] pb-[calc(6rem+env(safe-area-inset-bottom))]', identDarkMode && 'bg-stone-950 text-stone-100')}>
      <header className={cn('border-b px-4 pb-4 pt-3', identDarkMode ? 'border-stone-800 bg-stone-950' : 'border-[#E7E0D8] bg-[#FAFAF7]')}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-[#78716C]">Missions</p>
            <h1 className="text-xl font-bold">Missions</h1>
          </div>
          <span className="rounded-full bg-[#F5F0EB] px-3 py-1 text-[11px] font-semibold text-[#6B584C]">Secteur {agentZone}</span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-[#78716C]"><MapPin className="h-3.5 w-3.5" /> Affectations et objectifs terrain</p>
      </header>

      <main className="space-y-4 px-4 py-4">
        <section className="rounded-2xl border border-[#E7E0D8] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9F8170]">En cours · Septembre 2026</p>
              <h2 className="mt-1 text-lg font-bold">Mission mensuelle</h2>
              <p className="text-sm text-[#78716C]">Recensement {agentZone}</p>
            </div>
            <Target className="h-5 w-5 text-[#9F8170]" />
          </div>
          <div className="mt-4 flex items-end justify-between">
            <span className="text-2xl font-bold">{completed}<span className="text-base font-normal text-[#78716C]"> / {mission.target} dossiers</span></span>
            <span className="text-sm font-bold text-[#9F8170]">{progress} %</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E7E0D8]"><div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: IDENT_COLOR }} /></div>
          <div className="mt-3 flex items-center justify-between text-xs text-[#78716C]"><span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Échéance : 30 septembre</span><span>{Math.max(0, mission.target - completed)} dossiers restants</span></div>
          <button type="button" onClick={openZoneDossiers} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#F5F0EB] text-sm font-semibold text-[#6B584C] transition-transform active:scale-[0.98]"><span>Voir la liste des dossiers de la zone</span><ChevronRight className="h-4 w-4" /></button>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold">À faire aujourd’hui</h2><span className="text-xs text-[#78716C]">{pending + rejected} actions</span></div>
          <div className="space-y-2">
            <div className="rounded-xl border border-[#E7E0D8] bg-white p-3"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F5F0EB] text-[#9F8170]"><Clock3 className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Synchronisation différée</p><p className="mt-0.5 text-xs text-[#78716C]">{pending} dossier{pending > 1 ? 's' : ''} en attente d’envoi</p></div><span className="rounded-full bg-[#F5F0EB] px-2 py-1 text-[10px] font-semibold text-[#6B584C]">À traiter</span></div></div>
            <div className="rounded-xl border border-red-100 bg-white p-3"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600"><CheckCircle2 className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Dossiers à corriger</p><p className="mt-0.5 text-xs text-[#78716C]">{rejected} dossier{rejected > 1 ? 's' : ''} rejeté{rejected > 1 ? 's' : ''}</p></div><span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700">Urgent</span></div></div>
          </div>
        </section>

        <section className="rounded-xl border border-[#E7E0D8] bg-white p-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F0EB] text-[#9F8170]"><UsersRound className="h-5 w-5" /></span><div><p className="text-sm font-semibold">Équipe d’identification</p><p className="text-xs text-[#78716C]">Responsable : {merchantName || 'Votre superviseur'}</p></div></div></section>
      </main>
    </div>
  )
}
