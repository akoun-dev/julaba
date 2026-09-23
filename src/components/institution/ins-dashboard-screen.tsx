'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, TrendingUp, Award, FileClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getInsDashboard,
  formatInsCount,
  formatInsDay,
  type InsDashboardData,
} from '@/lib/institution/ins-api'
import {
  InsErrorBanner,
  InsKpiCard,
  InsKpiCardSkeleton,
  InsCardSkeleton,
  InsPageHeader,
} from './ins-ui'

export function InsDashboardScreen() {
  const [data, setData] = useState<InsDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const d = await getInsDashboard()
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue. Réessayez.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  if (!loading && error) {
    return (
      <div className="screen-enter space-y-6">
        <InsPageHeader title="Tableau de bord" subtitle="Aperçu national — données agrégées du territoire" />
        <InsErrorBanner message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className="screen-enter space-y-6">
        <InsPageHeader title="Tableau de bord" subtitle="Aperçu national — données agrégées du territoire" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <InsKpiCardSkeleton />
          <InsKpiCardSkeleton />
          <InsKpiCardSkeleton />
          <InsKpiCardSkeleton />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <InsCardSkeleton className="min-h-56" />
          <InsCardSkeleton className="min-h-56" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="screen-enter space-y-6">
        <InsPageHeader title="Tableau de bord" subtitle="Aperçu national — données agrégées du territoire" />
        <InsErrorBanner message="Le tableau de bord national est indisponible." onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    )
  }

  const activityRate = data.totalActors > 0 ? Math.round((data.activeActors / data.totalActors) * 100) : 0
  const targetPct = data.nationalTarget > 0 ? Math.min(100, Math.round((data.totalActors / data.nationalTarget) * 100)) : 0

  const trendMax = Math.max(1, ...data.dailyEnrolmentTrend.map((d) => d.count))
  const regionMax = Math.max(1, ...data.actorCountsByRegion.map((r) => r.count))

  const isEmpty =
    data.totalActors === 0 &&
    data.pendingEnrolments === 0 &&
    data.actorCountsByRegion.length === 0

  return (
    <div className="screen-enter space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <InsPageHeader
          title="Tableau de bord"
          subtitle="Aperçu national — données agrégées de supervision"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setReloadKey((k) => k + 1)}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InsKpiCard
          label="Acteurs enrôlés"
          value={formatInsCount(data.totalActors)}
          hint={`Objectif national : ${formatInsCount(data.nationalTarget)}`}
        />
        <InsKpiCard
          label="Acteurs actifs"
          value={formatInsCount(data.activeActors)}
          hint={`${activityRate} % des enrôlés`}
        />
        <InsKpiCard
          label="Dossiers en attente"
          value={formatInsCount(data.pendingEnrolments)}
          hint={`${formatInsCount(data.totalEnrolments)} dossiers au total`}
        />
        <InsKpiCard
          label="Alertes non traitées"
          value={formatInsCount(data.unacknowledgedAlerts)}
          hint="à l'échelle du territoire"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Activité des 7 derniers jours */}
        <section aria-label="Enrôlements des 7 derniers jours">
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-[#3B82F6]" />
              <p className="text-sm font-medium text-[#0F172A]">Enrôlements des 7 derniers jours</p>
            </div>
            <div className="h-44">
            {trendMax === 1 && data.dailyEnrolmentTrend.every((d) => d.count === 0) ? (
              <p className="flex h-full items-center justify-center text-sm text-[#64748B]">
                Aucun enrôlement sur la période.
              </p>
            ) : (
              <div className="flex h-full items-end gap-2">
                {data.dailyEnrolmentTrend.map((d) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-[11px] font-medium tabular-nums text-[#64748B]">
                      {d.count}
                    </span>
                    <div
                      className="w-full rounded-t-md bg-[#3B82F6]"
                      style={{ height: `${Math.max(6, Math.round((d.count / trendMax) * 100))}%` }}
                    />
                    <span className="text-[11px] text-[#94A3B8]">{formatInsDay(d.day)}</span>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        </section>

        {/* Répartition par région */}
        <section aria-label="Répartition des acteurs par région">
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="mb-4 text-sm font-medium text-[#0F172A]">Acteurs par région</p>
            {data.actorCountsByRegion.length === 0 ? (
              <p className="flex h-32 items-center justify-center text-sm text-[#64748B]">
                Aucune répartition régionale disponible.
              </p>
            ) : (
              <div className="space-y-3">
                {data.actorCountsByRegion.map((r) => (
                  <div key={r.name} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium text-[#334155]">{r.name}</span>
                      <span className="tabular-nums text-[#64748B]">{formatInsCount(r.count)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#3B82F6] transition-[width] duration-300 ease-out"
                        style={{ width: `${Math.max(4, Math.round((r.count / regionMax) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Avancement de l'objectif national */}
        <section aria-label="Avancement de l'objectif national">
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="mb-4 flex items-center gap-2">
              <Award size={16} className="text-[#3B82F6]" />
              <p className="text-sm font-medium text-[#0F172A]">Objectif national</p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-[#0F172A]">
              {formatInsCount(data.totalActors)}
              <span className="text-sm font-normal text-[#64748B]">
                {' '}
                / {formatInsCount(data.nationalTarget)} acteurs
              </span>
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#16A34A] transition-[width] duration-300 ease-out"
                style={{ width: `${targetPct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[#64748B]">{targetPct} % de l'objectif atteint</p>
          </div>
        </section>

        {/* Qualité des données */}
        <section aria-label="Qualité des données d'enrôlement">
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="mb-4 text-sm font-medium text-[#0F172A]">Qualité des données</p>
            <div className="space-y-3">
              {[
                { label: 'Photos', value: data.dataQuality.photos },
                { label: 'Géolocalisation', value: data.dataQuality.gps },
                { label: 'Téléphones', value: data.dataQuality.phones },
              ].map((m) => (
                <div key={m.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#334155]">{m.label}</span>
                    <span className="font-medium tabular-nums text-[#0F172A]">{m.value} %</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[#3B82F6] transition-[width] duration-300 ease-out"
                      style={{ width: `${m.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Top identificateurs */}
        <section aria-label="Identificateurs les plus actifs">
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="mb-4 flex items-center gap-2">
              <FileClock size={16} className="text-[#3B82F6]" />
              <p className="text-sm font-medium text-[#0F172A]">Identificateurs les plus actifs</p>
            </div>
            {data.topIdentificateurs.length === 0 ? (
              <p className="flex h-24 items-center justify-center text-sm text-[#64748B]">
                Aucune donnée disponible.
              </p>
            ) : (
              <ol className="divide-y divide-[#F1F5F9]">
                {data.topIdentificateurs.map((t, i) => (
                  <li key={`${t.name}-${i}`} className="flex items-center gap-3 py-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3B82F6]/10 text-xs font-bold text-[#1D4ED8]">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#0F172A]">
                      {t.name}
                    </span>
                    <span className="text-xs text-[#64748B]">{t.count} acteurs</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>

      {isEmpty ? (
        <p className="text-center text-sm text-[#64748B]">
          Aucune donnée d'enrôlement disponible pour le moment.
        </p>
      ) : null}
    </div>
  )
}