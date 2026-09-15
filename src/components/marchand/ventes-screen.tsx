'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft, Calendar, ChevronDown, ChevronUp, ShoppingBag,
  WifiOff, RotateCw
} from 'lucide-react'
import { ProductIcon } from '@/lib/product-icons'
import { useAppStore } from '@/lib/stores/app-store'
import { formatFCFA } from '@/lib/voice/localIntent'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'

interface SaleItem {
  name: string
  quantity: number
  unitPrice: number
}

interface PastSale {
  id: string
  timestamp: string
  items: SaleItem[]
  total: number
}

type DateFilter = 'today' | 'week' | 'month'

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week', label: 'Cette semaine' },
  { key: 'month', label: 'Ce mois' },
]

function dateRangeForFilter(filter: DateFilter): { startDate?: string; endDate?: string } {
  const now = new Date()
  if (filter === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return { startDate: start.toISOString(), endDate: now.toISOString() }
  }
  if (filter === 'week') {
    const start = new Date(now)
    start.setDate(start.getDate() - 7)
    return { startDate: start.toISOString(), endDate: now.toISOString() }
  }
  // month
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return { startDate: start.toISOString(), endDate: now.toISOString() }
}

export function VentesScreen() {
  const { soleilMode, goBack, merchantId } = useAppStore()
  const [dateFilter, setDateFilter] = useState<DateFilter>('week')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sales, setSales] = useState<PastSale[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  const textClass = soleilMode ? 'text-black' : ''

  // Fetch real sales from the server
  useEffect(() => {
    if (!merchantId) return
    let cancelled = false
    setLoading(true)
    setLoadError(false)

    const { startDate, endDate } = dateRangeForFilter(dateFilter)

    const params = new URLSearchParams({ merchantId })
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)

    fetch(`/api/marchand/sales?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Erreur ${res.status}`))))
      .then((data) => {
        if (cancelled) return
        const loaded: PastSale[] = (data.sales ?? []).map((s: Record<string, unknown>) => ({
          id: s.id as string,
          timestamp: s.createdAt as string,
          items: ((s.items as Array<Record<string, unknown>>) ?? []).map((i) => ({
            name: (i.productName as string) || 'Article',
            quantity: (i.quantity as number) || 1,
            unitPrice: (i.unitPrice as number) || 0,
          })),
          total: (s.totalAmount as number) || 0,
        }))
        setSales(loaded)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [merchantId, dateFilter, reloadToken])

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0)
  const totalItems = sales.reduce((sum, s) => sum + s.items.reduce((is, i) => is + i.quantity, 0), 0)

  // Build daily chart data
  const chartData = useMemo(() => {
    const dayMap: Record<string, number> = {}
    sales.forEach(s => {
      const key = new Date(s.timestamp).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
      dayMap[key] = (dayMap[key] || 0) + s.total
    })
    const entries = Object.entries(dayMap)
    const max = Math.max(...entries.map(([, v]) => v), 1)
    return entries.map(([label, value]) => ({ label, value, height: (value / max) * 100 }))
  }, [sales])

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="screen-enter pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Historique des ventes</h1>
        </div>

        {/* Date filters */}
        <div className="flex gap-2">
          {DATE_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => {
                setDateFilter(f.key)
                tataSpeak(`Filtre sélectionné : ${f.label}.`)
                haptic('light')
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                dateFilter === f.key
                  ? 'bg-[#C66A2C] text-white'
                  : 'bg-muted text-muted-foreground'
              } ${soleilMode && dateFilter !== f.key ? 'text-black bg-gray-200 dark:text-stone-100 dark:bg-stone-700' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats summary */}
      <div className="px-4 mt-4 grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className={`text-xs text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>Chiffre d'affaires</p>
            <p className={`text-lg font-bold text-[#C66A2C] fcfa ${soleilMode ? 'text-xl' : ''}`}>{formatFCFA(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className={`text-xs text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>Ventes & articles</p>
            <p className={`text-lg font-bold ${soleilMode ? 'text-xl' : ''}`}>
              {sales.length} <span className={`text-sm font-normal text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>/ {totalItems} pcs</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Loading */}
      {loading && sales.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className={soleilMode ? 'text-base' : ''}>Chargement…</p>
        </div>
      )}

      {/* Error */}
      {!loading && loadError && (
        <div className="text-center py-16 text-muted-foreground">
          <WifiOff className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className={soleilMode ? 'text-base' : ''}>Impossible de charger les ventes</p>
          <p className={`text-xs mt-1 ${soleilMode ? 'text-sm' : ''}`}>Vérifiez votre connexion</p>
          <Button variant="outline" size="sm" className="mt-3 min-h-11" onClick={() => setReloadToken((t) => t + 1)}>
            <RotateCw className="w-3.5 h-3.5 mr-1.5" /> Réessayer
          </Button>
        </div>
      )}

      {/* Bar Chart */}
      {!loading && !loadError && chartData.length > 0 && (
        <div className="px-4 mt-4">
          <Card>
            <CardContent className="p-4">
              <h3 className={`text-sm font-semibold mb-3 ${soleilMode ? 'text-base text-black' : ''}`}>Revenus par jour</h3>
              <div className="flex items-end gap-2 h-32">
                {chartData.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className={`text-[10px] font-semibold fcfa text-[#C66A2C] ${soleilMode ? 'text-xs' : ''}`}>
                      {d.value > 0 ? formatFCFA(d.value) : ''}
                    </span>
                    <div
                      className="w-full bg-gradient-to-t from-[#C66A2C] to-[#D4843F] rounded-t-md min-h-[4px] transition-[height] duration-500"
                      style={{ height: `${Math.max(d.height, 4)}%` }}
                    />
                    <span className={`text-[9px] text-muted-foreground text-center leading-tight ${soleilMode ? 'text-xs' : ''}`}>
                      {d.label}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sales list */}
      <div className="px-4 mt-4 space-y-2">
        {!loading && !loadError && (
          <h3 className={`text-sm font-semibold text-muted-foreground ${soleilMode ? 'text-base text-black' : ''}`}>
            {sales.length} vente{sales.length > 1 ? 's' : ''}
          </h3>
        )}

        {!loading && !loadError && sales.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className={soleilMode ? 'text-base' : ''}>Aucune vente pour cette période</p>
          </div>
        )}

        {!loading && !loadError && sales.map(sale => {
          const isExpanded = expandedId === sale.id
          const itemCount = sale.items.reduce((s, i) => s + i.quantity, 0)

          return (
            <Card key={sale.id} className={isExpanded ? 'border-[#C66A2C]/30' : ''}>
              <CardContent
                className="p-3 cursor-pointer active:scale-[0.99] transition-transform"
                onClick={() => {
                  setExpandedId(isExpanded ? null : sale.id)
                  tataSpeak(isExpanded
                    ? 'Détail de la vente masqué.'
                    : `Détail de la vente du ${formatDate(sale.timestamp)} : ${formatFCFA(sale.total)}.`)
                  haptic('light')
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className={`text-xs text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>
                        {formatDate(sale.timestamp)} à {formatTime(sale.timestamp)}
                      </span>
                    </div>
                    <p className={`text-sm mt-1 truncate ${soleilMode ? 'text-black text-base' : ''}`}>
                      {sale.items.map(i => i.name).join(', ')}
                    </p>
                    <p className={`text-xs text-muted-foreground mt-0.5 ${soleilMode ? 'text-base' : ''}`}>
                      {itemCount} article{itemCount > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-bold text-[#C66A2C] fcfa ${soleilMode ? 'text-base' : ''}`}>
                      {formatFCFA(sale.total)}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    {sale.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <ProductIcon name={item.name} className="w-5 h-5 text-muted-foreground" />
                        <span className={`text-sm flex-1 ${soleilMode ? 'text-black text-base' : ''}`}>{item.name}</span>
                        <span className={`text-xs text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>×{item.quantity}</span>
                        <span className={`text-xs text-muted-foreground fcfa ${soleilMode ? 'text-base' : ''}`}>{formatFCFA(item.unitPrice)}</span>
                        <span className={`text-sm font-medium fcfa w-16 text-right ${soleilMode ? 'text-base' : ''}`}>{formatFCFA(item.quantity * item.unitPrice)}</span>
                      </div>
                    ))}
                    <Separator className="my-2" />
                    <div className="flex justify-between items-center">
                      <span className={`text-sm font-semibold ${soleilMode ? 'text-black text-base' : ''}`}>Total</span>
                      <span className={`text-base font-bold text-[#C66A2C] fcfa ${soleilMode ? 'text-xl' : ''}`}>{formatFCFA(sale.total)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
