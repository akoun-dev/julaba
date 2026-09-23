'use client'

import { useCallback, useEffect, useState } from 'react'
import { CircleAlert, CircleCheck, Info, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getInsAlerts, formatInsDate, type InsAlert } from '@/lib/institution/ins-api'
import {
  InsEmptyState,
  InsErrorBanner,
  InsKpiCardSkeleton,
  InsPageHeader,
} from './ins-ui'
import { cn } from '@/lib/utils'

function severityIcon(severity: string) {
  if (severity === 'critique' || severity === 'haute') {
    return <CircleAlert size={16} className="shrink-0 text-red-600" />
  }
  if (severity === 'moyenne') {
    return <CircleAlert size={16} className="shrink-0 text-amber-500" />
  }
  return <Info size={16} className="shrink-0 text-blue-500" />
}

const SEVERITY_BADGE: Record<string, string> = {
  critique: 'bg-red-100 text-red-800',
  haute: 'bg-orange-100 text-orange-800',
  moyenne: 'bg-amber-100 text-amber-800',
  basse: 'bg-blue-100 text-blue-800',
  faible: 'bg-slate-100 text-slate-700',
}

export function InsSupervisionScreen() {
  const [alerts, setAlerts] = useState<InsAlert[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await getInsAlerts()
      setAlerts(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue. Réessayez.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  const pendingCount = (alerts || []).filter((a) => !a.acknowledged).length

  return (
    <div className="screen-enter space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <InsPageHeader
          title="Supervision"
          subtitle="Alertes du territoire — lecture seule, seuils gérés par le back-office"
        />
        <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </Button>
      </div>

      {error ? <InsErrorBanner message={error} onRetry={() => setReloadKey((k) => k + 1)} /> : null}

      {loading && !alerts ? (
        <div className="space-y-3">
          <InsKpiCardSkeleton />
          <InsKpiCardSkeleton />
          <InsKpiCardSkeleton />
        </div>
      ) : alerts && alerts.length === 0 ? (
        <InsEmptyState title="Aucune alerte. Le territoire est nominal." />
      ) : alerts ? (
        <>
          <div className="flex items-center gap-3 text-sm text-[#64748B]">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
              {pendingCount} en attente
            </span>
            <span>{alerts.length} alerte{alerts.length > 1 ? 's' : ''} au total</span>
          </div>

          <ol className="relative space-y-4 border-l border-[#E2E8F0] pl-6">
            {alerts.map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute top-4 -left-[31px] flex h-3 w-3 items-center justify-center">
                  <span
                    className={cn(
                      'h-2.5 w-2.5 rounded-full',
                      a.severity === 'critique' || a.severity === 'haute'
                        ? 'bg-red-500'
                        : a.severity === 'moyenne'
                          ? 'bg-amber-500'
                          : 'bg-blue-400'
                    )}
                  />
                </span>

                <article className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="flex flex-wrap items-center gap-2">
                    {severityIcon(a.severity)}
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize',
                        SEVERITY_BADGE[a.severity] || 'bg-slate-100 text-slate-700'
                      )}
                    >
                      {a.severity}
                    </span>
                    <span className="text-xs text-[#94A3B8]">·</span>
                    <span className="text-xs font-medium text-[#64748B]">{a.module}</span>
                    <span className="ml-auto text-xs text-[#94A3B8]">{formatInsDate(a.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[#0F172A]">{a.title}</p>
                  <p className="mt-1 text-sm text-[#475569]">{a.message}</p>
                  <div className="mt-3 flex items-center gap-1.5 text-xs">
                    {a.acknowledged ? (
                      <>
                        <CircleCheck size={14} className="text-emerald-600" />
                        <span className="text-emerald-700">Traitée par le back-office</span>
                      </>
                    ) : (
                      <>
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        <span className="text-amber-700">En attente de traitement</span>
                      </>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </div>
  )
}