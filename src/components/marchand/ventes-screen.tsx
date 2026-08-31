'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft, Calendar, ChevronDown, ChevronUp, ShoppingBag, X
} from 'lucide-react'
import { ProductIcon } from '@/lib/product-icons'
import { useAppStore } from '@/lib/stores/app-store'
import { formatFCFA } from '@/lib/voice/localIntent'
import { haptic } from '@/lib/voice/tata-tts'

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



function daysAgo(n: number, hour = 8, minute = 30): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

const MOCK_SALES: PastSale[] = [
  {
    id: 's1', timestamp: daysAgo(0, 7, 15),
    items: [
      { name: 'Tomates', quantity: 5, unitPrice: 100 },
      { name: 'Oignons', quantity: 3, unitPrice: 150 },
    ], total: 950,
  },
  {
    id: 's2', timestamp: daysAgo(0, 9, 42),
    items: [
      { name: 'Riz', quantity: 2, unitPrice: 500 },
      { name: 'Poisson fumé', quantity: 1, unitPrice: 500 },
    ], total: 1500,
  },
  {
    id: 's3', timestamp: daysAgo(0, 11, 5),
    items: [
      { name: 'Poulet', quantity: 1, unitPrice: 2500 },
      { name: 'Ignames', quantity: 2, unitPrice: 200 },
      { name: 'Piments', quantity: 3, unitPrice: 50 },
    ], total: 3050,
  },
  {
    id: 's4', timestamp: daysAgo(0, 14, 20),
    items: [
      { name: 'Avocats', quantity: 4, unitPrice: 200 },
      { name: 'Bananes', quantity: 3, unitPrice: 100 },
    ], total: 1100,
  },
  {
    id: 's5', timestamp: daysAgo(1, 8, 10),
    items: [
      { name: 'Huile de palme', quantity: 1, unitPrice: 1500 },
      { name: 'Tomates', quantity: 10, unitPrice: 100 },
      { name: 'Oignons', quantity: 5, unitPrice: 150 },
    ], total: 3250,
  },
  {
    id: 's6', timestamp: daysAgo(1, 10, 55),
    items: [
      { name: 'Riz', quantity: 5, unitPrice: 500 },
      { name: 'Œufs', quantity: 12, unitPrice: 100 },
    ], total: 3700,
  },
  {
    id: 's7', timestamp: daysAgo(1, 15, 30),
    items: [
      { name: 'Poulet', quantity: 2, unitPrice: 2500 },
    ], total: 5000,
  },
  {
    id: 's8', timestamp: daysAgo(2, 9, 0),
    items: [
      { name: 'Manioc', quantity: 3, unitPrice: 300 },
      { name: 'Poisson fumé', quantity: 2, unitPrice: 500 },
      { name: 'Gombos', quantity: 4, unitPrice: 75 },
    ], total: 2400,
  },
  {
    id: 's9', timestamp: daysAgo(2, 13, 45),
    items: [
      { name: 'Ignames', quantity: 5, unitPrice: 200 },
      { name: 'Pommes de terre', quantity: 3, unitPrice: 250 },
    ], total: 1750,
  },
  {
    id: 's10', timestamp: daysAgo(3, 8, 30),
    items: [
      { name: 'Tomates', quantity: 15, unitPrice: 100 },
      { name: 'Carottes', quantity: 8, unitPrice: 75 },
      { name: 'Salade', quantity: 3, unitPrice: 100 },
    ], total: 2400,
  },
  {
    id: 's11', timestamp: daysAgo(3, 11, 15),
    items: [
      { name: 'Arachides', quantity: 5, unitPrice: 200 },
      { name: 'Ail', quantity: 10, unitPrice: 50 },
    ], total: 1500,
  },
  {
    id: 's12', timestamp: daysAgo(4, 10, 0),
    items: [
      { name: 'Riz', quantity: 3, unitPrice: 500 },
      { name: 'Poulet', quantity: 1, unitPrice: 2500 },
      { name: 'Huile de palme', quantity: 1, unitPrice: 1500 },
      { name: 'Piments', quantity: 5, unitPrice: 50 },
    ], total: 5750,
  },
  {
    id: 's13', timestamp: daysAgo(5, 9, 20),
    items: [
      { name: 'Bananes', quantity: 10, unitPrice: 100 },
      { name: 'Oranges', quantity: 6, unitPrice: 150 },
    ], total: 1900,
  },
  {
    id: 's14', timestamp: daysAgo(6, 14, 10),
    items: [
      { name: 'Mangues', quantity: 8, unitPrice: 150 },
      { name: 'Ananas', quantity: 2, unitPrice: 500 },
      { name: 'Avocats', quantity: 5, unitPrice: 200 },
    ], total: 3200,
  },
]

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week', label: 'Cette semaine' },
  { key: 'month', label: 'Ce mois' },
]

