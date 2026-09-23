'use client'

// Écran Missions back-office — orchestrateur (DET-001 tranche 11, MODE-1000).
// La logique pure (options de filtrage, progression, filtrage des
// identificateurs affectables, payload de création, filtrage par statut,
// résumé, compteur d'onglet) vit dans src/lib/backoffice/missions-logic.ts
// avec tests ; les sous-arbres JSX (carte mission, dialog de création,
// dialog de détail) vivent dans ./missions/*. Ce module garde l'état, les
// états vides et l'assemblage.

import { useState, useMemo } from 'react'
import { Plus, Clock, CheckCircle2, Loader2, RefreshCw, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoEmptyState, BoStatCard } from './bo-ui'
import {
  filterMissionsByStatus,
  computeMissionSummary,
  missionTabCount,
  STATUS_FILTER_OPTIONS,
  type MissionStatusFilter,
} from '@/lib/backoffice/missions-logic'
import { STATUS_TAB_ICONS } from './missions/missions-parts'
import { MissionCard } from './missions/mission-card'
import { CreateMissionDialog } from './missions/create-mission-dialog'
import { MissionDetailDialog } from './missions/mission-detail-dialog'

// ============== MAIN COMPONENT ==============

export function BoMissionsScreen() {
  const missions = useBackofficeStore((s) => s.missions)
  const zones = useBackofficeStore((s) => s.zones)
  const boTheme = useBackofficeStore((s) => s.boTheme)
  const loading = useBackofficeStore((s) => s.loading)
  const fetchAllData = useBackofficeStore((s) => s.fetchAllData)
  const updateMissionStatus = useBackofficeStore((s) => s.updateMissionStatus)
  const isDark = boTheme === 'dark'
  const [statusFilter, setStatusFilter] = useState<MissionStatusFilter>('toutes')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailMissionId, setDetailMissionId] = useState<string | null>(null)

  // Available zones for the create form
  const zoneNames = useMemo(() => zones.map((z) => z.name), [zones])

  // Filtered missions
  const filteredMissions = useMemo(
    () => filterMissionsByStatus(missions, statusFilter),
    [missions, statusFilter]
  )

  // Summary
  const summary = useMemo(() => computeMissionSummary(missions), [missions])

  const handleCloseMission = (id: string) => {
    updateMissionStatus(id, 'terminee')
  }

  return (
    <div className={'p-6 space-y-4 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')}>
      {/* Title */}
      <BoPageHeader
        title="Missions"
        description="Suivi des missions d'enrôlement par zone"
        actions={
          <Button onClick={() => setCreateOpen(true)} className="text-white">
            <Plus className="mr-1.5 h-4 w-4" />
            Créer mission
          </Button>
        }
      />

      {missions.length === 0 && loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Chargement des missions...</p>
        </div>
      ) : missions.length === 0 && !loading ? (
        <BoEmptyState
          icon={Target}
          title="Aucune mission"
          description="Créez une première mission pour commencer."
          action={
            <Button variant="outline" onClick={() => fetchAllData()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </Button>
          }
        />
      ) : (
        <>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTER_OPTIONS.map((opt) => {
          const Icon = STATUS_TAB_ICONS[opt.value]
          const isActive = statusFilter === opt.value
          const count = missionTabCount(missions, opt.value)
          return (
            <Button
              key={opt.value}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              className={
                isActive
                  ? 'text-white'
                  : `${isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`
              }
              onClick={() => setStatusFilter(opt.value)}
            >
              <Icon className="mr-1.5 h-3.5 w-3.5" />
              {opt.label}
              <span
                className={`ml-1.5 text-[11px] rounded-full px-1.5 py-0.5 ${
                  isActive ? 'bg-white/20 text-white' : (isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500')
                }`}
              >
                {count}
              </span>
            </Button>
          )
        })}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <BoStatCard
          icon={Target}
          label="Total missions"
          value={summary.total.toLocaleString('fr-FR')}
          hint={`${summary.enCours} en cours`}
        />
        <BoStatCard
          icon={Clock}
          label="En cours"
          value={summary.enCours.toLocaleString('fr-FR')}
          hint="actives actuellement"
          tone="blue"
        />
        <BoStatCard
          icon={CheckCircle2}
          label="Taux accomplissement moyen"
          value={`${summary.avgProgress}%`}
          hint="toutes missions confondues"
          tone="emerald"
        />
      </div>

      {/* Mission list */}
      <div className="space-y-3">
        {filteredMissions.length === 0 ? (
          <BoEmptyState
            icon={Target}
            title="Aucune mission trouvée"
            description={
              statusFilter !== 'toutes'
                ? `Aucune mission avec le statut « ${STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)?.label} »`
                : 'Créez une première mission pour commencer'
            }
            action={
              statusFilter !== 'toutes' ? (
                <Button variant="outline" onClick={() => setStatusFilter('toutes')}>
                  Réinitialiser les filtres
                </Button>
              ) : undefined
            }
          />
        ) : (
          filteredMissions.map((mission) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              onClose={handleCloseMission}
              onViewDetails={setDetailMissionId}
            />
          ))
        )}
      </div>

      {/* Create dialog */}
      <CreateMissionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        zones={zoneNames}
      />

      {/* Detail dialog */}
      <MissionDetailDialog
        missionId={detailMissionId}
        onOpenChange={(v) => { if (!v) setDetailMissionId(null) }}
      />
        </>
      )}
    </div>
  )
}
