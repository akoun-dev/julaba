'use client'

import {
  Bell, Plus, ChevronRight, Store, Wheat, Handshake,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore } from '@/lib/stores/identificateur-store'
import { cn } from '@/lib/utils'
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
  } = useIdentificateurStore()

  // Counts by status
  const brouillons = dossiers.filter((d) => d.status === 'brouillon')
  const enAttente = dossiers.filter((d) => d.status === 'en_attente')
  const valides = dossiers.filter((d) => d.status === 'valide')
  const rejetes = dossiers.filter((d) => d.status === 'rejete')

  // Breakdown by actor type (validated only)
  const validesMarchands = valides.filter((d) => d.actorType === 'marchand').length
  const validesProducteurs = valides.filter((d) => d.actorType === 'producteur').length
  const validesCooperatives = valides.filter((d) => d.actorType === 'cooperative').length

  // Mission progress
  const missionProgress = mission.target > 0
    ? Math.min(100, Math.round((valides.length / mission.target) * 100))
    : 0
  const missionRemaining = Math.max(0, mission.target - valides.length)

  const textClass = soleilMode ? 'text-black' : ''
  const labelClass = soleilMode ? 'text-xs font-semibold' : 'text-[10.5px]'

  // Greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 17 ? 'Bon après-midi' : 'Bonsoir'

  const goToNewDossier = () => {
    setCurrentDraftId(null)
    navigate('ident-identification')
  }

  const goToDossiers = (filter: DossierStatus | 'tous') => {
    setDossiersFilterIntent(filter)
    navigate('ident-dossiers')
  }

  // Ring geometry for the mission progress indicator
  const ringRadius = 32
  const ringCircumference = 2 * Math.PI * ringRadius

  const statusSegments: {
    label: string
    count: number
    color: string
    bg: string
    onClick: () => void
  }[] = [
    { label: 'Brouillon', count: brouillons.length, color: '#9F8170', bg: '#FDF3ED', onClick: () => navigate('ident-brouillons') },
    { label: 'En attente', count: enAttente.length, color: '#2563EB', bg: '#EFF6FF', onClick: () => goToDossiers('en_attente') },
    { label: 'Validé', count: valides.length, color: '#16A34A', bg: '#F0FDF4', onClick: () => goToDossiers('valide') },
    { label: 'Rejeté', count: rejetes.length, color: '#DC2626', bg: '#FEF2F2', onClick: () => goToDossiers('rejete') },
  ]

  return (
    <div className="screen-enter pb-24">
      {/* Header */}
      <div
        className="px-4 pt-4 pb-5 flex flex-col gap-2.5 rounded-b-2xl"
        style={{ backgroundColor: IDENT_COLOR }}
      >
        <div className="flex items-center justify-between">
          <span className="text-white font-bold text-[13px] tracking-wider">IDENTIFICATEUR</span>
          <button
            type="button"
            className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 transition-colors flex items-center justify-center"
            aria-label="Notifications"
          >
            <Bell className="w-[18px] h-[18px] text-white" />
          </button>
        </div>
        <div>
          <p className={cn('text-white font-bold', soleilMode ? 'text-xl' : 'text-lg')}>
            {greeting} {merchantName || 'Agent'}
          </p>
          <p className="text-white/85 text-[13px] mt-0.5">
            {agentZone} · {agentMarche}
          </p>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Primary CTA: Nouveau dossier */}
        <button
          type="button"
          onClick={goToNewDossier}
          className="w-full text-left rounded-2xl p-[18px] flex items-center gap-3.5 shadow-lg hover:shadow-xl active:scale-[0.98] transition-all"
          style={{ backgroundColor: IDENT_COLOR, boxShadow: '0 4px 14px rgba(159,129,112,0.35)' }}
        >
          <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Plus className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-base">Nouveau dossier</p>
            <p className="text-white/80 text-xs mt-0.5">Commencez par une photo</p>
          </div>
          <ChevronRight className="w-5 h-5 text-white/80 shrink-0" />
        </button>

        {/* Mes dossiers : compteurs unifiés, tap = filtre */}
        <div className="rounded-xl border bg-card shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className={cn('font-semibold text-sm', textClass)}>Mes dossiers</h2>
            <button
              type="button"
              onClick={() => goToDossiers('tous')}
              className="text-xs text-muted-foreground flex items-center gap-0.5 hover:text-foreground transition-colors"
            >
              Tout voir <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {statusSegments.map((seg) => (
              <button
                key={seg.label}
                type="button"
                onClick={seg.onClick}
                className="rounded-lg py-2.5 px-1 text-center hover:brightness-95 active:scale-[0.96] transition-all"
                style={{ backgroundColor: seg.bg }}
              >
                <div className={cn('font-bold', soleilMode ? 'text-xl' : 'text-lg')} style={{ color: seg.color }}>
                  {seg.count}
                </div>
                <div className={cn('text-muted-foreground leading-tight mt-0.5', labelClass)}>
                  {seg.label}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Ma progression : mission + territoire fusionnés */}
        <div className="rounded-xl border bg-card shadow-sm p-4">
          <h2 className={cn('font-semibold text-sm mb-3.5', textClass)}>Ma progression</h2>
          <div className="flex items-center gap-4">
            <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0">
              <circle cx="38" cy="38" r={ringRadius} fill="none" stroke="#F5F0EB" strokeWidth="8" />
              <circle
                cx="38" cy="38" r={ringRadius} fill="none" stroke={IDENT_COLOR} strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringCircumference * (1 - missionProgress / 100)}
                transform="rotate(-90 38 38)"
              />
              <text x="38" y="43" textAnchor="middle" fontSize="17" fontWeight="700" fill="#1A1A1A">
                {missionProgress}%
              </text>
            </svg>
            <div className="flex-1 min-w-0">
              <p className={cn('font-semibold text-[13.5px]', textClass)}>
                {valides.length} / {mission.target} validés ce mois
              </p>
              <p className="text-muted-foreground text-xs mt-0.5">
                {missionRemaining > 0 ? `Il en faut ${missionRemaining} de plus` : 'Objectif atteint !'}
              </p>
              <div className="h-px bg-border my-2.5" />
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className={cn('text-xs font-semibold', textClass)}>{validesMarchands}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Wheat className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className={cn('text-xs font-semibold', textClass)}>{validesProducteurs}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Handshake className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className={cn('text-xs font-semibold', textClass)}>{validesCooperatives}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
