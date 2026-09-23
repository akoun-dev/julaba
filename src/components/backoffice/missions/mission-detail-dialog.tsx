'use client'

// Dialog de détail d'une mission de l'écran Missions back-office (DET-001
// tranche 11, MODE-1000) — JSX verbatim depuis bo-missions-screen.tsx :
// chargement API /api/backoffice/missions/[id], en-tête titre + badge,
// méta zone/équipe/dates, progression, identificateurs assignés,
// enrôlements récents.

import { useState, useEffect } from 'react'
import { Loader2, MapPin, Shield, Calendar, Target, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useBackofficeStore, STATUS_LABELS } from '@/lib/stores/backoffice-store'
import {
  formatDate,
  computeMissionProgress,
  STATUS_BADGE_STYLES,
} from '@/lib/backoffice/missions-logic'
import type { BoMission } from '@/lib/backoffice/bo-models'

interface MissionDetailAssignee {
  id: string
  name: string
  zone: string | null
  enrolmentCount: number
}

interface MissionDetailEnrolment {
  id: string
  actor_name: string
  status: string
  submitted_at: string
  identificateur_name: string
}

interface MissionDetail {
  id: string
  title: string
  description: string | null
  zone: string
  status: BoMission['status']
  target_count: number
  current_count: number
  start_date: string
  end_date: string | null
  team: { id: string; name: string } | null
  assignees: MissionDetailAssignee[]
  recent_enrolments: MissionDetailEnrolment[]
}

export function MissionDetailDialog({
  missionId,
  onOpenChange,
}: {
  missionId: string | null
  onOpenChange: (v: boolean) => void
}) {
  const boTheme = useBackofficeStore((s) => s.boTheme)
  const isDark = boTheme === 'dark'
  const [detail, setDetail] = useState<MissionDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!missionId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/backoffice/missions/${missionId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
        return res.json()
      })
      .then((data) => { if (!cancelled) setDetail(data) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur de chargement') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [missionId])

  const progress = detail ? computeMissionProgress(detail.current_count, detail.target_count) : 0

  return (
    <Dialog open={!!missionId} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogTitle className="sr-only">Détails de la mission</DialogTitle>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-red-600">{error}</div>
        ) : detail ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle className={`text-lg ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {detail.title}
                </DialogTitle>
                <Badge className={`text-[11px] font-medium border ${STATUS_BADGE_STYLES[detail.status] || ''}`}>
                  {STATUS_LABELS[detail.status]}
                </Badge>
              </div>
              {detail.description && (
                <DialogDescription>{detail.description}</DialogDescription>
              )}
            </DialogHeader>

            <div className="space-y-5">
              <div className={`flex flex-wrap gap-x-5 gap-y-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{detail.zone}</span>
                {detail.team && <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" />{detail.team.name}</span>}
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(detail.start_date)}{detail.end_date ? ` — ${formatDate(detail.end_date)}` : ''}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className={`${isDark ? 'text-slate-400' : 'text-slate-500'} font-medium`}>
                    <Target className="inline h-3 w-3 mr-1" />
                    Progression vers l'objectif
                  </span>
                  <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {detail.current_count}/{detail.target_count} ({Math.round(progress)}%)
                  </span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className={`flex items-center gap-1.5 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  <Users className="h-4 w-4" />
                  Identificateurs assignés ({detail.assignees.length})
                </h4>
                {detail.assignees.length === 0 ? (
                  <p className={`text-sm italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Aucun identificateur assigné.</p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.assignees.map((a) => (
                      <div key={a.id} className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${isDark ? 'bg-slate-700/40' : 'bg-slate-50'}`}>
                        <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>
                          {a.name}
                          {a.zone && <span className={`ml-1.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>· {a.zone}</span>}
                        </span>
                        <Badge variant="outline" className={isDark ? 'border-slate-600 text-slate-300' : ''}>
                          {a.enrolmentCount} enrôlement{a.enrolmentCount > 1 ? 's' : ''}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  Enrôlements récents de la mission
                </h4>
                {detail.recent_enrolments.length === 0 ? (
                  <p className={`text-sm italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Aucun enrôlement encore soumis pour cette mission.</p>
                ) : (
                  <ScrollArea className="h-48 rounded-lg border">
                    <div className="divide-y">
                      {detail.recent_enrolments.map((e) => (
                        <div key={e.id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className={`truncate font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{e.actor_name}</p>
                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              {e.identificateur_name} · {formatDate(e.submitted_at)}
                            </p>
                          </div>
                          <Badge className={`text-[11px] shrink-0 ${STATUS_BADGE_STYLES[e.status] || (isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600')}`}>
                            {STATUS_LABELS[e.status] || e.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
