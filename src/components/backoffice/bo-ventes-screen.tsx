'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ShoppingBag,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Mic,
  StickyNote,
  Phone,
  MapPin,
  ReceiptText,
  CalendarDays,
  Users,
  Package,
  TrendingUp,
  TrendingDown,
  Minus,
  Inbox,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { formatFCFA } from '@/lib/utils'
import { BoPageHeader, BoFilterBar, BoErrorBanner, BoEmptyState, BoStatCard } from './bo-ui'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

// ============== TYPES (miroir de /api/backoffice/ventes) ==============

interface VenteItem {
  id: string
  productName: string
  quantity: number
  unitPrice: number
  subtotal: number
}

interface Vente {
  id: string
  createdAt: string
  totalAmount: number
  amountReceived: number
  changeAmount: number
  isVoiceSale: boolean
  voiceTranscript: string | null
  note: string | null
  clientId: string | null
  merchantId: string
  merchantName: string
  merchantPhone: string
  categorie: string | null
  zone: string | null
  items: VenteItem[]
}

interface MerchantAgg {
  merchantId: string
  merchantName: string
  zone: string | null
  salesCount: number
  revenue: number
  itemsSold: number
}

interface VentesSummary {
  count: number
  revenue: number
  amountReceived: number
  changeGiven: number
  voiceCount: number
  itemsSold: number
  avgBasket: number
  revenueYesterday: number
  countYesterday: number
  revenueChangePercent: number | null
  countChangePercent: number | null
}

interface VentesData {
  date: string
  summary: VentesSummary
  sales: Vente[]
  merchants: MerchantAgg[]
  hourly: { hour: number; revenue: number; count: number }[]
}

// ============== HELPERS ==============

// La plateforme opère à Abidjan (UTC+0) : les heures affichées sont
// volontairement calées sur ce fuseau, cohérent avec les tranches
// horaires calculées côté API en UTC.
const HOUR_TZ = 'Africa/Abidjan'

function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: HOUR_TZ,
  })
}

function formatDateTitre(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10)
  if (dateStr === today) return "Aujourd'hui"
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (dateStr === yesterday) return 'Hier'
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'
}

function VariationHint({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="opacity-70">· pas de comparaison</span>
  if (percent === 0)
    return (
      <span className="inline-flex items-center gap-0.5 opacity-80">
        <Minus className="size-3" /> stable vs hier
      </span>
    )
  const up = percent > 0
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? '+' : ''}
      {percent} % vs hier
    </span>
  )
}

