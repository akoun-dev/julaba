'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, FileText, Plus, Search, ShieldCheck, Users, Warehouse } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoEmptyState, BoErrorBanner, BoPageHeader, BoStatCard } from './bo-ui'

type CoopStatus = 'brouillon' | 'en_attente_validation' | 'active' | 'suspendue' | 'archivee'
type Summary = { total: number; actifs: number; suspendus: number; attente: number; stock: number; ventes: number }
type Coop = { id: string; nom: string; nom_usuel: string | null; sigle: string | null; commune: string | null; region: string | null; filieres: string[]; statut: CoopStatus; responsable_id: string; created_at: string; stats: Summary }
type Detail = { cooperative: Coop; members: Array<{ id: string; statut: string; role: string; date_adhesion: string | null; merchant: { first_name: string; last_name: string | null; phone: string } | null }>; roles: Array<{ id: string; code: string; libelle: string; cooperative_role_permissions: Array<{ permission_code: string }> }>; documents: Array<{ id: string; nom: string; type: string; statut: string; expires_at: string | null }>; audit: Array<{ id: string; action: string; entity_type: string; created_at: string }> }

const STATUS: Record<CoopStatus, { label: string; tone: string }> = {
  brouillon: { label: 'Brouillon', tone: 'bg-slate-100 text-slate-700' },
  en_attente_validation: { label: 'En attente de validation', tone: 'bg-amber-100 text-amber-800' },
  active: { label: 'Active', tone: 'bg-emerald-100 text-emerald-800' },
  suspendue: { label: 'Suspendue', tone: 'bg-red-100 text-red-800' },
  archivee: { label: 'Archivée', tone: 'bg-slate-200 text-slate-700' },
}

