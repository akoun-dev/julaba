'use client'

import { useState, useEffect, useCallback } from 'react'
import { PiggyBank, Users, Coins } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { formatFCFA } from '@/lib/voice/localIntent'
import { BoPageHeader, BoErrorBanner } from './bo-ui'

interface TontineMemberInfo {
  id: string
  joinedAt: string
  merchant: { id: string; firstName: string; phone: string } | null
}

interface TontineInfo {
  id: string
  name: string
  amount: number
  frequency: string
  memberCount: number
  nextDueDate: string | null
  createdAt: string
  members: TontineMemberInfo[]
  totalCotiseFcfa: number
}

interface ContributionInfo {
  id: string
  tontineId: string
  merchantId: string
  amount: number
  createdAt: string
  merchant: { id: string; firstName: string; phone: string } | null
}

const FREQUENCY_LABEL: Record<string, string> = {
  quotidien: 'Quotidien',
  hebdomadaire: 'Hebdomadaire',
  mensuel: 'Mensuel',
}

export function BoTontinesScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const [tontines, setTontines] = useState<TontineInfo[]>([])
  const [contributions, setContributions] = useState<ContributionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/tontines')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setTontines(data.tontines ?? [])
      setContributions(data.contributions ?? [])
    } catch {
      setError('Impossible de charger les tontines.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  const totalMembers = tontines.reduce((sum, t) => sum + t.memberCount, 0)
  const totalCotise = tontines.reduce((sum, t) => sum + t.totalCotiseFcfa, 0)

  return (
    <div className={`p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`} style={{ minHeight: '100vh' }}>
      <BoPageHeader
        title="Tontines"
        description="Tontines actives et cotisations enregistrées par les marchands — module auparavant sans aucune visibilité côté backoffice."
      />

      <Separator />

      <div className="grid grid-cols-3 gap-4">
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <PiggyBank className="h-4 w-4" /> Tontines
            </div>
            {loading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{tontines.length}</p>}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" /> Membres au total
            </div>
            {loading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{totalMembers}</p>}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Coins className="h-4 w-4" /> Total cotisé
            </div>
            {loading ? <Skeleton className="h-8 w-24 mt-1" /> : <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{formatFCFA(totalCotise)}</p>}
          </CardContent>
        </Card>
      </div>

      {error && !loading && <BoErrorBanner message={error} onRetry={fetchData} />}

      <div>
        <h2 className={`text-sm font-semibold mb-3 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>Tontines</h2>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
          <CardContent className="p-0 divide-y divide-border">
            {loading && Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-4"><Skeleton className="h-5 w-64" /></div>
            ))}
            {!loading && tontines.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground text-center">Aucune tontine enregistrée.</p>
            )}
            {!loading && tontines.map((t) => (
              <div key={t.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {t.name} · {formatFCFA(t.amount)} · {FREQUENCY_LABEL[t.frequency] ?? t.frequency}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.memberCount} membre{t.memberCount > 1 ? 's' : ''} · Total cotisé {formatFCFA(t.totalCotiseFcfa)}
                    {t.nextDueDate ? ` · Prochaine échéance ${formatDate(t.nextDueDate)}` : ''}
                  </p>
                </div>
                <Badge className="bg-emerald-100 text-emerald-700 shrink-0">Active</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className={`text-sm font-semibold mb-3 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>Cotisations récentes</h2>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
          <CardContent className="p-0 divide-y divide-border">
            {loading && Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-4"><Skeleton className="h-5 w-64" /></div>
            ))}
            {!loading && contributions.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground text-center">Aucune cotisation enregistrée.</p>
            )}
            {!loading && contributions.map((c) => (
              <div key={c.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {c.merchant ? `${c.merchant.firstName} · ${c.merchant.phone}` : `Marchand ${c.merchantId.slice(0, 8)}…`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDate(c.createdAt)}</p>
                </div>
                <Badge className="bg-blue-100 text-blue-700 shrink-0">{formatFCFA(c.amount)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
