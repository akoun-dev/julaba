'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, Eye, Loader2, MessageSquare, RefreshCw, UserCheck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BoErrorBanner, BoPageHeader } from './bo-ui'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'

type WorkflowStatus = 'a_traiter' | 'en_cours' | 'repondue' | 'traitee'
type InfoRequest = {
  id: string; dossierId: string; actorName: string; actorType: string; zone: string; phone: string
  identificateurName: string; reason: string | null; workflowStatus: WorkflowStatus; requestedAt: string
  assignedTo: string | null; response: string | null; respondedBy: string | null; closedBy: string | null
}

const STATUS: Record<WorkflowStatus, { label: string; className: string }> = {
  a_traiter: { label: 'À traiter', className: 'bg-amber-100 text-amber-800' },
  en_cours: { label: 'En cours', className: 'bg-blue-100 text-blue-800' },
  repondue: { label: 'Répondue', className: 'bg-violet-100 text-violet-800' },
  traitee: { label: 'Traitée', className: 'bg-emerald-100 text-emerald-800' },
}

export function BoInformationRequestsScreen() {
  const boTheme = useBackofficeStore((s) => s.boTheme)
  const isDark = boTheme === 'dark'
  const [requests, setRequests] = useState<InfoRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<InfoRequest | null>(null)
  const [response, setResponse] = useState('')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | WorkflowStatus>('all')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/backoffice/information-requests')
      const data = await res.json()
      if (!res.ok) throw new Error(data.erreur || 'Erreur de chargement')
      setRequests(data.requests ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les demandes')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => filter === 'all' ? requests : requests.filter((r) => r.workflowStatus === filter), [filter, requests])
  const act = async (action: 'prendre_en_charge' | 'repondre' | 'cloturer' | 'reouvrir') => {
    if (!selected) return
    if (action === 'repondre' && !response.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/backoffice/information-requests', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        // MODE-1014 — précondition de transition : le statut affiché à
        // l'agent doit toujours être celui de la ligne, sinon 409
        // CONCURRENCY_CONFLICT (autre back-office a déjà transité).
        body: JSON.stringify({ id: selected.id, action, response: response.trim(), expectedStatus: selected.workflowStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.erreur || 'Action impossible')
      setRequests((current) => current.map((r) => r.id === selected.id ? data.request : r))
      setSelected(data.request)
      if (action === 'repondre') setResponse('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Action impossible') }
    finally { setSaving(false) }
  }

  const open = (request: InfoRequest) => { setSelected(request); setResponse(request.response ?? '') }
  const date = (value: string) => new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className={`min-h-full space-y-5 p-5 lg:p-7 ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}>
      <BoPageHeader title="Demandes d’information" description="Ouvrir, prendre en charge, répondre et clôturer les demandes issues des dossiers d’enrôlement." />
      {error && <BoErrorBanner message={error} onRetry={() => void load()} />}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrer les demandes">
        {(['all', 'a_traiter', 'en_cours', 'repondue', 'traitee'] as const).map((key) => (
          <Button key={key} size="sm" variant={filter === key ? 'default' : 'outline'} onClick={() => setFilter(key)}>
            {key === 'all' ? 'Toutes' : STATUS[key].label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading} aria-label="Actualiser les demandes"><RefreshCw className="mr-2 h-4 w-4" />Actualiser</Button>
      </div>
      <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
        <CardContent className="p-0">
          {loading ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Chargement…</div> : visible.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">Aucune demande dans ce filtre.</p> : (
            <div className="divide-y divide-border">
              {visible.map((request) => (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{request.actorName}</p><Badge className={STATUS[request.workflowStatus].className}>{STATUS[request.workflowStatus].label}</Badge><span className="text-xs text-muted-foreground">{request.dossierId}</span></div>
                    <p className="mt-1 text-sm text-muted-foreground">{request.actorType} · zone {request.zone} · agent demandeur : {request.identificateurName}</p>
                    <p className="mt-1 max-w-2xl truncate text-sm">{request.reason || 'Informations complémentaires demandées sans motif détaillé.'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Créée le {date(request.requestedAt)}{request.assignedTo ? ` · prise en charge par ${request.assignedTo}` : ''}</p>
                  </div>
                  <Button variant="outline" onClick={() => open(request)}><Eye className="mr-2 h-4 w-4" />Ouvrir</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={Boolean(selected)} onOpenChange={(openState) => { if (!openState) setSelected(null) }}>
        <DialogContent className="max-w-2xl">
          {selected && <>
            <DialogHeader><DialogTitle>Demande {selected.dossierId}</DialogTitle></DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-2"><p><strong>Acteur :</strong> {selected.actorName} ({selected.actorType})</p><p><strong>Zone :</strong> {selected.zone}</p><p><strong>Téléphone :</strong> {selected.phone}</p><p><strong>Agent demandeur :</strong> {selected.identificateurName}</p></div>
              <div className="rounded-lg border p-3"><p className="mb-1 font-medium">Informations demandées</p><p>{selected.reason || 'Aucun motif détaillé.'}</p></div>
              {selected.response && <div className="rounded-lg border border-violet-200 bg-violet-50 p-3"><p className="mb-1 font-medium text-violet-900">Réponse enregistrée</p><p className="text-violet-900">{selected.response}</p></div>}
              <div><label htmlFor="info-response" className="mb-1 block font-medium">Réponse de l’agent</label><Textarea id="info-response" value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Expliquez les informations attendues ou la suite donnée…" rows={5} disabled={selected.workflowStatus === 'traitee'} /></div>
            </div>
            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {selected.workflowStatus === 'a_traiter' && <Button onClick={() => void act('prendre_en_charge')} disabled={saving}><UserCheck className="mr-2 h-4 w-4" />Prendre en charge</Button>}
                {selected.workflowStatus !== 'traitee' && <Button onClick={() => void act('repondre')} disabled={saving || !response.trim()}><MessageSquare className="mr-2 h-4 w-4" />Enregistrer la réponse</Button>}
                {['en_cours', 'repondue'].includes(selected.workflowStatus) && <Button variant="secondary" onClick={() => void act('cloturer')} disabled={saving}><CheckCircle2 className="mr-2 h-4 w-4" />Marquer traitée</Button>}
                {selected.workflowStatus === 'traitee' && <Button variant="outline" onClick={() => void act('reouvrir')} disabled={saving}><Clock3 className="mr-2 h-4 w-4" />Réouvrir</Button>}
              </div>
            </DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  )
}
