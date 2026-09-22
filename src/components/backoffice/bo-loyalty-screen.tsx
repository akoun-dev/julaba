'use client'

import { useCallback, useEffect, useState } from 'react'
import { Gift, Layers3, RefreshCw, Settings2, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BoPageHeader, BoErrorBanner } from './bo-ui'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'

interface LoyaltyData {
  rules: Array<{ id: string; name: string; action_type: string; points: number; status: string }>
  levels: Array<{ id: string; name: string; threshold_points: number; status: string }>
  rewards: Array<{ id: string; name: string; cost_points: number; status: string }>
  stats: { activeAccounts: number; pointsDistributed: number; pointsUsed: number; pointsExpired: number }
}

type ManageEntity = 'rule' | 'level' | 'reward'
type ConfigItem = { id: string; label: string; status: string }

export function BoLoyaltyScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const [data, setData] = useState<LoyaltyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [manageEntity, setManageEntity] = useState<ManageEntity | null>(null)
  const [form, setForm] = useState({ code: '', name: '', points: '', costPoints: '', thresholdPoints: '' })
  const [saving, setSaving] = useState(false)

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

  const openCreate = (entity: ManageEntity) => {
    setForm({ code: '', name: '', points: entity === 'rule' ? '10' : '', costPoints: entity === 'reward' ? '100' : '', thresholdPoints: entity === 'level' ? '0' : '' })
    setManageEntity(entity)
  }

  const createEntity = async () => {
    if (!manageEntity || !form.name.trim()) return
    setSaving(true)
    try {
      const data = manageEntity === 'rule'
        ? { name: form.name, actionType: 'activity', targetRoles: ['all'], points: Number(form.points), status: 'draft' }
        : manageEntity === 'reward'
          ? { code: form.code || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: form.name, rewardType: 'ADVANTAGE', costPoints: Number(form.costPoints), targetRoles: ['all'], status: 'draft' }
          : { code: form.code || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: form.name, thresholdPoints: Number(form.thresholdPoints), status: 'active' }
      const response = await fetch('/api/backoffice/loyalty', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: manageEntity, data }) })
      if (!response.ok) throw new Error('Création impossible')
      setManageEntity(null)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Création impossible')
    } finally {
      setSaving(false)
    }
  }

  const archiveEntity = async (entity: ManageEntity, id: string) => {
    if (!window.confirm('Archiver cet élément ?')) return
    try {
      const response = await fetch(`/api/backoffice/loyalty/${id}?entity=${entity}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Archivage impossible')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Archivage impossible')
    }
  }

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
     {loading ? <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">Chargement du programme fidélité…</div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(({ label, value, icon: Icon }) => <Card key={label} className={isDark ? 'border-slate-700 bg-slate-800' : ''}><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><Icon className="h-4 w-4 text-[#C66A2C]" /></div><p className="mt-2 text-2xl font-bold">{value.toLocaleString('fr-FR')}</p></CardContent></Card>)}</div>}
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
       <ConfigCard title="Règles actives" entity="rule" count={data?.rules.length ?? 0} empty="Aucune règle configurée." items={(data?.rules ?? []).map((item) => ({ id: item.id, label: `${item.name} · +${item.points} pts`, status: item.status }))} dark={isDark} onCreate={openCreate} onArchive={archiveEntity} />
       <ConfigCard title="Niveaux" entity="level" count={data?.levels.length ?? 0} empty="Aucun niveau configuré." items={(data?.levels ?? []).map((item) => ({ id: item.id, label: `${item.name} · ${item.threshold_points} pts`, status: item.status }))} dark={isDark} onCreate={openCreate} onArchive={archiveEntity} />
       <ConfigCard title="Récompenses" entity="reward" count={data?.rewards.length ?? 0} empty="Aucune récompense configurée." items={(data?.rewards ?? []).map((item) => ({ id: item.id, label: `${item.name} · ${item.cost_points} pts`, status: item.status }))} dark={isDark} onCreate={openCreate} onArchive={archiveEntity} />
     </div>
     <Dialog open={manageEntity !== null} onOpenChange={(open) => { if (!open) setManageEntity(null) }}>
       <DialogContent className="sm:max-w-md">
         <DialogHeader>
           <DialogTitle>Ajouter {manageEntity === 'rule' ? 'une règle' : manageEntity === 'level' ? 'un niveau' : 'une récompense'}</DialogTitle>
           <DialogDescription>La configuration est créée en brouillon lorsque cela est applicable.</DialogDescription>
         </DialogHeader>
         <div className="space-y-4 py-2">
           <div className="space-y-2"><Label htmlFor="loyalty-name">Nom</Label><Input id="loyalty-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
           {manageEntity !== 'rule' && <div className="space-y-2"><Label htmlFor="loyalty-code">Code</Label><Input id="loyalty-code" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="genere-si-vide" /></div>}
           {manageEntity === 'rule' && <div className="space-y-2"><Label htmlFor="loyalty-points">Points</Label><Input id="loyalty-points" type="number" min="1" value={form.points} onChange={(event) => setForm({ ...form, points: event.target.value })} /></div>}
           {manageEntity === 'reward' && <div className="space-y-2"><Label htmlFor="loyalty-cost">Coût en points</Label><Input id="loyalty-cost" type="number" min="1" value={form.costPoints} onChange={(event) => setForm({ ...form, costPoints: event.target.value })} /></div>}
           {manageEntity === 'level' && <div className="space-y-2"><Label htmlFor="loyalty-threshold">Seuil de points</Label><Input id="loyalty-threshold" type="number" min="0" value={form.thresholdPoints} onChange={(event) => setForm({ ...form, thresholdPoints: event.target.value })} /></div>}
         </div>
         <DialogFooter><Button variant="outline" onClick={() => setManageEntity(null)}>Annuler</Button><Button onClick={() => void createEntity()} disabled={saving || !form.name.trim()}>Créer</Button></DialogFooter>
       </DialogContent>
     </Dialog>
   </div>
}

function ConfigCard({ title, entity, count, empty, items, dark, onCreate, onArchive }: { title: string; entity: ManageEntity; count: number; empty: string; items: ConfigItem[]; dark: boolean; onCreate: (entity: ManageEntity) => void; onArchive: (entity: ManageEntity, id: string) => void }) {
  return <Card className={dark ? 'border-slate-700 bg-slate-800' : ''}><CardContent className="p-5"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{title}</h2><div className="flex items-center gap-2"><Badge variant="secondary">{count}</Badge><Button variant="outline" size="sm" onClick={() => onCreate(entity)}>Ajouter</Button></div></div>{items.length ? <ul className="space-y-2 text-sm">{items.slice(0, 8).map((item) => <li key={item.id} className="flex items-center justify-between gap-3 border-b border-slate-200/20 pb-2"><span className="min-w-0 truncate">{item.label} · {item.status}</span>{item.status !== 'archived' && <Button variant="ghost" size="sm" onClick={() => onArchive(entity, item.id)}>Archiver</Button>}</li>)}</ul> : <p className="text-sm text-slate-500">{empty}</p>}</CardContent></Card>
}
