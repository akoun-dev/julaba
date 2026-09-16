'use client'

import { useState, useEffect, useCallback } from 'react'
import { Smartphone, ShieldAlert, Unlock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoErrorBanner } from './bo-ui'

interface DeviceSessionInfo {
  id: string
  subject: string
  type: string
  subjectId: string
  actorName: string | null
  actorPhone: string | null
  createdAt: string
  expiresAt: string
}

const TYPE_LABEL: Record<string, string> = {
  merchant: 'Marchand',
  producteur: 'Producteur',
  identificateur: 'Identificateur',
}

export function BoDeviceSessionsScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const [sessions, setSessions] = useState<DeviceSessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<DeviceSessionInfo | null>(null)
  const [revoking, setRevoking] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/device-sessions')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setSessions(data.sessions ?? [])
    } catch {
      setError('Impossible de charger les sessions appareil.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleRevoke = async () => {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      const res = await fetch(`/api/backoffice/device-sessions?id=${revokeTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      setSessions((prev) => prev.filter((s) => s.id !== revokeTarget.id))
      setRevokeTarget(null)
    } catch {
      setError('La révocation a échoué.')
    } finally {
      setRevoking(false)
    }
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`} style={{ minHeight: '100%' }}>
      <BoPageHeader
        title="Sessions appareil"
        description="Marchand, producteur et identificateur s'authentifient localement (code PIN vérifié sur l'appareil) — le premier appareil à réclamer un compte le possède définitivement. Révoquer une session ici est le seul moyen de débloquer un compte après perte ou vol de téléphone."
      />

      <Separator />

      <div className={`rounded-lg border p-3 flex items-start gap-2 text-sm ${isDark ? 'border-amber-900/50 bg-amber-950/30 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
        <p>Révoquer une session appareil déconnecte le compte de son appareil actuel. Le prochain appareil à se connecter avec ce compte en devient propriétaire. À utiliser uniquement après vérification de l&apos;identité de l&apos;utilisateur.</p>
      </div>

      {error && !loading && <BoErrorBanner message={error} onRetry={fetchData} />}

      <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
        <CardContent className="p-0 divide-y divide-border">
          {loading && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4"><Skeleton className="h-5 w-64" /></div>
          ))}
          {!loading && sessions.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground text-center">Aucune session appareil enregistrée.</p>
          )}
          {!loading && sessions.map((s) => (
            <div key={s.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <Smartphone className={`h-4 w-4 shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {s.actorName ? `${s.actorName}${s.actorPhone ? ` · ${s.actorPhone}` : ''}` : `${s.subjectId.slice(0, 8)}…`}
                    <Badge variant="outline" className="ml-2 align-middle">{TYPE_LABEL[s.type] ?? s.type}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Réclamée le {formatDate(s.createdAt)} · Expire le {formatDate(s.expiresAt)}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => setRevokeTarget(s)}>
                <Unlock className="h-3.5 w-3.5 mr-1.5" /> Révoquer
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Révoquer cette session appareil ?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.actorName ?? revokeTarget?.subjectId} ne pourra plus utiliser l&apos;application depuis son appareil actuel tant qu&apos;il ne se reconnecte pas — le prochain appareil à se connecter avec ce compte en devient propriétaire. Confirmez que vous avez vérifié l&apos;identité de l&apos;utilisateur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} disabled={revoking} className="bg-red-600 hover:bg-red-700">
              {revoking ? 'Révocation…' : 'Révoquer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
