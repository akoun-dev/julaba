'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft, Ban, Calendar, ChevronDown, ChevronUp, Loader2, ShoppingBag,
  Undo2, X
} from 'lucide-react'
import { AppEmpty, AppError, AppLoading } from '@/components/shared/app-states'
import { ProductIcon } from '@/lib/product-icons'
import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { formatFCFA } from '@/lib/utils'
import { tataSpeak, haptic, playBeep } from '@/lib/voice/tata-tts'
import {
  QUICK_CANCEL_REASONS,
  saleAlreadyCancelledPhrase,
  saleReversedPhrase,
} from '@/lib/market-mode/reversal-phrases'

interface SaleItem {
  name: string
  quantity: number
  unitPrice: number
}

interface PastSale {
  id: string
  /** client_id de la vente (cible de l'annulation — MODE-909). */
  clientId?: string
  timestamp: string
  items: SaleItem[]
  total: number
  /** MODE-909 (§28) — vente annulée par une opération inverse append-only
   * (elle reste dans l'historique, marquée — jamais supprimée). */
  annulee: boolean
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
  // MODE-909 (§28) — journal des ventes du jour : seule une vente connue
  // localement (non annulée) peut être annulée depuis cet appareil. Le
  // sélecteur rend la référence du tableau (jamais d'objet neuf —
  // INCIDENT-006) : re-rendu uniquement quand le journal change vraiment.
  const todayJournal = useCaisseStore((s) => s.todaySalesJournal)
  const [dateFilter, setDateFilter] = useState<DateFilter>('week')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sales, setSales] = useState<PastSale[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  // MODE-939 (AUDIT-003 PF-03) — la page serveur est bornée : si la
  // réponse arrive exactement à la borne, l'écran le dit (jamais
  // d'historique tronqué en silence).
  const [limiteAtteinte, setLimiteAtteinte] = useState(false)
  // MODE-909 — modale de confirmation d'annulation (raison obligatoire).
  const [cancelTarget, setCancelTarget] = useState<PastSale | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [reversing, setReversing] = useState(false)

  const textClass = soleilMode ? 'text-black' : ''

  // MODE-909 (§28) — annulées LOCALEMENT (journal du jour) : le badge est
  // affiché IMMÉDIATEMENT après l'annulation, même si le serveur n'a pas
  // encore reçu l'opération (offline-first — la file partira, la vérité
  // serveur reprendra à la relecture). Set mémoïsé : jamais d'objet neuf
  // par rendu (INCIDENT-006).
  const locallyCancelledIds = useMemo(
    () => new Set(todayJournal.filter((e) => e.annulee).map((e) => e.saleClientId)),
    [todayJournal],
  )
  const displayedSales = useMemo(
    () =>
      sales.map((s) =>
        s.clientId && locallyCancelledIds.has(s.clientId) ? { ...s, annulee: true } : s,
      ),
    [sales, locallyCancelledIds],
  )

  // MODE-909 — annulable depuis CET appareil : vente du JOUR (le journal
  // local couvre le jour — annuler une vente d'un autre jour/appareil est
  // hors périmètre v1, documenté SPEC-909), avec un client_id (cible de
  // l'opération inverse) et pas déjà annulée. Jamais le mot « supprimer ».
  const isSaleToday = (iso: string): boolean => {
    const d = new Date(iso)
    const now = new Date()
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    )
  }
  const isCancellable = (sale: PastSale): boolean =>
    !sale.annulee && Boolean(sale.clientId) && isSaleToday(sale.timestamp)

  const openCancelModal = (sale: PastSale) => {
    setCancelTarget(sale)
    setCancelReason('')
    setCancelError(null)
    haptic('light')
  }

  const closeCancelModal = () => {
    if (reversing) return
    setCancelTarget(null)
    setCancelError(null)
  }

  const confirmCancel = async () => {
    if (!cancelTarget?.clientId || reversing) return
    setReversing(true)
    setCancelError(null)
    try {
      // Opération inverse locale : marque le journal, remet le stock en
      // DELTA, met l'annulation en file ('sale-reversal' — FIFO après la
      // vente). Refus honnête sur une vente déjà annulée (§28 : une vente
      // ne s'annule qu'UNE fois).
      const result = useCaisseStore.getState().reverseSale(cancelTarget.clientId, cancelReason)
      if (!result.ok) {
        const message = /déjà annulée/i.test(result.error)
          ? saleAlreadyCancelledPhrase()
          : result.error
        setCancelError(message)
        tataSpeak(message)
        return
      }
      // §28 — phrase imposée : le stock est revenu (opération inverse).
      playBeep('success')
      tataSpeak(saleReversedPhrase())
      setCancelTarget(null)
      // Relecture : le serveur fera foi quand l'opération sera partie.
      setReloadToken((t) => t + 1)
    } finally {
      setReversing(false)
    }
  }

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
          clientId: (s.clientId as string) || undefined,
          timestamp: s.createdAt as string,
          items: ((s.items as Array<Record<string, unknown>>) ?? []).map((i) => ({
            name: (i.productName as string) || 'Article',
            quantity: (i.quantity as number) || 1,
            unitPrice: (i.unitPrice as number) || 0,
          })),
          total: (s.totalAmount as number) || 0,
          annulee: Boolean(s.annulee),
        }))
        setSales(loaded)
        setLimiteAtteinte(Array.isArray(data.sales) && typeof data.limit === 'number' && data.sales.length >= data.limit)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [merchantId, dateFilter, reloadToken])

  // MODE-909 (§28) — revenu = ce qui est COMPTE : les ventes annulées
  // restent dans la liste (historique intact) mais sortent du chiffre
  // d'affaires (même règle que totalRevenue côté GET /sales).
  const totalRevenue = displayedSales
    .filter((s) => !s.annulee)
    .reduce((sum, s) => sum + s.total, 0)
  const totalItems = displayedSales.reduce((sum, s) => sum + s.items.reduce((is, i) => is + i.quantity, 0), 0)

  // Build daily chart data
  const chartData = useMemo(() => {
    const dayMap: Record<string, number> = {}
    displayedSales.forEach(s => {
      if (s.annulee) return // MODE-909 — une vente annulée n'est pas un revenu.
      const key = new Date(s.timestamp).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
      dayMap[key] = (dayMap[key] || 0) + s.total
    })
    const entries = Object.entries(dayMap)
    const max = Math.max(...entries.map(([, v]) => v), 1)
    return entries.map(([label, value]) => ({ label, value, height: (value / max) * 100 }))
  }, [displayedSales])

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Historique des ventes</h1>
        </div>

        {/* Date filters — rail scrollable (pattern stock-screen) : les trois
            filtres ≈ 298px débordaient des 288px utiles à 320px, le 3e était
            clippé par body{overflow-x-hidden} sans scroll possible. */}
        <div className="-mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar">
          {DATE_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => {
                setDateFilter(f.key)
                tataSpeak(`Filtre sélectionné : ${f.label}.`)
                haptic('light')
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${
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

      {/* Loading — MODE-1008 : kit d'états partagé (miroir bo-ui). */}
      {loading && sales.length === 0 && (
        <AppLoading soleilMode={soleilMode} className="py-16" />
      )}

      {/* Error — MODE-1008 : AppError (miroir BoErrorBanner), textes inchangés. */}
      {!loading && loadError && (
        <AppError
          message="Impossible de charger les ventes"
          description="Vérifiez votre connexion"
          onRetry={() => setReloadToken((t) => t + 1)}
          soleilMode={soleilMode}
          className="mx-4 mt-4 py-10"
        />
      )}

      {/* Bar Chart */}
      {!loading && !loadError && chartData.length > 0 && (
        <div className="px-4 mt-4">
          <Card>
            <CardContent className="p-4">
              <h3 className={`text-sm font-semibold mb-3 ${soleilMode ? 'text-base text-black' : ''}`}>Revenus par jour</h3>
              {/* Chaque colonne garde ≥ 44px : le filtre « Ce mois » (~31
                  barres) passe en scroll horizontal au lieu d'écraser 31
                  barres sur 256px avec labels qui se chevauchent. */}
              <div className="flex items-end gap-2 h-32 overflow-x-auto no-scrollbar">
                {chartData.map((d, i) => (
                  <div key={i} className="flex-1 min-w-[44px] flex flex-col items-center gap-1">
                    <span className={`text-xs font-semibold fcfa text-[#C66A2C] ${soleilMode ? 'text-sm' : ''}`}>
                      {d.value > 0 ? formatFCFA(d.value) : ''}
                    </span>
                    <div
                      className="w-full bg-gradient-to-t from-[#C66A2C] to-[#D4843F] rounded-t-md min-h-[4px] transition-[height] duration-200 ease-out"
                      style={{ height: `${Math.max(d.height, 4)}%` }}
                    />
                    <span className={`text-xs text-muted-foreground text-center leading-tight ${soleilMode ? 'font-semibold' : ''}`}>
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

        {!loading && !loadError && displayedSales.length === 0 && (
          <AppEmpty
            icon={ShoppingBag}
            title="Aucune vente pour cette période"
            soleilMode={soleilMode}
            className="py-16"
          />
        )}

        {/* MODE-939 (PF-03) — l'historique affiché est une page bornée :
            quand la borne est atteinte, l'écran le dit honnêtement. */}
        {!loading && !loadError && limiteAtteinte && (
          <p className="px-4 mt-2 text-xs text-muted-foreground text-center">
            Les {displayedSales.length} ventes les plus récentes sont affichées — affinez par période pour voir plus.
          </p>
        )}

        {!loading && !loadError && displayedSales.map(sale => {
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
                    {/* MODE-909 (§28) — badge « Annulée » ambre : la vente
                        RESTE dans l'historique (jamais supprimée) ; son
                        montant n'est plus compté dans le chiffre d'affaires. */}
                    {sale.annulee && (
                      <Badge className="shrink-0 border border-amber-300 bg-amber-100 text-amber-800">
                        <Ban className="mr-1 h-3 w-3" aria-hidden="true" />
                        Annulée
                      </Badge>
                    )}
                    <span className={`text-sm font-bold fcfa ${sale.annulee ? 'text-muted-foreground line-through' : 'text-[#C66A2C]'} ${soleilMode ? 'text-base' : ''}`}>
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
                        <span className={`text-sm font-medium fcfa min-w-16 text-right ${soleilMode ? 'text-base' : ''}`}>{formatFCFA(item.quantity * item.unitPrice)}</span>
                      </div>
                    ))}
                    <Separator className="my-2" />
                    <div className="flex justify-between items-center">
                      <span className={`text-sm font-semibold ${soleilMode ? 'text-black text-base' : ''}`}>Total</span>
                      <span className={`text-base font-bold fcfa ${sale.annulee ? 'text-muted-foreground line-through' : 'text-[#C66A2C]'} ${soleilMode ? 'text-xl' : ''}`}>{formatFCFA(sale.total)}</span>
                    </div>
                    {/* MODE-909 (§28) — « Annuler la vente » (JAMAIS
                        « supprimer ») : ouvre la modale de raison —
                        l'annulation est une OPÉRATION INVERSE, la vente et
                        l'historique restent intacts, le stock revient. */}
                    {isCancellable(sale) && (
                      <Button
                        variant="outline"
                        className="mt-2 w-full min-h-11 border-amber-500/60 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                        onClick={(e) => {
                          e.stopPropagation()
                          openCancelModal(sale)
                        }}
                      >
                        <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        Annuler la vente
                      </Button>
                    )}
                    {sale.annulee && (
                      <p className="text-center text-xs text-muted-foreground">
                        Vente annulée — stock remis, montant non compté.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* MODE-909 (§28) — modale de raison : l'annulation est une opération
          INVERSE (le stock des articles vendus revient), JAMAIS une
          suppression — la vente reste dans l'historique. Raison OBLIGATOIRE
          (3-200, même règle que le zod et le CHECK en base) : champ libre
          + 3 raisons rapides. */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={closeCancelModal}>
          <Card className="w-full max-w-lg rounded-t-3xl rounded-b-none" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 pb-10">
              <div className="mb-4 flex items-center justify-between">
                <h3 className={`text-lg font-bold ${textClass}`}>Annuler la vente</h3>
                <Button variant="ghost" size="icon" onClick={closeCancelModal} aria-label="Fermer" disabled={reversing}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <p className={`text-sm ${soleilMode ? 'text-base text-black' : 'text-muted-foreground'}`}>
                Vente du {formatDate(cancelTarget.timestamp)} à {formatTime(cancelTarget.timestamp)} ·{' '}
                {formatFCFA(cancelTarget.total)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Le stock des articles vendus sera remis. La vente reste dans l’historique.
              </p>

              <label htmlFor="cancel-reason" className={`mb-1 mt-4 block text-sm font-medium ${textClass}`}>
                Pourquoi annuler ? (obligatoire)
              </label>
              <Input
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex : je m’étais trompée de prix"
                maxLength={200}
                aria-label="Raison de l’annulation"
                autoFocus
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {QUICK_CANCEL_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setCancelReason(reason)}
                    aria-pressed={cancelReason === reason}
                    className={`min-h-11 rounded-full border px-3 text-sm font-medium transition-colors ${
                      cancelReason === reason
                        ? 'border-[#C66A2C] bg-[#C66A2C] text-white'
                        : 'border-border bg-background text-muted-foreground'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>

              {cancelError && (
                <p className="mt-3 text-sm text-red-600" role="alert">{cancelError}</p>
              )}

              <Button
                className="mt-5 w-full min-h-12 bg-amber-600 text-white hover:bg-amber-700"
                onClick={() => { void confirmCancel() }}
                disabled={reversing || cancelReason.trim().length < 3}
              >
                {reversing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {reversing ? 'Annulation…' : 'Confirmer l’annulation'}
              </Button>
              <Button variant="ghost" className="mt-2 w-full min-h-11" onClick={closeCancelModal} disabled={reversing}>
                Garder la vente
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
