'use client'

// Carte d'une mission de l'écran Missions back-office (DET-001 tranche 11,
// MODE-1000) — JSX verbatim depuis bo-missions-screen.tsx : en-tête titre +
// badge statut, méta zone/équipe/assignées/dates, progression vers
// l'objectif, actions « Voir détails » / « Clôturer ».

import {
  MapPin,
  User,
  Calendar,
  CheckCircle2,
  Eye,
  Shield,
  Target,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useBackofficeStore, STATUS_LABELS } from '@/lib/stores/backoffice-store'
import {
  formatDate,
  computeMissionProgress,
  STATUS_BADGE_STYLES,
} from '@/lib/backoffice/missions-logic'
import type { BoMission } from '@/lib/backoffice/bo-models'

export function MissionCard({
  mission,
  onClose,
  onViewDetails,
}: {
  mission: BoMission
  onClose: (id: string) => void
  onViewDetails: (id: string) => void
}) {
  const boTheme = useBackofficeStore((s) => s.boTheme)
  const isDark = boTheme === 'dark'

  const progress = computeMissionProgress(mission.currentCount, mission.targetCount)

  return (
    <Card className={`${isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'border-slate-200 hover:border-slate-300'} transition-shadow ${isDark ? '' : 'hover:shadow-sm'}`}>
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3
              className={`font-bold text-base ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
            >
              {mission.title}
            </h3>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-1 line-clamp-2`}>
              {mission.description}
            </p>
          </div>
          <Badge
            className={`shrink-0 text-[11px] font-medium border ${STATUS_BADGE_STYLES[mission.status] || (isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-100 text-slate-600 border-slate-200')}`}
          >
            {STATUS_LABELS[mission.status]}
          </Badge>
        </div>

        {/* Meta row */}
        <div className={`flex flex-wrap gap-x-5 gap-y-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          <span className="flex items-center gap-1.5">
            <MapPin className={`h-3.5 w-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            {mission.zone}
          </span>
          {mission.teamName && (
            <span className="flex items-center gap-1.5">
              <Shield className={`h-3.5 w-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              {mission.teamName}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <User className={`h-3.5 w-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            {mission.assignees.length > 0 ? (
              mission.assignees.length === 1
                ? mission.assignees[0].name
                : `${mission.assignees.length} identificateurs`
            ) : (
              <span className={`italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Non assignée</span>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className={`h-3.5 w-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            {formatDate(mission.startDate)}
            {mission.endDate ? ` — ${formatDate(mission.endDate)}` : ''}
          </span>
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className={`${isDark ? 'text-slate-400' : 'text-slate-500'} font-medium`}>
              <Target className="inline h-3 w-3 mr-1" />
              Enrôlements réalisés
            </span>
            <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {mission.currentCount}/{mission.targetCount} ({Math.round(progress)}%)
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewDetails(mission.id)}
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Voir détails
          </Button>
          {mission.status === 'en_cours' && (
            <Button
              variant="outline"
              size="sm"
              className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              onClick={() => onClose(mission.id)}
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Clôturer
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