export function BoCooperativesScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const [cooperatives, setCooperatives] = useState<Coop[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'tous' | CoopStatus>('tous')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({ nom: '', responsableId: '', commune: '', region: '', filieres: '' })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/backoffice/cooperatives')
      const data = await res.json()
      if (!res.ok) throw new Error(data.erreur)
      setCooperatives(data.cooperatives ?? [])
    } catch (err) { setError(err instanceof Error ? err.message : 'Impossible de charger les coopératives.') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const openDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/backoffice/cooperatives?id=${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.erreur)
      setDetail(data)
    } catch (err) { setError(err instanceof Error ? err.message : 'Impossible de charger la fiche.') }
  }
  const update = async (payload: Record<string, unknown>) => {
    if (!detail) return
    setSaving(true); setFormError(null)
    try {
      const res = await fetch('/api/backoffice/cooperatives', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cooperativeId: detail.cooperative.id, ...payload }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.erreur)
      await Promise.all([load(), openDetail(detail.cooperative.id)])
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Modification impossible.') } finally { setSaving(false) }
  }
  const create = async () => {
    setSaving(true); setFormError(null)
    try {
      const res = await fetch('/api/backoffice/cooperatives', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, filieres: form.filieres.split(',').map((v) => v.trim()).filter(Boolean) }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.erreur)
      setCreateOpen(false); setForm({ nom: '', responsableId: '', commune: '', region: '', filieres: '' }); await load(); await openDetail(data.cooperative.id)
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Création impossible.') } finally { setSaving(false) }
  }
  const filtered = useMemo(() => cooperatives.filter((c) => (status === 'tous' || c.statut === status) && `${c.nom} ${c.nom_usuel ?? ''} ${c.sigle ?? ''} ${c.commune ?? ''} ${c.region ?? ''} ${c.filieres.join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [cooperatives, query, status])
  const totals = useMemo(() => ({ active: cooperatives.filter((c) => c.statut === 'active').length, members: cooperatives.reduce((n, c) => n + c.stats.total, 0), pending: cooperatives.reduce((n, c) => n + c.stats.attente, 0) }), [cooperatives])
  const card = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'

  return <div className={`screen-enter min-h-full p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`}>
    <BoPageHeader title="Coopératives" description="Gouvernance, adhésions, rôles, documents et traçabilité des coopératives agricoles." actions={<Button onClick={() => { setFormError(null); setCreateOpen(true) }}><Plus className="mr-2 size-4" />Créer une coopérative</Button>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><BoStatCard icon={Building2} label="Coopératives" value={loading ? '—' : cooperatives.length} tone="blue" /><BoStatCard icon={ShieldCheck} label="Coopératives actives" value={loading ? '—' : totals.active} tone="emerald" /><BoStatCard icon={Users} label="Membres" value={loading ? '—' : totals.members} tone="default" /><BoStatCard icon={Users} label="Adhésions en attente" value={loading ? '—' : totals.pending} tone="amber" /></div>
    {error && <BoErrorBanner message={error} onRetry={load} />}
    <Card className={card}><CardContent className="flex flex-wrap gap-3 p-4"><div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input aria-label="Rechercher une coopérative" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, sigle, filière, lieu…" /></div><Select value={status} onValueChange={(v) => setStatus(v as typeof status)}><SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tous">Tous les statuts</SelectItem>{Object.entries(STATUS).map(([key, value]) => <SelectItem key={key} value={key}>{value.label}</SelectItem>)}</SelectContent></Select></CardContent></Card>
    <Card className={card}><CardContent className="p-0"><div className="overflow-x-auto"><table className="min-w-[850px] w-full text-sm"><thead className={isDark ? 'bg-slate-800/70 text-slate-400' : 'bg-slate-50 text-slate-500'}><tr className="border-b"><th className="p-4 text-left font-medium">Coopérative</th><th className="p-4 text-left font-medium">Membres</th><th className="p-4 text-left font-medium">Filières</th><th className="p-4 text-left font-medium">Statut</th><th className="p-4 text-left font-medium">Activité</th><th className="p-4 text-right font-medium">Action</th></tr></thead><tbody>{loading ? Array.from({ length: 5 }).map((_, i) => <tr key={i} className="border-b"><td className="p-4" colSpan={6}><Skeleton className="h-5 w-full" /></td></tr>) : filtered.map((c) => <tr key={c.id} className={`border-b last:border-0 ${isDark ? 'border-slate-700 hover:bg-slate-700/30' : 'border-slate-100 hover:bg-slate-50'}`}><td className="p-4"><p className={isDark ? 'font-medium text-slate-100' : 'font-medium text-slate-900'}>{c.nom}</p><p className="mt-0.5 text-xs text-slate-500">{[c.sigle, c.commune, c.region].filter(Boolean).join(' · ') || 'Localisation non renseignée'}</p></td><td className="p-4"><span className="font-medium">{c.stats.total}</span><span className="ml-1 text-xs text-slate-500">dont {c.stats.actifs} actifs</span></td><td className="p-4 text-slate-500">{c.filieres.length ? c.filieres.join(', ') : '—'}</td><td className="p-4"><Badge className={STATUS[c.statut].tone}>{STATUS[c.statut].label}</Badge></td><td className="p-4 text-slate-500">{c.stats.stock} unités en stock</td><td className="p-4 text-right"><Button variant="outline" size="sm" onClick={() => openDetail(c.id)}>Consulter</Button></td></tr>)}</tbody></table></div>{!loading && filtered.length === 0 && <BoEmptyState icon={Building2} title="Aucune coopérative trouvée" description="Modifiez vos filtres ou créez une coopérative." />}</CardContent></Card>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Créer une coopérative</DialogTitle><DialogDescription>Le responsable doit déjà avoir un compte coopérateur ; aucun compte en double ne sera créé.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><Field label="Nom officiel" value={form.nom} onChange={(nom) => setForm({ ...form, nom })} /><Field label="Identifiant du responsable" value={form.responsableId} onChange={(responsableId) => setForm({ ...form, responsableId })} /><div className="grid grid-cols-2 gap-3"><Field label="Commune" value={form.commune} onChange={(commune) => setForm({ ...form, commune })} /><Field label="Région" value={form.region} onChange={(region) => setForm({ ...form, region })} /></div><Field label="Filières" value={form.filieres} onChange={(filieres) => setForm({ ...form, filieres })} placeholder="Cacao, manioc…" /></div>{formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}<DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button><Button disabled={saving} onClick={create}>Créer la coopérative</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>{detail && <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{detail.cooperative.nom}</DialogTitle><DialogDescription>Fiche administrative et activité réelle de la coopérative.</DialogDescription></DialogHeader><Tabs defaultValue="general"><TabsList className="grid w-full grid-cols-5"><TabsTrigger value="general">Vue générale</TabsTrigger><TabsTrigger value="members">Membres</TabsTrigger><TabsTrigger value="roles">Rôles</TabsTrigger><TabsTrigger value="documents">Documents</TabsTrigger><TabsTrigger value="history">Historique</TabsTrigger></TabsList><TabsContent value="general" className="space-y-4 pt-3"><div className="grid gap-3 sm:grid-cols-3"><Info isDark={isDark} label="Membres actifs" value={detail.cooperative.stats.actifs} /><Info isDark={isDark} label="En attente" value={detail.cooperative.stats.attente} /><Info isDark={isDark} label="Stock disponible" value={detail.cooperative.stats.stock} /></div><div className="grid gap-3 sm:grid-cols-2"><Info isDark={isDark} label="Filières" value={detail.cooperative.filieres.join(', ') || 'Non renseignées'} /><Info isDark={isDark} label="Localisation" value={[detail.cooperative.commune, detail.cooperative.region].filter(Boolean).join(', ') || 'Non renseignée'} /></div><div className="flex flex-wrap items-center gap-3"><Select value={detail.cooperative.statut} onValueChange={(statut) => update({ statut })}><SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS).map(([key, value]) => <SelectItem key={key} value={key}>{value.label}</SelectItem>)}</SelectContent></Select><span className="text-xs text-slate-500">Les transitions non autorisées sont refusées côté serveur.</span></div></TabsContent><TabsContent value="members" className="pt-3"><MemberTable members={detail.members} onUpdate={(membershipId, updates) => update({ action: 'membership', membershipId, ...updates })} /></TabsContent><TabsContent value="roles" className="pt-3 space-y-3">{detail.roles.length ? detail.roles.map((role) => <div key={role.id} className={`rounded-xl border p-3 ${card}`}><p className="font-medium">{role.libelle}</p><p className="mt-1 text-xs text-slate-500">{role.cooperative_role_permissions.map((p) => p.permission_code).join(' · ') || 'Aucune permission attribuée'}</p></div>) : <BoEmptyState icon={ShieldCheck} title="Aucun rôle configuré" description="Le catalogue de permissions est prêt ; attribuez les rôles dans la prochaine configuration." />}</TabsContent><TabsContent value="documents" className="pt-3 space-y-2">{detail.documents.length ? detail.documents.map((doc) => <div key={doc.id} className={`flex items-center justify-between rounded-xl border p-3 ${card}`}><span><FileText className="mr-2 inline size-4" />{doc.nom}</span><Badge variant="outline">{doc.type} · {doc.statut}</Badge></div>) : <BoEmptyState icon={FileText} title="Aucun document" description="Les documents administratifs apparaîtront ici." />}</TabsContent><TabsContent value="history" className="pt-3 space-y-2">{detail.audit.length ? detail.audit.map((item) => <div key={item.id} className={`rounded-xl border p-3 text-sm ${card}`}><p className="font-medium">{item.action.replaceAll('_', ' ')}</p><p className="text-xs text-slate-500">{item.entity_type} · {new Date(item.created_at).toLocaleString('fr-FR')}</p></div>) : <BoEmptyState icon={Warehouse} title="Aucune entrée d’audit" />}</TabsContent></Tabs>{formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}<DialogFooter><Button variant="outline" onClick={() => setDetail(null)}>Fermer</Button></DialogFooter></DialogContent>}</Dialog>
  </div>
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <div className="grid gap-1.5"><Label>{label}</Label><Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div> }
function Info({ isDark, label, value }: { isDark: boolean; label: string; value: string | number }) { return <div className={`rounded-xl border p-3 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div> }
function MemberTable({ members, onUpdate }: { members: Detail['members']; onUpdate: (id: string, updates: Record<string, string>) => void }) { return <div className="space-y-2">{members.length ? members.map((m) => <div key={m.id} className="grid items-center gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_160px_160px]"><div><p className="font-medium">{m.merchant ? `${m.merchant.first_name} ${m.merchant.last_name ?? ''}` : 'Marchand indisponible'}</p><p className="text-xs text-slate-500">{m.merchant?.phone ?? '—'}</p></div><Select value={m.statut} onValueChange={(statut) => onUpdate(m.id, { statut })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en_attente">En attente</SelectItem><SelectItem value="actif">Actif</SelectItem><SelectItem value="suspendu">Suspendu</SelectItem><SelectItem value="exclu">Résilié</SelectItem></SelectContent></Select><Input aria-label="Rôle du membre" value={m.role} onBlur={(e) => e.target.value !== m.role && onUpdate(m.id, { role: e.target.value })} /></div>) : <BoEmptyState icon={Users} title="Aucun membre" description="Les adhésions de cette coopérative apparaîtront ici." />}</div> }
