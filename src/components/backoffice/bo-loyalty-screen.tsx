'use client'

import { useCallback, useEffect, useState } from 'react'
import { Gift, Layers3, RefreshCw, Settings2, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BoPageHeader, BoErrorBanner } from './bo-ui'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'

interface LoyaltyData {
  rules: Array<{ id: string; name: string; action_type: string; points: number; status: string }>
  levels: Array<{ id: string; name: string; threshold_points: number; status: string }>
  rewards: Array<{ id: string; name: string; cost_points: number; status: string }>
  stats: { activeAccounts: number; pointsDistributed: number; pointsUsed: number; pointsExpired: number }
}

export function BoLoyaltyScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const [data, setData] = useState<LoyaltyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/backoffice/loyalty')
      if (!response.ok) throw new Error(`Erreur ${response.status}`)
      setData(await response.json() as LoyaltyData)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const cards = data ? [
    { label: 'Comptes actifs', value: data.stats.activeAccounts, icon: Users },
    { label: 'Points distribués', value: data.stats.pointsDistributed, icon: Layers3 },
    { label: 'Points utilisés', value: data.stats.pointsUsed, icon: Gift },
    { label: 'Points expirés', value: data.stats.pointsExpired, icon: Settings2 },
  ] : []

  return <div className={`min-h-full space-y-6 p-6 ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-[#F8FAFC]'}`}>
    <BoPageHeader title="Avantages fidélité" description="Programme multi-profils, règles, niveaux et récompenses. Challenges et parrainage exclus." />
    <div className="flex justify-end"><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualiser</Button></div>
    {error && <BoErrorBanner message={error} onRetry={load} />}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(({ label, value, icon: Icon }) => <Card key={label} className={isDark ? 'border-slate-700 bg-slate-800' : ''}><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><Icon className="h-4 w-4 text-[#C66A2C]" /></div><p className="mt-2 text-2xl font-bold">{value.toLocaleString('fr-FR')}</p></CardContent></Card>)}</div>
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <ConfigCard title="Règles actives" count={data?.rules.length ?? 0} empty="Aucune règle configurée." items={(data?.rules ?? []).map((item) => `${item.name} · +${item.points} pts · ${item.status}`)} dark={isDark} />
      <ConfigCard title="Niveaux" count={data?.levels.length ?? 0} empty="Aucun niveau configuré." items={(data?.levels ?? []).map((item) => `${item.name} · ${item.threshold_points} pts · ${item.status}`)} dark={isDark} />
      <ConfigCard title="Récompenses" count={data?.rewards.length ?? 0} empty="Aucune récompense configurée." items={(data?.rewards ?? []).map((item) => `${item.name} · ${item.cost_points} pts · ${item.status}`)} dark={isDark} />
    </div>
  </div>
}

function ConfigCard({ title, count, empty, items, dark }: { title: string; count: number; empty: string; items: string[]; dark: boolean }) {
  return <Card className={dark ? 'border-slate-700 bg-slate-800' : ''}><CardContent className="p-5"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{title}</h2><Badge variant="secondary">{count}</Badge></div>{items.length ? <ul className="space-y-2 text-sm">{items.slice(0, 8).map((item) => <li key={item} className="border-b border-slate-200/20 pb-2">{item}</li>)}</ul> : <p className="text-sm text-slate-500">{empty}</p>}</CardContent></Card>
}
