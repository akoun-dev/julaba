'use client'

import { useState, useEffect, useCallback } from 'react'
import { CloudOff } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoErrorBanner } from './bo-ui'

interface SyncConflictReportInfo {
  id: string
  subject: string
  entity: string
  message: string
  clientCreatedAt: string
  reportedAt: string
}

export function BoSyncConflictsScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const [reports, setReports] = useState<SyncConflictReportInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/sync-conflicts')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setReports(data.reports ?? [])
    } catch {
      setError('Impossible de charger les conflits de synchronisation.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`} style={{ minHeight: '100%' }}>
      <BoPageHeader
        title="Conflits de synchronisation"
        description="Écritures faites hors-ligne que le serveur a définitivement rejetées (donnée déjà supprimée, invalide…) — elles ne seront jamais réessayées automatiquement. Chaque entrée provient d'un appareil qui a signalé l'échec au serveur."
      />

      <Separator />

      {error && !loading && <BoErrorBanner message={error} onRetry={fetchData} />}

      <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
        <CardContent className="p-0 divide-y divide-border">
          {loading && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4"><Skeleton className="h-5 w-64" /></div>
          ))}
          {!loading && reports.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground text-center">Aucun conflit de synchronisation signalé.</p>
          )}
          {!loading && reports.map((r) => (
            <div key={r.id} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-start gap-3">
                <CloudOff className={`h-4 w-4 mt-0.5 shrink-0 ${isDark ? 'text-red-400' : 'text-red-500'}`} />
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {r.entity} · {r.subject}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Écrit sur l&apos;appareil le {formatDate(r.clientCreatedAt)} · Signalé le {formatDate(r.reportedAt)}
                  </p>
                </div>
              </div>
              <Badge className="bg-red-100 text-red-700 shrink-0">Perdu</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
