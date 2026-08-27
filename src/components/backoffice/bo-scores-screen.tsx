'use client'

import { useState, useMemo } from 'react'
import {
  Search,
  CreditCard,
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
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
import { useBackofficeStore, BO_COLOR, BO_COLOR_BG } from '@/lib/stores/backoffice-store'
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

type RiskLevel = 'faible' | 'moyen' | 'eleve'

interface ScoredActor {
  id: string
  actorId: string
  name: string
  type: string
  zone: string
  score: number
  risk: RiskLevel
  creditRecommendation: string
  lastUpdated: string
}

// ============== MOCK DATA ==============

const SCORED_ACTORS: ScoredActor[] = [
  { id: 's-1', actorId: 'M-0845', name: 'Awa KOUASSI', type: 'marchand', zone: 'Adjamé', score: 82, risk: 'faible', creditRecommendation: 'Éligible crédit jusqu\'à 500 000 FCFA', lastUpdated: '2026-08-27T12:00:00Z' },
  { id: 's-2', actorId: 'P-0872', name: 'Ibrahim DIABY', type: 'producteur', zone: 'Bouaké', score: 91, risk: 'faible', creditRecommendation: 'Éligible crédit jusqu\'à 1 000 000 FCFA', lastUpdated: '2026-08-27T12:00:00Z' },
  { id: 's-3', actorId: 'M-0890', name: 'Paul BAMBA', type: 'marchand', zone: 'Yopougon', score: 28, risk: 'eleve', creditRecommendation: 'Non éligible — historique insuffisant', lastUpdated: '2026-08-27T11:00:00Z' },
  { id: 's-4', actorId: 'C-0801', name: 'Coopérative Akwaba', type: 'cooperatif', zone: 'Kong', score: 67, risk: 'moyen', creditRecommendation: 'Éligible crédit jusqu\'à 200 000 FCFA', lastUpdated: '2026-08-27T10:00:00Z' },
  { id: 's-5', actorId: 'M-0912', name: 'Kouadio Aminata', type: 'marchand', zone: 'Cocody', score: 78, risk: 'faible', creditRecommendation: 'Éligible crédit jusqu\'à 400 000 FCFA', lastUpdated: '2026-08-27T09:00:00Z' },
  { id: 's-6', actorId: 'P-0855', name: 'Traoré Moussa', type: 'producteur', zone: 'Daloa', score: 55, risk: 'moyen', creditRecommendation: 'Éligible crédit jusqu\'à 150 000 FCFA', lastUpdated: '2026-08-27T08:00:00Z' },
  { id: 's-7', actorId: 'M-0878', name: 'Fatoumata TRAORÉ', type: 'marchand', zone: 'Abobo', score: 34, risk: 'eleve', creditRecommendation: 'Non éligible — risque élevé', lastUpdated: '2026-08-26T16:00:00Z' },
  { id: 's-8', actorId: 'M-0901', name: 'Soro Marie', type: 'marchand', zone: 'Plateau', score: 72, risk: 'moyen', creditRecommendation: 'Éligible crédit jusqu\'à 300 000 FCFA', lastUpdated: '2026-08-26T14:00:00Z' },
  { id: 's-9', actorId: 'M-0925', name: 'Koné Aminata', type: 'marchand', zone: 'Adjamé', score: 88, risk: 'faible', creditRecommendation: 'Éligible crédit jusqu\'à 600 000 FCFA', lastUpdated: '2026-08-26T12:00:00Z' },
  { id: 's-10', actorId: 'P-0880', name: 'Ouattara Yao', type: 'producteur', zone: 'Yamoussoukro', score: 62, risk: 'moyen', creditRecommendation: 'Éligible crédit jusqu\'à 200 000 FCFA', lastUpdated: '2026-08-26T10:00:00Z' },
  { id: 's-11', actorId: 'M-0933', name: 'Diallo Aïcha', type: 'marchand', zone: 'Bouaké', score: 45, risk: 'eleve', creditRecommendation: 'Non éligible — score limite', lastUpdated: '2026-08-25T16:00:00Z' },
  { id: 's-12', actorId: 'C-0815', name: 'Coopérative Kwa', type: 'cooperatif', zone: 'Kong', score: 95, risk: 'faible', creditRecommendation: 'Éligible crédit jusqu\'à 1 500 000 FCFA', lastUpdated: '2026-08-25T14:00:00Z' },
]

// Score distribution histogram: exact ranges 0-20, 20-40, 40-60, 60-80, 80-100
const DISTRIBUTION = [
  { range: '0-20', count: 120, fill: '#DC2626' },
  { range: '20-40', count: 340, fill: '#D97706' },
  { range: '40-60', count: 890, fill: '#D97706' },
  { range: '60-80', count: 1560, fill: '#059669' },
  { range: '80-100', count: 890, fill: '#059669' },
]

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; icon: React.ReactNode }> = {
  faible: { label: 'Faible', color: 'bg-emerald-100 text-emerald-700', icon: <ShieldCheck className="h-3 w-3" /> },
  moyen: { label: 'Moyen', color: 'bg-amber-100 text-amber-700', icon: <AlertTriangle className="h-3 w-3" /> },
  eleve: { label: 'Élevé', color: 'bg-red-100 text-red-700', icon: <AlertTriangle className="h-3 w-3" /> },
}

