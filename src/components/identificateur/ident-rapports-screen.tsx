'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, FileText, BarChart3, ClipboardList, Download, Share2, FileX } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore, type Dossier, type ActorType } from '@/lib/stores/identificateur-store'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

type ReportType = 'daily' | 'weekly' | 'monthly'

interface ReportOption {
  type: ReportType
  emoji: string
  title: string
  subtitle: string
  icon: typeof FileText
}

const REPORT_OPTIONS: ReportOption[] = [
  { type: 'daily', emoji: '📄', title: 'Rapport journalier', subtitle: 'Résumé de la journée', icon: FileText },
  { type: 'weekly', emoji: '📊', title: 'Rapport hebdomadaire', subtitle: 'Synthèse de la semaine', icon: BarChart3 },
  { type: 'monthly', emoji: '📋', title: 'Rapport mensuel', subtitle: 'Bilan mensuel complet', icon: ClipboardList },
]

const ACTOR_TYPE_LABELS: Record<ActorType, string> = {
  marchand: 'Marchand',
  producteur: 'Producteur',
  cooperative: 'Coopérative',
}

const STATUS_LABELS: Record<Dossier['status'], string> = {
  brouillon: 'Brouillon',
  en_attente: 'En attente',
  valide: 'Validé',
  rejete: 'Rejété',
}

const STATUS_VARIANT: Record<Dossier['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  brouillon: 'outline',
  en_attente: 'secondary',
  valide: 'default',
  rejete: 'destructive',
}