function ChartTooltip({ active, payload, label, isDark }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string | number
  isDark: boolean
}) {
  if (!active || !payload?.length) return null
  return (
    <div className={`rounded-lg border p-3 text-xs shadow-lg ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}>
      <p className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
        {String(label).padStart(2, '0')}h — {payload[0].value > 0 ? formatFCFA(payload[0].value) : 'aucune vente'}
      </p>
    </div>
  )
}

// ============== CARTE VENTE (ligne dépliable) ==============

function VenteRow({ vente, defaultOpen }: { vente: Vente; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false)

  return (
    <Card className="overflow-hidden bg-white py-0 dark:bg-slate-800 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-col gap-3 p-4 text-left sm:flex-row sm:items-center"
      >
        {/* Heure */}
        <div className="flex w-16 shrink-0 flex-col items-start">
          <span className="text-base font-bold text-slate-900 dark:text-slate-100">{formatHeure(vente.createdAt)}</span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {vente.items.length} article{vente.items.length > 1 ? 's' : ''}
          </span>
        </div>

        {/* Marchand */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
            {initialsOf(vente.merchantName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {vente.merchantName}
            </p>
            <p className="flex items-center gap-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
              <Phone className="size-3 shrink-0" />
              {vente.merchantPhone || '—'}
            </p>
          </div>
        </div>

        {/* Badges */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {vente.zone && (
            <Badge variant="outline" className="gap-1 border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300">
              <MapPin className="size-3" />
              {vente.zone}
            </Badge>
          )}
          {vente.isVoiceSale && (
            <Badge className="gap-1 bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
              <Mic className="size-3" />
              Vocale
            </Badge>
          )}
          {vente.note && (
            <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 dark:border-amber-500/50 dark:text-amber-300">
              <StickyNote className="size-3" />
              Note
            </Badge>
          )}
        </div>

        {/* Montant */}
        <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
          <span className="text-base font-bold text-slate-900 dark:text-slate-100">
            {formatFCFA(vente.totalAmount)}
          </span>
          <ChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Détail (articles, encaissement, vocal, note) */}
      {open && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200 border-t border-slate-100 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <ReceiptText className="size-3.5" />
            Détail des articles
          </p>
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <Table>
              <TableHeader>
                <TableRow className="bg-white dark:bg-slate-800">
                  <TableHead className="text-xs">Produit</TableHead>
                  <TableHead className="text-right text-xs">Qté</TableHead>
                  <TableHead className="text-right text-xs">Prix unitaire</TableHead>
                  <TableHead className="text-right text-xs">Sous-total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vente.items.map((item) => (
                  <TableRow key={item.id} className="bg-white dark:bg-slate-800">
                    <TableCell className="text-sm text-slate-700 dark:text-slate-200">{item.productName}</TableCell>
                    <TableCell className="text-right text-sm text-slate-700 dark:text-slate-200">×{item.quantity}</TableCell>
                    <TableCell className="text-right text-sm text-slate-500 dark:text-slate-400">{formatFCFA(item.unitPrice)}</TableCell>
                    <TableCell className="text-right text-sm font-medium text-slate-900 dark:text-slate-100">{formatFCFA(item.subtotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              Montant reçu : <strong className="text-slate-900 dark:text-slate-100">{formatFCFA(vente.amountReceived)}</strong>
            </span>
            {vente.changeAmount > 0 && (
              <span className="text-slate-500 dark:text-slate-400">
                Monnaie rendue : <strong className="text-amber-600 dark:text-amber-400">{formatFCFA(vente.changeAmount)}</strong>
              </span>
            )}
          </div>

          {vente.voiceTranscript && (
            <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800 dark:border-violet-500/40 dark:bg-violet-950/30 dark:text-violet-200">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                <Mic className="size-3.5" />
                Commande vocale reconnue
              </p>
              <p className="italic">« {vente.voiceTranscript} »</p>
            </div>
          )}

          {vente.note && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                <StickyNote className="size-3.5" />
                Note du marchand
              </p>
              <p>{vente.note}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ============== ÉCRAN PRINCIPAL ==============

export function BoVentesScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const [data, setData] = useState<VentesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10))
  const [search, setSearch] = useState('')
  const [zone, setZone] = useState<string>('toutes')

  const today = new Date().toISOString().slice(0, 10)

  const fetchData = useCallback(async (d: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/backoffice/ventes?date=${encodeURIComponent(d)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.erreur || `Erreur ${res.status}`)
      }
      setData((await res.json()) as VentesData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement des ventes')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(dateStr)
  }, [fetchData, dateStr])

  const zones = useMemo(() => {
    if (!data) return []
    return [...new Set(data.sales.map((s) => s.zone).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b))
  }, [data])

  const filteredSales = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.sales.filter((s) => {
      if (zone !== 'toutes' && s.zone !== zone) return false
      if (!q) return true
      const haystack = [
        s.merchantName,
        s.merchantPhone,
        s.note || '',
        s.voiceTranscript || '',
        ...s.items.map((i) => i.productName),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [data, search, zone])

  const filteredRevenue = useMemo(
    () => filteredSales.reduce((sum, s) => sum + s.totalAmount, 0),
    [filteredSales],
  )

  const hourlyData = useMemo(() => {
    if (!data) return []
    // Ne garder que les heures avec au moins une vente, pour un graphique lisible
    return data.hourly.filter((h) => h.count > 0).map((h) => ({ ...h, label: `${String(h.hour).padStart(2, '0')}h` }))
  }, [data])

  return (
    <div className={`min-h-full p-4 sm:p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`}>
      <BoPageHeader
        title="Ventes marchands"
        description={`Détail des ventes de la journée — ${formatDateTitre(dateStr).toLowerCase()}`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(dateStr)}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        }
      />

      {error && <BoErrorBanner message={error} onRetry={() => fetchData(dateStr)} />}

      {/* Navigation par jour */}
      <BoFilterBar>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Jour précédent"
            onClick={() => {
              const d = new Date(`${dateStr}T12:00:00Z`)
              d.setUTCDate(d.getUTCDate() - 1)
              setDateStr(d.toISOString().slice(0, 10))
            }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              type="date"
              value={dateStr}
              max={today}
              onChange={(e) => e.target.value && setDateStr(e.target.value)}
              className="w-[170px] pl-8"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Jour suivant"
            disabled={dateStr >= today}
            onClick={() => {
              const d = new Date(`${dateStr}T12:00:00Z`)
              d.setUTCDate(d.getUTCDate() + 1)
              setDateStr(d.toISOString().slice(0, 10))
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDateStr(today)} disabled={dateStr === today}>
            Aujourd'hui
          </Button>
        </div>

        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Rechercher un marchand, un produit, une note…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select value={zone} onValueChange={setZone}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Zone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="toutes">Toutes les zones</SelectItem>
            {zones.map((z) => (
              <SelectItem key={z} value={z}>{z}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </BoFilterBar>

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : data ? (
        <>
          {/* Synthèse */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <BoStatCard
              icon={ShoppingBag}
              tone="blue"
              label="Chiffre d'affaires"
              value={formatFCFA(data.summary.revenue)}
              hint={<VariationHint percent={data.summary.revenueChangePercent} />}
            />
            <BoStatCard
              icon={ReceiptText}
              tone="emerald"
              label="Ventes enregistrées"
              value={data.summary.count}
              hint={<VariationHint percent={data.summary.countChangePercent} />}
            />
            <BoStatCard
              icon={Users}
              tone="default"
              label="Panier moyen"
              value={formatFCFA(data.summary.avgBasket)}
            />
            <BoStatCard
              icon={Package}
              tone="orange"
              label="Articles vendus"
              value={data.summary.itemsSold}
            />
            <BoStatCard
              icon={Mic}
              tone="amber"
              label="Ventes vocales"
              value={data.summary.voiceCount}
              hint={data.summary.changeGiven > 0 ? `· ${formatFCFA(data.summary.changeGiven)} rendus` : undefined}
            />
          </div>

          {/* CA par heure */}
          {hourlyData.length > 0 && (
            <Card className="bg-white dark:bg-slate-800 dark:border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Chiffre d'affaires par heure</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        width={70}
                        tickFormatter={(v: number) => new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v)}
                      />
                      <Tooltip content={<ChartTooltip isDark={isDark} />} cursor={{ fill: isDark ? '#1e293b80' : '#f1f5f980' }} />
                      <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={42} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ventes / Par marchand */}
          <Tabs defaultValue="ventes">
            <TabsList>
              <TabsTrigger value="ventes">
                Ventes ({filteredSales.length})
              </TabsTrigger>
              <TabsTrigger value="marchands">
                Par marchand ({data.merchants.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ventes" className="mt-4 space-y-3">
              {filteredSales.length === 0 ? (
                <BoEmptyState
                  icon={Inbox}
                  title={search || zone !== 'toutes' ? 'Aucune vente ne correspond aux filtres' : 'Aucune vente ce jour-là'}
                  description={
                    search || zone !== 'toutes'
                      ? 'Essayez de élargir la recherche ou de changer de zone.'
                      : "Les ventes réalisées par les marchands sur l'application apparaîtront ici en temps réel."
                  }
                />
              ) : (
                <>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {filteredSales.length} vente{filteredSales.length > 1 ? 's' : ''} ·{' '}
                    <strong className="text-slate-900 dark:text-slate-100">{formatFCFA(filteredRevenue)}</strong>{' '}
                    {zone !== 'toutes' ? `en zone ${zone}` : 'au total'}
                  </p>
                  {filteredSales.map((vente) => (
                    <VenteRow key={vente.id} vente={vente} />
                  ))}
                </>
              )}
            </TabsContent>

            <TabsContent value="marchands" className="mt-4">
              {data.merchants.length === 0 ? (
                <BoEmptyState
                  icon={Inbox}
                  title="Aucun marchand actif ce jour-là"
                  description="La répartition des ventes par marchand apparaîtra ici."
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-800/80">
                        <TableHead>Marchand</TableHead>
                        <TableHead>Zone</TableHead>
                        <TableHead className="text-right">Ventes</TableHead>
                        <TableHead className="text-right">Articles</TableHead>
                        <TableHead className="text-right">Chiffre d'affaires</TableHead>
                        <TableHead className="text-right">Part</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.merchants
                        .filter((m) => zone === 'toutes' || m.zone === zone)
                        .map((m) => (
                          <TableRow key={m.merchantId} className="bg-white dark:bg-slate-800">
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                                  {initialsOf(m.merchantName)}
                                </div>
                                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{m.merchantName}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-slate-500 dark:text-slate-400">{m.zone || '—'}</TableCell>
                            <TableCell className="text-right text-sm text-slate-700 dark:text-slate-200">{m.salesCount}</TableCell>
                            <TableCell className="text-right text-sm text-slate-700 dark:text-slate-200">{m.itemsSold}</TableCell>
                            <TableCell className="text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {formatFCFA(m.revenue)}
                            </TableCell>
                            <TableCell className="text-right text-sm text-slate-500 dark:text-slate-400">
                              {data.summary.revenue > 0 ? Math.round((m.revenue / data.summary.revenue) * 100) : 0} %
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  )
}
