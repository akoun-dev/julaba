'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Send, Search, X, History } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoErrorBanner } from './bo-ui'

type TargetType = 'merchant' | 'producteur' | 'identificateur' | 'all'

const TARGET_LABELS: Record<TargetType, string> = {
  all: 'Tout le monde (marchands, producteurs, identificateurs)',
  merchant: 'Tous les marchands',
  producteur: 'Tous les producteurs',
  identificateur: 'Tous les identificateurs',
}

// BoActor.type uses the French labels, targetType uses the DeviceSubjectType
// English ones — this is the one place that bridges them.
const ACTOR_TYPE_FOR_TARGET: Partial<Record<TargetType, string>> = {
  merchant: 'marchand',
  producteur: 'producteur',
}

interface ActorHit {
  id: string
  firstName: string
  lastName: string | null
  phone: string
}

interface BroadcastHistoryItem {
  title: string
  message: string
  recipientCount: number
  sentAt: string
}

export function BoNotificationsScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const [targetType, setTargetType] = useState<TargetType>('all')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ recipientCount: number } | null>(null)

  // Single-actor targeting (merchant/producteur only — see route.ts).
  const [singleActor, setSingleActor] = useState(false)
  const [actorSearch, setActorSearch] = useState('')
  const [actorHits, setActorHits] = useState<ActorHit[]>([])
  const [searchingActor, setSearchingActor] = useState(false)
  const [selectedActor, setSelectedActor] = useState<ActorHit | null>(null)

  const canTargetOneActor = targetType === 'merchant' || targetType === 'producteur'

  const [history, setHistory] = useState<BroadcastHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const res = await fetch('/api/backoffice/notifications')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setHistory(data.broadcasts ?? [])
    } catch {
      setHistoryError('Impossible de charger l\'historique des diffusions.')
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  const searchActors = async () => {
    const actorType = ACTOR_TYPE_FOR_TARGET[targetType]
    if (!actorType) return
    setSearchingActor(true)
    try {
      const params = new URLSearchParams({ type: actorType, limit: '10' })
      if (actorSearch.trim()) params.set('search', actorSearch.trim())
      const res = await fetch(`/api/backoffice/actors?${params}`)
      const data = await res.json()
      setActorHits(data.actors ?? [])
    } catch {
      setActorHits([])
    } finally {
      setSearchingActor(false)
    }
  }

  const handleSend = async () => {
    setError(null)
    setResult(null)
    if (!title.trim() || !message.trim()) {
      setError('Le titre et le message sont obligatoires.')
      return
    }
    if (singleActor && !selectedActor) {
      setError('Choisissez un acteur, ou décochez le ciblage individuel.')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/backoffice/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType,
          actorId: singleActor ? selectedActor?.id : undefined,
          title: title.trim(),
          message: message.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.erreur || `Erreur ${res.status}`)
      setResult({ recipientCount: data.recipientCount })
      setTitle('')
      setMessage('')
      setSelectedActor(null)
      setActorHits([])
      fetchHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'envoi.")
    } finally {
      setSending(false)
    }
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`} style={{ minHeight: '100vh' }}>
      <BoPageHeader
        title="Notifications"
        description="Envoyer une annonce en direct dans l'application des marchands, producteurs et identificateurs — visible dans leur cloche de notifications dès le prochain sondage (moins d'une minute)."
      />

      <Separator />

      <Card className={`border-0 max-w-xl ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
        <CardContent className="p-5 space-y-4">
          <div className={`rounded-lg border p-3 flex items-start gap-2 text-sm ${isDark ? 'border-slate-700 bg-slate-900/50 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
            <Users className="h-4 w-4 mt-0.5 shrink-0" />
            <p>Les destinataires sont les comptes qui ont déjà utilisé l&apos;application sur un appareil (session appareil active) — cibler une seule personne n&apos;est pas encore possible pour les identificateurs, faute d&apos;un lien fiable entre leur compte et un acteur du registre.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notif-target">Destinataires</Label>
            <Select value={targetType} onValueChange={(v) => { setTargetType(v as TargetType); setSingleActor(false); setSelectedActor(null); setActorHits([]) }}>
              <SelectTrigger id="notif-target" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TARGET_LABELS) as TargetType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TARGET_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {canTargetOneActor && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="notif-single" checked={singleActor} onCheckedChange={(v) => { setSingleActor(v === true); setSelectedActor(null) }} />
                <Label htmlFor="notif-single" className="font-normal">Cibler un seul acteur plutôt que tous les {targetType === 'merchant' ? 'marchands' : 'producteurs'}</Label>
              </div>

              {singleActor && !selectedActor && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input value={actorSearch} onChange={(e) => setActorSearch(e.target.value)} placeholder="Rechercher par nom ou téléphone…" onKeyDown={(e) => { if (e.key === 'Enter') searchActors() }} />
                    <Button type="button" variant="outline" onClick={searchActors} disabled={searchingActor} aria-label="Rechercher un acteur">
                      <Search className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {actorHits.length > 0 && (
                    <div className={`rounded-lg border divide-y max-h-48 overflow-y-auto ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                      {actorHits.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => { setSelectedActor(a); setActorHits([]) }}
                          className={`w-full text-left p-2.5 text-sm hover:bg-muted transition-colors ${isDark ? 'text-slate-200' : 'text-slate-700'}`}
                        >
                          {a.firstName}{a.lastName ? ` ${a.lastName}` : ''} · {a.phone}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {singleActor && selectedActor && (
                <div className={`flex items-center justify-between rounded-lg border p-2.5 text-sm ${isDark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}`}>
                  <span>{selectedActor.firstName}{selectedActor.lastName ? ` ${selectedActor.lastName}` : ''} · {selectedActor.phone}</span>
                  <button type="button" onClick={() => setSelectedActor(null)} aria-label="Retirer cet acteur" className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notif-title">Titre</Label>
            <Input id="notif-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Rapport hebdomadaire disponible" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notif-message">Message</Label>
            <Textarea id="notif-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Contenu de l'annonce…" rows={4} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {result && (
            <p className="text-sm text-emerald-600">
              Envoyée à {result.recipientCount} destinataire{result.recipientCount > 1 ? 's' : ''}.
            </p>
          )}

          <Button onClick={handleSend} disabled={sending} className="w-full">
            <Send className="h-3.5 w-3.5 mr-2" />
            {sending ? 'Envoi…' : 'Envoyer'}
          </Button>
        </CardContent>
      </Card>

      <div className="max-w-xl">
        <h2 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
          <History className="h-4 w-4" /> Diffusions précédentes
        </h2>
        {historyError && !historyLoading && <BoErrorBanner message={historyError} onRetry={fetchHistory} />}
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
          <CardContent className="p-0 divide-y divide-border">
            {historyLoading && Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="p-4"><Skeleton className="h-5 w-64" /></div>
            ))}
            {!historyLoading && history.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground text-center">Aucune diffusion envoyée pour le moment.</p>
            )}
            {!historyLoading && history.map((h, i) => (
              <div key={i} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{h.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{h.message}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1">{formatDate(h.sentAt)}</p>
                </div>
                <Badge variant="outline" className="shrink-0">{h.recipientCount} destinataire{h.recipientCount > 1 ? 's' : ''}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