function getPeriodRange(reportType: ReportType): { start: number; end: number; label: string } {
  const now = new Date()
  const end = now.getTime()
  let start: number
  let label: string

  if (reportType === 'daily') {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    start = dayStart.getTime()
    label = dayStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  } else if (reportType === 'weekly') {
    const dayOfWeek = now.getDay() || 7
    const mondayOffset = dayOfWeek - 1
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset)
    start = monday.getTime()
    const sunday = new Date(monday)
    sunday.setDate(sunday.getDate() + 6)
    label = `${monday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${sunday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`
  } else {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    start = monthStart.getTime()
    label = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    label = label.charAt(0).toUpperCase() + label.slice(1)
  }

  return { start, end, label }
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function IdentRapportsScreen() {
  const { goBack, soleilMode } = useAppStore()
  const { dossiers } = useIdentificateurStore()
  const { toast } = useToast()
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null)

  const textClass = soleilMode ? 'text-black' : ''
  const headingClass = soleilMode ? 'text-lg' : 'text-base'
  const smallTextClass = soleilMode ? 'text-sm' : 'text-xs'

  // Filter dossiers for the selected period (exclude brouillons)
  const periodData = useMemo(() => {
    if (!selectedReport) return null
    const { start, end, label } = getPeriodRange(selectedReport)
    const filtered = dossiers.filter(
      (d) => d.status !== 'brouillon' && d.createdAt >= start && d.createdAt <= end
    )
    const validated = filtered.filter((d) => d.status === 'valide').length
    const rejected = filtered.filter((d) => d.status === 'rejete').length
    const enAttente = filtered.filter((d) => d.status === 'en_attente').length
    const newActors = validated // validated = new actors
    return { filtered, validated, rejected, enAttente, newActors, label, total: filtered.length }
  }, [dossiers, selectedReport])

  const handleDownload = () => {
    toast({ title: 'Fonctionnalité bientôt disponible' })
  }

  const handleShare = () => {
    toast({ title: 'Besoin de connexion internet' })
  }

  return (
    <div className="screen-enter pb-24">
      {/* Top bar */}
      <div
        className="px-4 py-3 flex items-center gap-3 rounded-b-2xl"
        style={{ backgroundColor: IDENT_COLOR }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="text-white/90 hover:text-white hover:bg-white/10 h-9 w-9"
          onClick={goBack}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="text-white font-bold text-sm tracking-wider">RAPPORTS</span>
      </div>

      {/* Report type cards */}
      <div className="px-4 mt-4">
        <div className="grid grid-cols-1 gap-3">
          {REPORT_OPTIONS.map((opt) => (
            <Card
              key={opt.type}
              className={cn(
                'cursor-pointer transition-all active:scale-[0.98]',
                selectedReport === opt.type && 'ring-2'
              )}
              style={
                selectedReport === opt.type
                  ? { borderColor: IDENT_COLOR, ringColor: IDENT_COLOR }
                  : undefined
              }
              onClick={() => setSelectedReport(opt.type)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <span className="text-2xl">{opt.emoji}</span>
                <div className="flex-1">
                  <p className={cn('font-semibold text-sm', textClass, soleilMode && 'text-base')}>
                    {opt.title}
                  </p>
                  <p className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm')}>
                    {opt.subtitle}
                  </p>
                </div>
                <opt.icon className="w-5 h-5 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Generated report */}
      {selectedReport && periodData && (
        <div className="px-4 mt-6">
          {/* Report header */}
          <Card className="overflow-hidden">
            <div
              className="px-4 py-3"
              style={{ backgroundColor: `${IDENT_COLOR}15` }}
            >
              <p className={cn('font-bold text-sm', textClass)} style={{ color: IDENT_COLOR }}>
                {REPORT_OPTIONS.find((r) => r.type === selectedReport)?.title}
              </p>
              <p className={cn('text-xs text-muted-foreground mt-0.5', soleilMode && 'text-sm')}>
                📅 {periodData.label}
              </p>
            </div>

            <CardContent className="p-4">
              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="text-center p-3 rounded-xl bg-muted/50">
                  <p className={cn('font-bold text-lg', textClass, soleilMode && 'text-2xl')} style={{ color: IDENT_COLOR }}>
                    {periodData.total}
                  </p>
                  <p className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm')}>Total dossiers</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-green-50/50">
                  <p className={cn('font-bold text-lg text-green-600', soleilMode && 'text-2xl')}>
                    {periodData.validated}
                  </p>
                  <p className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm')}>Validé</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-red-50/50">
                  <p className={cn('font-bold text-lg text-red-500', soleilMode && 'text-2xl')}>
                    {periodData.rejected}
                  </p>
                  <p className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm')}>Rejété</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-amber-50/50">
                  <p className={cn('font-bold text-lg text-amber-600', soleilMode && 'text-2xl')}>
                    {periodData.newActors}
                  </p>
                  <p className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm')}>Nouveaux acteurs</p>
                </div>
              </div>

              <Separator className="my-3" />

              {/* Dossier list */}
              <h3 className={cn('font-semibold text-sm mb-3', textClass, headingClass)}>
                Liste des dossiers
              </h3>

              {periodData.filtered.length === 0 ? (
                <div className="py-8 text-center">
                  <FileX className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                  <p className={cn('text-sm text-muted-foreground', soleilMode && 'text-base')}>
                    Aucune donnée pour cette période
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {periodData.filtered.map((dossier) => (
                    <div
                      key={dossier.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className={cn('text-sm font-medium truncate', textClass, soleilMode && 'text-base')}>
                          {dossier.firstName} {dossier.lastName}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={cn('text-[10px] text-muted-foreground', soleilMode && 'text-xs')}>
                            {ACTOR_TYPE_LABELS[dossier.actorType]}
                          </span>
                          <span className={cn('text-[10px] text-muted-foreground', soleilMode && 'text-xs')}>
                            · {formatDate(dossier.createdAt)}
                          </span>
                        </div>
                      </div>
                      <Badge variant={STATUS_VARIANT[dossier.status]} className={cn('text-[10px] shrink-0', soleilMode && 'text-xs')}>
                        {STATUS_LABELS[dossier.status]}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              <Separator className="my-3" />

              {/* Action buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleDownload}
                >
                  <Download className="w-4 h-4" />
                  Télécharger PDF
                </Button>
                <Button
                  className="flex-1 gap-2"
                  style={{ backgroundColor: IDENT_COLOR }}
                  onClick={handleShare}
                >
                  <Share2 className="w-4 h-4" />
                  Partager
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