const ZONES = ['Adjamé', 'Cocody', 'Plateau', 'Yopougon', 'Abobo', 'Bouaké', 'Kong', 'Daloa', 'Yamoussoukro']

// ============== MAIN COMPONENT ==============

export function BoScoresScreen() {
  const { searchQuery, setSearchQuery } = useBackofficeStore()
  const [riskFilter, setRiskFilter] = useState<string>('tous')
  const [zoneFilter, setZoneFilter] = useState<string>('tous')

  const filtered = useMemo(() => {
    return SCORED_ACTORS.filter((a) => {
      const matchSearch = !searchQuery ||
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.actorId.toLowerCase().includes(searchQuery.toLowerCase())
      const matchRisk = riskFilter === 'tous' || a.risk === riskFilter
      const matchZone = zoneFilter === 'tous' || a.zone === zoneFilter
      return matchSearch && matchRisk && matchZone
    })
  }, [searchQuery, riskFilter, zoneFilter])

  const avgScore = Math.round(SCORED_ACTORS.reduce((s, a) => s + a.score, 0) / SCORED_ACTORS.length)
  const riskCounts = {
    faible: SCORED_ACTORS.filter((a) => a.risk === 'faible').length,
    moyen: SCORED_ACTORS.filter((a) => a.risk === 'moyen').length,
    eleve: SCORED_ACTORS.filter((a) => a.risk === 'eleve').length,
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
    <div className="p-6 space-y-6" style={{ backgroundColor: BO_COLOR_BG, minHeight: '100vh' }}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: BO_COLOR }}>
          <span className="inline-flex items-center gap-2"><CreditCard className="h-6 w-6" />SCORE FINANCIER</span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Évaluation du risque et scoring financier des acteurs — Moyenne : 67/100
        </p>
      </div>

      <Separator />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Score moyen</p>
            <div className="flex items-end gap-2 mt-1">
              <p className={`text-3xl font-bold ${getScoreColor(avgScore)}`}>{avgScore}</p>
              <span className="text-sm font-normal text-gray-400 mb-1">/100</span>
              <div className="ml-auto flex items-center gap-1 text-emerald-600 text-xs font-medium mb-1.5">
                <TrendingUp className="h-3.5 w-3.5" />+3 pts
              </div>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full mt-2 overflow-hidden">
              <div className={`h-full rounded-full ${getScoreBg(avgScore)}`} style={{ width: `${avgScore}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-emerald-500" /> Risque faible</p>
            <p className="text-2xl font-bold mt-1 text-emerald-600">{riskCounts.faible}</p>
            <p className="text-xs text-gray-400 mt-0.5">{((riskCounts.faible / SCORED_ACTORS.length) * 100).toFixed(0)}% des acteurs</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-amber-500" /> Risque moyen</p>
            <p className="text-2xl font-bold mt-1 text-amber-600">{riskCounts.moyen}</p>
            <p className="text-xs text-gray-400 mt-0.5">{((riskCounts.moyen / SCORED_ACTORS.length) * 100).toFixed(0)}% des acteurs</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-red-500" /> Risque élevé</p>
            <p className="text-2xl font-bold mt-1 text-red-600">{riskCounts.eleve}</p>
            <p className="text-xs text-gray-400 mt-0.5">{((riskCounts.eleve / SCORED_ACTORS.length) * 100).toFixed(0)}% des acteurs</p>
          </CardContent>
        </Card>
      </div>

      {/* Distribution Chart */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold" style={{ color: BO_COLOR }}>
            Distribution des scores (histogramme)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DISTRIBUTION}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#6B7280' }} />
                <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }} formatter={(value: number) => [value.toLocaleString('fr-FR'), 'Acteurs']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {DISTRIBUTION.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Rechercher un acteur..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Niveau de risque" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous niveaux</SelectItem>
            <SelectItem value="faible"><span className="inline-flex items-center gap-1.5"><span className="bg-emerald-500 rounded-full w-2 h-2 inline-block" />Faible</span></SelectItem>
            <SelectItem value="moyen"><span className="inline-flex items-center gap-1.5"><span className="bg-amber-500 rounded-full w-2 h-2 inline-block" />Moyen</span></SelectItem>
            <SelectItem value="eleve"><span className="inline-flex items-center gap-1.5"><span className="bg-red-500 rounded-full w-2 h-2 inline-block" />Élevé</span></SelectItem>
          </SelectContent>
        </Select>
        <Select value={zoneFilter} onValueChange={setZoneFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Zone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Toutes zones</SelectItem>
            {ZONES.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Actors Table */}
      <Card className="border-0 shadow-sm">
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
                  const rc = RISK_CONFIG[actor.risk]
                  return (
                    <TableRow key={actor.id}>
                      <TableCell className="text-xs py-3">
                        <div>
                          <p className="font-semibold" style={{ color: BO_COLOR }}>{actor.name}</p>
                          <p className="text-gray-400">{actor.actorId} · {actor.type}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs py-3 text-gray-600">{actor.zone}</TableCell>
                      <TableCell className="text-xs py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
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
                      <TableCell className="text-xs py-3 text-gray-600 max-w-[200px] truncate">{actor.creditRecommendation}</TableCell>
                      <TableCell className="text-xs py-3 text-gray-400">
                        {new Date(actor.lastUpdated).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucun acteur trouvé</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
