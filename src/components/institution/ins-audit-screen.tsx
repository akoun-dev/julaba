'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getInsAudit,
  formatInsDate,
  insActionLabel,
  insModuleLabel,
  type InsAuditPage,
} from '@/lib/institution/ins-api'
import {
  InsEmptyState,
  InsErrorBanner,
  InsPageHeader,
  InsPagination,
  InsTableRowsSkeleton,
} from './ins-ui'

const ALL = '__all__'

const KNOWN_MODULES = [
  'auth',
  'acteurs',
  'enrolement',
  'alertes',
  'missions',
  'zones',
  'parametres',
  'rapport',
  'audit',
  'cooperatives',
]

export function InsAuditScreen() {
  const [data, setData] = useState<InsAuditPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [moduleFilter, setModuleFilter] = useState(ALL)
  const [page, setPage] = useState(1)

  const load = useCallback(
    async (pageToLoad: number, mod: string) => {
      setLoading(true)
      setError('')
      try {
        const d = await getInsAudit({
          page: pageToLoad,
          module: mod === ALL ? undefined : mod,
        })
        setData(d)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Une erreur est survenue. Réessayez.')
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void load(page, moduleFilter)
  }, [load, page, moduleFilter, reloadKey])

  // Les modules réellement présents dans la page courante complètent la liste
  // de référence — évite une liste figée qui mentirait sur les données.
  const moduleOptions = useMemo(() => {
    const seen = new Set<string>(KNOWN_MODULES)
    for (const log of data?.logs || []) {
      if (log.module) seen.add(log.module)
    }
    if (moduleFilter !== ALL) seen.add(moduleFilter)
    return Array.from(seen)
      .sort((a, b) => insModuleLabel(a).localeCompare(insModuleLabel(b), 'fr'))
  }, [data, moduleFilter])

  return (
    <div className="screen-enter space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <InsPageHeader
          title="Audit"
          subtitle={`Journal d'audit — traçabilité des actions du système${data ? ` — ${data.total.toLocaleString('fr-FR')} entrées` : ''}`}
        />
        <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </Button>
      </div>

      {error ? <InsErrorBanner message={error} onRetry={() => setReloadKey((k) => k + 1)} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select
          value={moduleFilter}
          onValueChange={(v) => {
            setModuleFilter(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-56" aria-label="Filtrer par module">
            <SelectValue placeholder="Module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les modules</SelectItem>
            {moduleOptions.map((m) => (
              <SelectItem key={m} value={m}>
                {insModuleLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {moduleFilter !== ALL ? (
          <Button variant="ghost" size="sm" onClick={() => setModuleFilter(ALL)}>
            Réinitialiser
          </Button>
        ) : null}
      </div>

      {loading && !data ? (
        <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <InsTableRowsSkeleton rows={8} cols={5} />
        </div>
      ) : data && data.logs.length === 0 ? (
        <InsEmptyState title="Aucune entrée d'audit." />
      ) : data ? (
        <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="space-y-3 p-3 sm:hidden">
            {data.logs.map((log) => (
              <article key={log.id} className="rounded-xl border border-[#E2E8F0] p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium text-[#0F172A]">{insActionLabel(log.action)}</p>
                  <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{insModuleLabel(log.module)}</span>
                </div>
                <dl className="mt-3 space-y-2 text-xs">
                  <div><dt className="text-[#94A3B8]">Utilisateur</dt><dd className="break-words text-[#334155]">{log.userName} · {log.userEmail}</dd></div>
                  <div><dt className="text-[#94A3B8]">Détails</dt><dd className="break-words text-[#64748B]">{log.details || "—"}</dd></div>
                  <div><dt className="text-[#94A3B8]">Horodatage</dt><dd className="text-[#64748B]">{formatInsDate(log.createdAt)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="min-w-[700px] w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-slate-50 text-left text-xs font-medium text-[#64748B]">
                  <th scope="col" className="px-4 py-3">Action</th>
                  <th scope="col" className="px-4 py-3">Module</th>
                  <th scope="col" className="px-4 py-3">Utilisateur</th>
                  <th scope="col" className="px-4 py-3">Détails</th>
                  <th scope="col" className="px-4 py-3">Horodatage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {data.logs.map((log) => (
                  <tr key={log.id} className="transition-colors hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-[#0F172A]">{insActionLabel(log.action)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {insModuleLabel(log.module)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[#334155]">{log.userName}</p>
                      <p className="truncate text-xs text-[#64748B]">{log.userEmail}</p>
                    </td>
                    <td className="max-w-[280px] px-4 py-3">
                      <p className="truncate text-xs text-[#64748B]" title={log.details || undefined}>
                        {log.details || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#64748B]">{formatInsDate(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <InsPagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            onPageChange={(p) => setPage(p)}
          />
        </div>
      ) : null}
    </div>
  )
}