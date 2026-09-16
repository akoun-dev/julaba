'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  CreditCard,
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  AlertOctagon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { useBackofficeZoneNames } from '@/lib/hooks/use-backoffice-zones'
import { BoPageHeader, BoErrorBanner } from './bo-ui'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

// ============== TYPES ==============

type RiskLevel = 'faible' | 'moyen' | 'eleve' | 'critique'

interface ScoredActor {
  id: string
  actorId: string
  name: string
  type: string
  zone: string
  score: number
  riskLevel: RiskLevel
  creditRecommendation: string
  lastUpdated: string
}

interface DistributionItem {
  range: string
  count: number
  fill: string
}

// ============== MAIN COMPONENT ==============

export function BoScoresScreen() {
  const { searchQuery, setSearchQuery, boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const zones = useBackofficeZoneNames()

  const [riskFilter, setRiskFilter] = useState<string>('tous')
  const [zoneFilter, setZoneFilter] = useState<string>('tous')
  const [scores, setScores] = useState<ScoredActor[]>([])
  const [distribution, setDistribution] = useState<DistributionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/scores')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
       setScores((data.scores ?? []).map((score: Record<string, unknown>) => ({
         id: String(score.id ?? ''),
         actorId: String(score.actorId ?? score.actor_id ?? ''),
         name: String(score.name ?? score.actor_name ?? 'Acteur inconnu'),
         type: String(score.type ?? 'Acteur'),
         zone: String(score.zone ?? 'Zone inconnue'),
         score: Number(score.score ?? 0),
         riskLevel: (['faible', 'moyen', 'eleve', 'critique'].includes(String(score.riskLevel ?? score.risk_level))
           ? String(score.riskLevel ?? score.risk_level)
           : 'moyen') as RiskLevel,
         creditRecommendation: String(score.creditRecommendation ?? score.credit_recommendation ?? 'Non disponible'),
         lastUpdated: String(score.lastUpdated ?? score.last_calculated_at ?? score.updated_at ?? new Date().toISOString()),
       })))
      setDistribution(data.distribution ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; icon: React.ReactNode }> = {
    faible: { label: 'Faible', color: isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700', icon: <ShieldCheck className="h-3 w-3" /> },
    moyen: { label: 'Moyen', color: isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700', icon: <AlertTriangle className="h-3 w-3" /> },
    eleve: { label: 'Élevé', color: isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-700', icon: <AlertTriangle className="h-3 w-3" /> },
    critique: { label: 'Critique', color: isDark ? 'bg-red-600/20 text-red-300' : 'bg-red-50 text-red-800', icon: <AlertOctagon className="h-3 w-3" /> },
  }

  const gridStroke = isDark ? '#334155' : '#E2E8F0'
  const tickFill = isDark ? '#64748B' : '#6B7280'
  const tooltipStyle: React.CSSProperties = isDark
    ? { borderRadius: '8px', border: '1px solid #334155', fontSize: '12px', backgroundColor: '#1E293B', color: '#E2E8F0' }
    : { borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }

  const filtered = useMemo(() => {
    return scores.filter((a) => {
      const matchSearch = !searchQuery ||
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.actorId.toLowerCase().includes(searchQuery.toLowerCase())
      const matchRisk = riskFilter === 'tous' || a.riskLevel === riskFilter
      const matchZone = zoneFilter === 'tous' || a.zone === zoneFilter
      return matchSearch && matchRisk && matchZone
    })
  }, [scores, searchQuery, riskFilter, zoneFilter])

  const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, a) => s + a.score, 0) / scores.length) : 0
  const riskCounts = {
    faible: scores.filter((a) => a.riskLevel === 'faible').length,
    moyen: scores.filter((a) => a.riskLevel === 'moyen').length,
    eleve: scores.filter((a) => a.riskLevel === 'eleve').length,
    critique: scores.filter((a) => a.riskLevel === 'critique').length,
  }

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-emerald-600'
    if (score >= 50) return 'text-amber-600'
    return 'text-red-600'
  }

  const getScoreBg = (score: number) => {
    if (score >= 70) return 'bg-emerald-500'
    if (score >= 50) return 'bg-amber-500'
    return 'bg-red-500'
  }

  return (
    <div className={'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')} style={{ minHeight: '100%' }}>
      {/* Header */}
      <BoPageHeader
        title="Score financier"
        description={`Évaluation du risque et scoring financier des acteurs${!loading && scores.length > 0 ? ` — Moyenne : ${avgScore}/100` : ''}`}
      />

      <Separator />

      {/* Error */}
      {error && !loading && <BoErrorBanner message={error} onRetry={fetchData} />}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Score moyen</p>
            {loading ? <Skeleton className="h-8 w-16 mt-1" /> : (
              <div className="flex items-end gap-2 mt-1">
                <p className={`text-3xl font-bold ${getScoreColor(avgScore)}`}>{avgScore}</p>
                <span className={`text-sm font-normal mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>/100</span>
                <div className="ml-auto flex items-center gap-1 text-emerald-600 text-xs font-medium mb-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />+3 pts
                </div>
              </div>
            )}
            {!loading && (
              <div className={`w-full h-2 rounded-full mt-2 overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                <div className={`h-full rounded-full ${getScoreBg(avgScore)}`} style={{ width: `${avgScore}%` }} />
              </div>
            )}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <p className={`text-xs uppercase tracking-wide flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}><ShieldCheck className="h-3 w-3 text-emerald-500" /> Risque faible</p>
            {loading ? <Skeleton className="h-8 w-8 mt-1" /> : <p className="text-2xl font-bold mt-1 text-emerald-600">{riskCounts.faible}</p>}
            {!loading && scores.length > 0 && <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{((riskCounts.faible / scores.length) * 100).toFixed(0)}% des acteurs</p>}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <p className={`text-xs uppercase tracking-wide flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}><AlertTriangle className="h-3 w-3 text-amber-500" /> Risque moyen</p>
            {loading ? <Skeleton className="h-8 w-8 mt-1" /> : <p className="text-2xl font-bold mt-1 text-amber-600">{riskCounts.moyen}</p>}
            {!loading && scores.length > 0 && <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{((riskCounts.moyen / scores.length) * 100).toFixed(0)}% des acteurs</p>}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <p className={`text-xs uppercase tracking-wide flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}><AlertTriangle className="h-3 w-3 text-red-500" /> Risque élevé</p>
            {loading ? <Skeleton className="h-8 w-8 mt-1" /> : <p className="text-2xl font-bold mt-1 text-red-600">{riskCounts.eleve}</p>}
            {!loading && scores.length > 0 && <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{((riskCounts.eleve / scores.length) * 100).toFixed(0)}% des acteurs</p>}
          </CardContent>
        </Card>
      </div>

      {/* Distribution Chart */}
      {!loading && !error && distribution.length > 0 && (
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              Distribution des scores (histogramme)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="range" tick={{ fontSize: 12, fill: tickFill }} />
                  <YAxis tick={{ fontSize: 12, fill: tickFill }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [value.toLocaleString('fr-FR'), 'Acteurs']} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
      {loading && !error && (
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-6">
            <Skeleton className="h-4 w-64 mb-4" />
            <Skeleton className="h-56 w-full" />
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className={isDark ? 'bg-slate-800 border-slate-700' : ''}>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              <Input placeholder="Rechercher un acteur..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
            </div>
            <div className={`h-6 w-px hidden sm:block ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-[170px] h-9">
                <SelectValue placeholder="Niveau de risque" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous niveaux</SelectItem>
                <SelectItem value="faible"><span className="inline-flex items-center gap-1.5"><span className="bg-emerald-500 rounded-full w-2 h-2 inline-block" />Faible</span></SelectItem>
                <SelectItem value="moyen"><span className="inline-flex items-center gap-1.5"><span className="bg-amber-500 rounded-full w-2 h-2 inline-block" />Moyen</span></SelectItem>
                <SelectItem value="eleve"><span className="inline-flex items-center gap-1.5"><span className="bg-red-500 rounded-full w-2 h-2 inline-block" />Élevé</span></SelectItem>
                <SelectItem value="critique"><span className="inline-flex items-center gap-1.5"><span className="bg-red-700 rounded-full w-2 h-2 inline-block" />Critique</span></SelectItem>
              </SelectContent>
            </Select>
            <Select value={zoneFilter} onValueChange={setZoneFilter}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Toutes zones</SelectItem>
                {zones.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Actors Table */}
      {!loading && !error && (
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Acteur</TableHead>
                    <TableHead className="text-xs">Zone</TableHead>
                    <TableHead className="text-xs">Score</TableHead>
                    <TableHead className="text-xs">Risque</TableHead>
                    <TableHead className="text-xs">Recommandation crédit</TableHead>
                    <TableHead className="text-xs">Mis à jour</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((actor) => {
                     const rc = RISK_CONFIG[actor.riskLevel] ?? RISK_CONFIG.moyen
                    return (
                      <TableRow key={actor.id}>
                        <TableCell className="text-xs py-3">
                          <div>
                            <p className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{actor.name}</p>
                            <p className={isDark ? 'text-slate-500' : 'text-slate-400'}>{actor.actorId} · {actor.type}</p>
                          </div>
                        </TableCell>
                        <TableCell className={`text-xs py-3 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>{actor.zone}</TableCell>
                        <TableCell className="text-xs py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-16 h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                              <div className={`h-full rounded-full ${getScoreBg(actor.score)}`} style={{ width: `${actor.score}%` }} />
                            </div>
                            <span className={`font-bold tabular-nums ${getScoreColor(actor.score)}`}>{actor.score}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge variant="secondary" className={`text-[10px] px-2 py-0 gap-1 ${rc.color}`}>
                            {rc.icon}<span>{rc.label}</span>
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-xs py-3 max-w-[200px] truncate ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>{actor.creditRecommendation}</TableCell>
                        <TableCell className={`text-xs py-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          {new Date(actor.lastUpdated).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            {filtered.length === 0 && (
              <div className={`text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Aucun acteur trouvé</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loading table */}
      {loading && !error && (
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Acteur</TableHead>
                  <TableHead className="text-xs">Zone</TableHead>
                  <TableHead className="text-xs">Score</TableHead>
                  <TableHead className="text-xs">Risque</TableHead>
                  <TableHead className="text-xs">Recommandation crédit</TableHead>
                  <TableHead className="text-xs">Mis à jour</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20 mt-1" /></TableCell>
                    <TableCell className="py-3"><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell className="py-3"><div className="flex items-center gap-2"><Skeleton className="h-2 w-16" /><Skeleton className="h-4 w-8" /></div></TableCell>
                    <TableCell className="py-3"><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell className="py-3"><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell className="py-3"><Skeleton className="h-4 w-20" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