export function VentesScreen() {
  const { soleilMode, goBack } = useAppStore()
  const [dateFilter, setDateFilter] = useState<DateFilter>('week')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const textClass = soleilMode ? 'text-black' : ''

  const filteredSales = useMemo(() => {
    const now = new Date()
    return MOCK_SALES.filter(sale => {
      const d = new Date(sale.timestamp)
      switch (dateFilter) {
        case 'today':
          return d.toDateString() === now.toDateString()
        case 'week': {
          const weekAgo = new Date()
          weekAgo.setDate(weekAgo.getDate() - 7)
          return d >= weekAgo
        }
        case 'month':
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      }
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [dateFilter])

  const totalRevenue = filteredSales.reduce((sum, s) => sum + s.total, 0)
  const totalItems = filteredSales.reduce((sum, s) => sum + s.items.reduce((is, i) => is + i.quantity, 0), 0)

  // Build daily chart data
  const chartData = useMemo(() => {
    const dayMap: Record<string, number> = {}
    filteredSales.forEach(s => {
      const key = new Date(s.timestamp).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
      dayMap[key] = (dayMap[key] || 0) + s.total
    })
    const entries = Object.entries(dayMap)
    // Sort chronologically
    entries.sort((a, b) => {
      // Simple heuristic: use the sales data order which is already time-sorted
      return 0
    })
    const max = Math.max(...entries.map(([, v]) => v), 1)
    return entries.map(([label, value]) => ({ label, value, height: (value / max) * 100 }))
  }, [filteredSales])

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
              onClick={() => { setDateFilter(f.key); haptic('light') }}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                dateFilter === f.key
                  ? 'bg-[#C66A2C] text-white'
                  : 'bg-muted text-muted-foreground'
              } ${soleilMode && dateFilter !== f.key ? 'text-black bg-gray-200' : ''}`}
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
              {filteredSales.length} <span className={`text-sm font-normal text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>/ {totalItems} pcs</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bar Chart */}
      {chartData.length > 0 && (
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
                      className="w-full bg-gradient-to-t from-[#C66A2C] to-[#D4843F] rounded-t-md min-h-[4px] transition-all duration-500"
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
        <h3 className={`text-sm font-semibold text-muted-foreground ${soleilMode ? 'text-base text-black' : ''}`}>
          {filteredSales.length} vente{filteredSales.length > 1 ? 's' : ''}
        </h3>

        {filteredSales.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className={soleilMode ? 'text-base' : ''}>Aucune vente pour cette période</p>
          </div>
        )}

        {filteredSales.map(sale => {
          const isExpanded = expandedId === sale.id
          const itemCount = sale.items.reduce((s, i) => s + i.quantity, 0)

          return (
            <Card key={sale.id} className={isExpanded ? 'border-[#C66A2C]/30' : ''}>
              <CardContent
                className="p-3 cursor-pointer active:scale-[0.99] transition-transform"
                onClick={() => { setExpandedId(isExpanded ? null : sale.id); haptic('light') }}
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
