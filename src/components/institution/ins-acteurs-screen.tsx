'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getInsActors,
  formatInsDate,
  formatInsCount,
  INS_STATUS_LABELS,
  INS_STATUS_BADGE,
  INS_TYPE_LABELS,
  type InsActor,
  type InsActorPage,
} from '@/lib/institution/ins-api'
import {
  InsEmptyState,
  InsErrorBanner,
  InsPageHeader,
  InsPagination,
  InsTableRowsSkeleton,
} from './ins-ui'
import { cn } from '@/lib/utils'

const ALL = '__all__'

export function InsActeursScreen() {
  const [data, setData] = useState<InsActorPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState(ALL)
  const [type, setType] = useState(ALL)
  const [page, setPage] = useState(1)

  const hasFilters = searchInput !== '' || status !== ALL || type !== ALL

  const clearFilters = useCallback(() => {
    setSearchInput('')
    setDebouncedSearch('')
    setStatus(ALL)
    setType(ALL)
    setPage(1)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const filters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      status: status === ALL ? undefined : status,
      type: type === ALL ? undefined : type,
      page,
    }),
    [debouncedSearch, status, type, page]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const d = await getInsActors(filters)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue. Réessayez.')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  return (
    <div className="screen-enter space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <InsPageHeader
          title="Acteurs"
          subtitle={`Répertoire national des acteurs enrôlés${data ? ` — ${formatInsCount(data.total)} acteurs` : ''}`}
        />
      </div>

      {error ? <InsErrorBanner message={error} onRetry={() => setReloadKey((k) => k + 1)} /> : null}

      <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#94A3B8]" />
          <Input
            placeholder="Rechercher un acteur…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
            aria-label="Rechercher un acteur"
          />
        </div>

        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-40" aria-label="Filtrer par statut">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les statuts</SelectItem>
            <SelectItem value="actif">Actif</SelectItem>
            <SelectItem value="en_attente">En attente</SelectItem>
            <SelectItem value="suspendu">Suspendu</SelectItem>
            <SelectItem value="rejete">Rejeté</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={type}
          onValueChange={(v) => {
            setType(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Filtrer par type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les types</SelectItem>
            <SelectItem value="marchand">Marchand(e)</SelectItem>
            <SelectItem value="producteur">Producteur(rice)</SelectItem>
            <SelectItem value="cooperatif">Coopérative</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Réinitialiser
          </Button>
        ) : null}
      </div>

      {loading && !data ? (
        <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <InsTableRowsSkeleton rows={8} cols={5} />
        </div>
      ) : data && data.actors.length === 0 ? (
        <InsEmptyState
          title="Aucun acteur trouvé."
          actionLabel={hasFilters ? 'Réinitialiser les filtres' : undefined}
          onAction={hasFilters ? clearFilters : undefined}
        />
      ) : data ? (
        <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="space-y-3 p-3 sm:hidden">
            {data.actors.map((a: InsActor) => (
              <article key={a.id} className="rounded-xl border border-[#E2E8F0] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#0F172A]">{[a.firstName, a.lastName].filter(Boolean).join(" ")}</p>
                    <p className="mt-0.5 text-xs text-[#64748B]">{a.phone || "—"}</p>
                  </div>
                  <span className={cn("inline-flex shrink-0 rounded-md px-2 py-0.5 text-xs font-medium", INS_STATUS_BADGE[a.status] || "bg-slate-100 text-slate-700")}>{INS_STATUS_LABELS[a.status] || a.status}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div><dt className="text-[#94A3B8]">Code</dt><dd className="truncate font-mono text-[#475569]">{a.actorId}</dd></div>
                  <div><dt className="text-[#94A3B8]">Type</dt><dd className="text-[#334155]">{INS_TYPE_LABELS[a.type] || a.type}</dd></div>
                  <div><dt className="text-[#94A3B8]">Zone</dt><dd className="truncate text-[#334155]">{a.zone || "—"}</dd></div>
                  <div><dt className="text-[#94A3B8]">Enrôlé le</dt><dd className="text-[#64748B]">{formatInsDate(a.createdAt)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="min-w-[700px] w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-slate-50 text-left text-xs font-medium text-[#64748B]">
                  <th scope="col" className="px-4 py-3">Acteur</th>
                  <th scope="col" className="px-4 py-3">Code</th>
                  <th scope="col" className="px-4 py-3">Type</th>
                  <th scope="col" className="px-4 py-3">Zone</th>
                  <th scope="col" className="px-4 py-3">Statut</th>
                  <th scope="col" className="px-4 py-3">Enrôlé le</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {data.actors.map((a: InsActor) => (
                  <tr key={a.id} className="transition-colors hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#0F172A]">
                        {[a.firstName, a.lastName].filter(Boolean).join(' ')}
                      </p>
                      <p className="text-xs text-[#64748B]">{a.phone || '—'}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#475569]">{a.actorId}</td>
                    <td className="px-4 py-3 text-[#334155]">
                      {INS_TYPE_LABELS[a.type] || a.type}
                    </td>
                    <td className="px-4 py-3 text-[#334155]">{a.zone || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-md px-2 py-0.5 text-xs font-medium',
                          INS_STATUS_BADGE[a.status] || 'bg-slate-100 text-slate-700'
                        )}
                      >
                        {INS_STATUS_LABELS[a.status] || a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#64748B]">{formatInsDate(a.createdAt)}</td>
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