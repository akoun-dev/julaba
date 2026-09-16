'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft, ShoppingCart, ShoppingBag, WifiOff, GraduationCap,
  Heart, Shield,
  Clock, Users, Calendar, Trophy, Gift,
  Package, Truck, CheckCircle2, AlertCircle, Minus,
  Building2, Plus, Eye, ArrowRight
} from 'lucide-react'
import { ProductIcon } from '@/lib/product-icons'
import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import { formatFCFA } from '@/lib/voice/localIntent'
import { tataSpeak, haptic, playBeep } from '@/lib/voice/tata-tts'
import { queuePendingSync } from '@/lib/offline-db'
import { useNetworkStatus } from '@/lib/hooks/use-network-status'

// ============================================================
// MARCHÉ SCREEN - Virtual marketplace with real supplier ordering
// ============================================================

const SUPPLIER_PRODUCTS = [
  { id: 'sp1', name: 'Tomates (caisse)', price: 12000, supplier: 'Ferme Awa' },
  { id: 'sp2', name: 'Oignons (sac 50kg)', price: 25000, supplier: 'Coop Yamoussoukro' },
  { id: 'sp3', name: 'Riz 25kg long grain', price: 18000, supplier: 'Dépôt Koffi' },
  { id: 'sp4', name: 'Poulets vivants (lot 10)', price: 30000, supplier: 'Poulailler Adjame' },
  { id: 'sp5', name: 'Huile de palme 5L', price: 6500, supplier: 'Huilerie Dabou' },
  { id: 'sp6', name: 'Poisson fumé (carton)', price: 22000, supplier: 'Pêcheur Abidjan' },
  { id: 'sp7', name: 'Ignames (tas)', price: 8000, supplier: 'Marché Bondoukou' },
  { id: 'sp8', name: 'Arachides (sac 25kg)', price: 15000, supplier: 'Coop Korhogo' },
]

const ORDER_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  en_attente: { label: 'En attente', className: 'bg-amber-100 text-amber-700 border-0' },
  confirmee: { label: 'Confirmée', className: 'bg-blue-100 text-blue-700 border-0' },
  livree: { label: 'Livrée', className: 'bg-green-100 text-green-700 border-0' },
  annulee: { label: 'Annulée', className: 'bg-slate-100 text-slate-500 border-0' },
}

interface SupplierOrder {
  id: string
  supplier: string
  productName: string
  quantity: number
  totalAmount: number
  status: string
  createdAt: string
}

export function MarcheScreen() {
  const { soleilMode, goBack, navigate, merchantId } = useAppStore()
  // Real connectivity, not a hardcoded claim — this badge used to say "En
  // ligne" unconditionally even while offline.
  const online = useNetworkStatus()

  const [orderProduct, setOrderProduct] = useState<(typeof SUPPLIER_PRODUCTS)[number] | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [ordering, setOrdering] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)

  const [recentOrders, setRecentOrders] = useState<SupplierOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)

  const loadRecentOrders = useCallback(async () => {
    if (!merchantId) return
    try {
      const res = await fetch(`/api/marchand/supplier-orders?merchantId=${merchantId}`)
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setRecentOrders((data.orders ?? []).slice(0, 3))
    } catch {
      // Offline or server error — keep whatever was already loaded; the
      // Commandes screen owns the full list and its own error state.
    } finally {
      setOrdersLoading(false)
    }
  }, [merchantId])

  useEffect(() => {
    loadRecentOrders()
  }, [loadRecentOrders])

  const openOrderDialog = (product: (typeof SUPPLIER_PRODUCTS)[number]) => {
    setOrderProduct(product)
    setQuantity(1)
    setOrderError(null)
  }

  const handleOrder = async () => {
    if (!merchantId || !orderProduct || ordering) return
    setOrdering(true)
    setOrderError(null)
    const payload = {
      merchantId,
      supplier: orderProduct.supplier,
      productName: orderProduct.name,
      quantity,
      unitPrice: orderProduct.price,
      clientId: `sorder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }
    let queuedInstead = false
    try {
      const res = await fetch('/api/marchand/supplier-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setOrderError(data?.erreur ?? 'Commande refusée. Réessayez.')
        setOrdering(false)
        return
      }
    } catch {
      // Offline: a supplier order is a pure creation (no balance, no
      // server-side state to drift), so it is queue-safe — replay lands it
      // when the device reconnects.
      const queued = await queuePendingSync('supplier-order', payload)
      if (!queued.ok) {
        setOrderError('Commande non enregistrée. Réessayez.')
        setOrdering(false)
        return
      }
      queuedInstead = true
    }
    const total = quantity * orderProduct.price
    setOrderProduct(null)
    setOrdering(false)
    playBeep('success')
    haptic('success')
    tataSpeak(
      queuedInstead
        ? `Commande de ${orderProduct.name} enregistrée, en attente de synchronisation.`
        : `Commande de ${orderProduct.name} envoyée. Total ${formatFCFA(total)}.`
    )
    loadRecentOrders()
  }

  const labelClass = soleilMode ? 'text-black' : ''
  const mutedClass = soleilMode ? 'text-base' : ''

  return (
    <div className="screen-enter pb-24">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Marché Jùlaba</h1>
          </div>
          {online ? (
            <Badge variant="secondary" className="bg-green-100 text-green-700 border-0">
              <div className="w-2 h-2 rounded-full bg-green-500 mr-1" />
              En ligne
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-0">
              <WifiOff className="w-3 h-3 mr-1" />
              Hors ligne
            </Badge>
          )}
        </div>
        <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>
          Approvisionnez-vous auprès des meilleurs fournisseurs
        </p>
      </div>

      <div className="px-4 mt-4 space-y-2">
        {SUPPLIER_PRODUCTS.map(product => (
          <Card key={product.id}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#FDF3ED] to-[#F5E6D5] flex items-center justify-center shrink-0">
                <ProductIcon name={product.name} className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${soleilMode ? 'text-black text-base' : ''}`}>{product.name}</p>
                <p className={`text-xs text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>{product.supplier}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-[#C66A2C] fcfa">{formatFCFA(product.price)}</p>
                <Button size="sm" className="mt-1 min-h-11 text-[10px] bg-[#C66A2C] hover:bg-[#B55D25] text-white"
                  onClick={() => openOrderDialog(product)}
                >
                  Commander
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent orders — quick visibility on what was just ordered; the
          full history and cancellation live in the Commandes screen. */}
      <div className="px-4 mt-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className={`text-sm font-semibold text-muted-foreground ${soleilMode ? 'text-base text-black' : ''}`}>
            Mes dernières commandes
          </h2>
          <Button variant="ghost" size="sm" className="h-8 text-xs text-[#C66A2C]" onClick={() => navigate('commandes')}>
            Tout voir <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
        {ordersLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-muted rounded animate-pulse w-2/3" />
                    <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : recentOrders.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-4 text-center">
              <p className={`text-xs text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>
                Aucune commande pour le moment. Commandez un produit ci-dessus pour approvisionner votre stock.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentOrders.map(order => {
              const badge = ORDER_STATUS_BADGE[order.status] ?? { label: order.status, className: '' }
              return (
                <Card key={order.id}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#FDF3ED] flex items-center justify-center shrink-0">
                      <Truck className="w-4 h-4 text-[#C66A2C]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${soleilMode ? 'text-black text-base' : ''}`}>
                        {order.quantity} × {order.productName}
                      </p>
                      <p className={`text-xs text-muted-foreground ${mutedClass}`}>{order.supplier}</p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <Badge variant="secondary" className={`text-[10px] ${badge.className}`}>{badge.label}</Badge>
                      <p className="text-xs font-semibold fcfa text-muted-foreground">{formatFCFA(order.totalAmount)}</p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Order dialog */}
      <Dialog open={orderProduct !== null} onOpenChange={(open) => { if (!open) setOrderProduct(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className={soleilMode ? 'text-black' : ''}>
              Commander chez {orderProduct?.supplier}
            </DialogTitle>
            <DialogDescription className={soleilMode ? 'text-black' : ''}>
              {orderProduct?.name} — {orderProduct ? formatFCFA(orderProduct.price) : ''} l'unité
            </DialogDescription>
          </DialogHeader>

          {orderProduct && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="order-quantity" className={soleilMode ? 'text-black text-base' : ''}>Quantité</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    aria-label="Diminuer la quantité"
                    disabled={quantity <= 1}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    id="order-quantity"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={quantity}
                    onChange={(e) => {
                      const v = Number.parseInt(e.target.value, 10)
                      setQuantity(Number.isFinite(v) && v >= 1 ? Math.min(v, 999) : 1)
                    }}
                    className="min-h-11 text-center"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    aria-label="Augmenter la quantité"
                    onClick={() => setQuantity((q) => Math.min(999, q + 1))}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-[#FDF3ED] px-3 py-2.5">
                <span className={`text-sm ${soleilMode ? 'text-black text-base font-semibold' : 'text-muted-foreground'}`}>Total</span>
                <span className="text-base font-bold text-[#C66A2C] fcfa">
                  {formatFCFA(quantity * orderProduct.price)}
                </span>
              </div>

              {!online && (
                <p className="text-xs text-amber-600 flex items-start gap-1.5">
                  <WifiOff className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Hors ligne : la commande sera envoyée dès le retour de la connexion.
                </p>
              )}
              {orderError && <p className="text-xs text-red-600" role="alert">{orderError}</p>}

              <Button
                className="w-full min-h-11 bg-[#C66A2C] hover:bg-[#B55D25] text-white"
                onClick={handleOrder}
                disabled={ordering}
              >
                {ordering
                  ? 'Envoi...'
                  : `Commander ${formatFCFA(quantity * orderProduct.price)}`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// COMMANDES SCREEN - Supplier order tracking (real backend)
// ============================================================

export function CommandesScreen() {
  const { soleilMode, goBack, navigate, merchantId } = useAppStore()
  const [orders, setOrders] = useState<SupplierOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const loadOrders = useCallback(async () => {
    if (!merchantId) return
    setLoadError(false)
    try {
      const res = await fetch(`/api/marchand/supplier-orders?merchantId=${merchantId}`)
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setOrders(data.orders ?? [])
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [merchantId])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const handleCancel = async (order: SupplierOrder) => {
    if (cancellingId) return
    setCancellingId(order.id)
    try {
      const res = await fetch(`/api/marchand/supplier-orders?id=${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'annuler' }),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      setOrders((list) => list.map((o) => (o.id === order.id ? { ...o, status: 'annulee' } : o)))
      playBeep('success')
      haptic('success')
      tataSpeak('Commande annulée.')
    } catch {
      playBeep('error')
      haptic('error')
      tataSpeak("Impossible d'annuler cette commande. Réessayez.")
    } finally {
      setCancellingId(null)
    }
  }

  const labelClass = soleilMode ? 'text-black' : ''
  const mutedClass = soleilMode ? 'text-base' : ''

  return (
    <div className="screen-enter pb-24">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Mes commandes</h1>
        </div>
        <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>
          Suivi de vos commandes fournisseurs
        </p>
      </div>

      <div className="px-4 mt-4 space-y-2">
        {loading && (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-muted rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                </div>
                <div className="h-5 w-20 rounded-full bg-muted animate-pulse shrink-0" />
              </CardContent>
            </Card>
          ))
        )}

        {!loading && loadError && (
          <Card className="border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40">
            <CardContent className="p-6 text-center">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 text-red-400" />
              <p className={`text-sm font-medium text-red-700 dark:text-red-300 ${soleilMode ? 'text-base text-black' : ''}`}>
                Impossible de charger vos commandes
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={loadOrders}>
                Réessayer
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !loadError && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center px-4 pt-16">
            <div className="w-24 h-24 rounded-full bg-amber-50 flex items-center justify-center mb-6">
              <Package className="w-12 h-12 text-amber-400" />
            </div>
            <h2 className={`text-lg font-bold mb-2 ${soleilMode ? 'text-xl text-black' : ''}`}>Aucune commande</h2>
            <p className={`text-sm text-muted-foreground text-center mb-6 ${mutedClass}`}>
              Passez votre première commande depuis le Marché Jùlaba pour approvisionner votre étal.
            </p>
            <Button
              className="bg-[#C66A2C] hover:bg-[#B55D25] text-white min-h-11"
              onClick={() => navigate('marche')}
            >
              <ShoppingCart className="w-4 h-4 mr-1" /> Aller au Marché
            </Button>
          </div>
        )}

        {!loading && !loadError && orders.map(order => {
          const badge = ORDER_STATUS_BADGE[order.status] ?? { label: order.status, className: '' }
          const canCancel = order.status === 'en_attente'
          return (
            <Card key={order.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[#FDF3ED] flex items-center justify-center shrink-0">
                      <ProductIcon name={order.productName} className="w-5 h-5 text-[#C66A2C]" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${soleilMode ? 'text-black text-base' : ''}`}>
                        {order.quantity} × {order.productName}
                      </p>
                      <p className={`text-xs text-muted-foreground mt-0.5 ${mutedClass}`}>
                        {order.supplier} · {new Date(order.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className={`text-[10px] shrink-0 ${badge.className}`}>
                    {badge.label}
                  </Badge>
                </div>
                <Separator className="my-3" />
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-bold text-[#C66A2C] fcfa ${labelClass}`}>
                    {formatFCFA(order.totalAmount)} FCFA
                  </p>
                  {canCancel && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                      onClick={() => handleCancel(order)}
                      disabled={cancellingId === order.id}
                    >
                      {cancellingId === order.id ? 'Annulation...' : 'Annuler'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// TONTINES SCREEN - Tontine management with creation
// ============================================================

interface TontineData {
  id: string
  name: string
  amount: number
  frequency: string
  memberCount: number
  nextDueDate: string | null
  totalCotiseFcfa: number
}

const TONTINE_FREQUENCIES: { value: string; label: string }[] = [
  { value: 'hebdomadaire', label: 'Hebdo' },
  { value: 'mensuel', label: 'Mensuel' },
  { value: 'trimestriel', label: 'Trimestriel' },
  { value: 'annuel', label: 'Annuel' },
]

const TONTINE_QUICK_AMOUNTS = [2000, 5000, 10000, 25000]

export function TontinesScreen() {
  const { soleilMode, goBack, merchantId } = useAppStore()
  const [tontines, setTontines] = useState<TontineData[]>([])
  const [cotisingId, setCotisingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Creation form state — deliberately online-only (see handleCreate).
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState('mensuel')
  const [memberCount, setMemberCount] = useState(5)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const online = useNetworkStatus()

  const loadTontines = useCallback(async () => {
    if (!merchantId) return
    try {
      const res = await fetch(`/api/marchand/tontines?merchantId=${merchantId}`)
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setTontines(data.tontines ?? [])
    } catch {
      // Offline or server error — leave the list as-is (empty on first load).
    } finally {
      setLoading(false)
    }
  }, [merchantId])

  useEffect(() => {
    loadTontines()
  }, [loadTontines])

  const handleCotiser = async (tontine: TontineData) => {
    if (!merchantId) return
    setCotisingId(tontine.id)
    const payload = {
      merchantId,
      tontineId: tontine.id,
      amount: tontine.amount,
      clientId: `tontine-${tontine.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }
    let syncedNow = false
    try {
      const res = await fetch('/api/marchand/tontines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      syncedNow = true
    } catch {
      const queued = await queuePendingSync('tontine-contribution', payload)
      if (!queued.ok) {
        // Neither the live request nor the offline queue worked — don't
        // touch the displayed total, and tell the merchant to retry rather
        // than claiming a cotisation that was never recorded anywhere.
        tataSpeak('Cotisation non enregistrée. Réessayez.')
        haptic('error')
        setCotisingId(null)
        return
      }
    }
    setTontines((list) =>
      list.map((t) => (t.id === tontine.id ? { ...t, totalCotiseFcfa: t.totalCotiseFcfa + tontine.amount } : t))
    )
    tataSpeak(syncedNow
      ? `Cotisation de ${formatFCFA(tontine.amount)} FCFA enregistrée pour ${tontine.name}.`
      : `Cotisation de ${formatFCFA(tontine.amount)} FCFA enregistrée, en attente de synchronisation.`)
    haptic('success')
    setCotisingId(null)
  }

  const amountValue = Number.parseInt(amount, 10)
  const formValid =
    name.trim().length > 0 &&
    Number.isFinite(amountValue) &&
    amountValue > 0 &&
    memberCount >= 2

  const openCreate = () => {
    setName('')
    setAmount('')
    setFrequency('mensuel')
    setMemberCount(5)
    setCreateError(null)
    setCreateOpen(true)
  }

  const handleCreate = async () => {
    if (!merchantId || !formValid || creating) return
    setCreating(true)
    setCreateError(null)
    const payload = {
      merchantId,
      name: name.trim(),
      amount: amountValue,
      frequency,
      memberCount,
      clientId: `tontine-create-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }
    try {
      const res = await fetch('/api/marchand/tontines/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setCreateError(data?.erreur ?? 'Création refusée. Réessayez.')
        setCreating(false)
        return
      }
      setCreateOpen(false)
      setCreating(false)
      playBeep('success')
      haptic('success')
      tataSpeak(`Tontine ${payload.name} créée. Vous êtes le premier membre.`)
      loadTontines()
    } catch {
      // Deliberately NOT queueable offline: later cotisations reference the
      // tontine id the server generates, so a locally-invented id would
      // dangle until the next online session — and the merchant would see
      // a "Cotiser" button that can never work on that record.
      setCreateError('Connexion requise pour créer une tontine.')
      setCreating(false)
    }
  }

  const labelClass = soleilMode ? 'text-black' : ''
  const mutedClass = soleilMode ? 'text-base' : ''

  return (
    <div className="screen-enter pb-24">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Tontines</h1>
          </div>
          <Button
            size="sm"
            className="h-9 text-xs bg-[#C66A2C] hover:bg-[#B55D25] text-white"
            onClick={openCreate}
            disabled={!online}
          >
            <Plus className="w-4 h-4 mr-1" /> Créer
          </Button>
        </div>
        <p className={`text-xs text-muted-foreground mt-1 ${mutedClass}`}>Gérez vos tontines et cotisations</p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {loading && (
          Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
                <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
                <div className="h-10 bg-muted rounded animate-pulse w-full" />
              </CardContent>
            </Card>
          ))
        )}

        {!loading && tontines.map(tontine => (
          <Card key={tontine.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className={`text-sm font-semibold ${soleilMode ? 'text-black text-base' : ''}`}>{tontine.name}</p>
                  <Badge variant="secondary" className="text-[10px] mt-1">
                    Cotisé : {formatFCFA(tontine.totalCotiseFcfa)}
                  </Badge>
                </div>
                <p className="text-lg font-bold text-[#C66A2C] fcfa">{formatFCFA(tontine.amount)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="flex items-center gap-2">
                  <Users className={`w-4 h-4 text-muted-foreground ${soleilMode ? 'text-black' : ''}`} />
                  <span className={`text-sm ${mutedClass}`}>{tontine.memberCount} membres</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className={`w-4 h-4 text-muted-foreground ${soleilMode ? 'text-black' : ''}`} />
                  <span className={`text-sm ${mutedClass}`}>
                    {tontine.nextDueDate ? `Prochain: ${new Date(tontine.nextDueDate).toLocaleDateString('fr-FR')}` : 'Pas de date fixée'}
                  </span>
                </div>
              </div>
              <Button
                className="w-full mt-3 bg-[#C66A2C] hover:bg-[#B55D25] text-white"
                onClick={() => handleCotiser(tontine)}
                disabled={cotisingId === tontine.id}
              >
                {cotisingId === tontine.id ? 'Enregistrement...' : `Cotiser ${formatFCFA(tontine.amount)}`}
              </Button>
            </CardContent>
          </Card>
        ))}

        {!loading && tontines.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className={mutedClass}>Créez ou rejoignez une tontine pour commencer</p>
            <Button variant="outline" className="mt-3" onClick={openCreate} disabled={!online}>
              <Plus className="w-4 h-4 mr-1" /> Créer une tontine
            </Button>
          </div>
        )}
      </div>

      {/* Create tontine dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className={soleilMode ? 'text-black' : ''}>Créer une tontine</DialogTitle>
            <DialogDescription className={soleilMode ? 'text-black' : ''}>
              Vous serez le premier membre. Les autres membres rejoindront via un agent Jùlaba.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tontine-name" className={soleilMode ? 'text-black text-base' : ''}>Nom de la tontine</Label>
              <Input
                id="tontine-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Tontine Adjamé Prospère"
                className="min-h-11"
                maxLength={80}
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tontine-amount" className={soleilMode ? 'text-black text-base' : ''}>Cotisation par tour (FCFA)</Label>
              <Input
                id="tontine-amount"
                type="number"
                inputMode="numeric"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="min-h-11 fcfa"
              />
              <div className="grid grid-cols-4 gap-1.5">
                {TONTINE_QUICK_AMOUNTS.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant="outline"
                    className="min-h-11 text-xs"
                    onClick={() => setAmount(String(value))}
                  >
                    {value / 1000}k
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className={soleilMode ? 'text-black text-base' : ''}>Fréquence</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {TONTINE_FREQUENCIES.map((f) => (
                  <Button
                    key={f.value}
                    type="button"
                    variant={frequency === f.value ? 'default' : 'outline'}
                    size="sm"
                    className={`min-h-11 text-xs ${frequency === f.value ? 'bg-[#C66A2C] hover:bg-[#B55D25] text-white' : ''}`}
                    onClick={() => setFrequency(f.value)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tontine-members" className={soleilMode ? 'text-black text-base' : ''}>Nombre de membres prévu</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  aria-label="Diminuer le nombre de membres"
                  disabled={memberCount <= 2}
                  onClick={() => setMemberCount((m) => Math.max(2, m - 1))}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <Input
                  id="tontine-members"
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={100}
                  value={memberCount}
                  onChange={(e) => {
                    const v = Number.parseInt(e.target.value, 10)
                    setMemberCount(Number.isFinite(v) && v >= 2 ? Math.min(v, 100) : 2)
                  }}
                  className="min-h-11 text-center"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  aria-label="Augmenter le nombre de membres"
                  disabled={memberCount >= 100}
                  onClick={() => setMemberCount((m) => Math.min(100, m + 1))}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {!online && (
              <p className="text-xs text-amber-600 flex items-start gap-1.5">
                <WifiOff className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                La création d'une tontine nécessite une connexion internet.
              </p>
            )}
            {createError && <p className="text-xs text-red-600" role="alert">{createError}</p>}

            <Button
              className="w-full min-h-11 bg-[#C66A2C] hover:bg-[#B55D25] text-white"
              onClick={handleCreate}
              disabled={!formValid || !online || creating}
            >
              {creating ? 'Création...' : 'Créer la tontine'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}



// ============================================================
// PROFIL SCREEN - Re-exported from dedicated module
// ============================================================

export { ProfilScreen } from './profile-screen'

// Keiwa wallet lives in its own module now that it is a real screen —
// re-exported so page.tsx keeps a single import surface.
export { KeiwaScreen } from './keiwa-screen'

// ============================================================
// ACADEMY SCREEN - Training courses
// ============================================================

interface AcademyCourse {
  id: string
  title: string
  excerpt: string
  duration: string
  difficulty: string
  category: string
  viewCount: number
}

export function AcademyScreen() {
  const { soleilMode, goBack, merchantId, openAcademyCourse } = useAppStore()
  const [courses, setCourses] = useState<AcademyCourse[]>([])
  const [loading, setLoading] = useState(true)
  const online = useNetworkStatus()

  const loadCourses = useCallback(async () => {
    if (!merchantId) return
    try {
      // /api/marchand/contenus is the marchand-accessible read of PUBLISHED
      // contents only. The old /api/backoffice/contenus call failed 401 for
      // every marchand (it requires a backoffice permission), which is why
      // this list always came back empty.
      const res = await fetch(`/api/marchand/contenus?type=tutoriels&merchantId=${merchantId}`)
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setCourses(Array.isArray(data) ? data : [])
    } catch {
      setCourses([])
    } finally {
      setLoading(false)
    }
  }, [merchantId])

  useEffect(() => {
    loadCourses()
  }, [loadCourses])

  const handleStart = (course: AcademyCourse) => {
    haptic('light')
    openAcademyCourse(course.id)
  }

  const difficultyLabel: Record<string, string> = { debutant: 'Débutant', intermediaire: 'Intermédiaire', avance: 'Avancé' }

  return (
    <div className="screen-enter pb-24">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Académie Jùlaba</h1>
          </div>
          {!online && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-0">
              <WifiOff className="w-3 h-3 mr-1" />
              Hors ligne
            </Badge>
          )}
        </div>
        <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>
          Formations pour améliorer votre commerce
        </p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {loading && (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-lg bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-muted rounded animate-pulse w-full" />
                    <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
        {!loading && courses.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Aucun tutoriel disponible</p>
            <p className="text-xs mt-1">Revenez bientôt pour découvrir nos formations</p>
          </div>
        )}
        {courses.map(course => (
          <Card key={course.id} className="cursor-pointer active:scale-[0.99] transition-transform" onClick={() => handleStart(course)}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-lg bg-[#C66A2C]/10 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-6 h-6 text-[#C66A2C]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${soleilMode ? 'text-black text-base' : ''}`}>{course.title}</p>
                  {course.excerpt && (
                    <p className={`text-xs text-muted-foreground mt-0.5 line-clamp-2 ${soleilMode ? 'text-base' : ''}`}>{course.excerpt}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="w-3 h-3" />{course.duration}
                    </span>
                    {course.difficulty && (
                      <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted">
                        {difficultyLabel[course.difficulty] ?? course.difficulty}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Eye className="w-3 h-3" />{course.viewCount}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// FIDELITÉ SCREEN - Loyalty program
// ============================================================

const MOCK_REWARDS = [
  { id: 'r1', name: 'Réduction 5%', points: 500, icon: Gift, description: 'Sur votre prochain achat' },
  { id: 'r2', name: 'Sac Jùlaba', points: 1000, icon: ShoppingBag, description: 'Sac réutilisable imprimé' },
  { id: 'r3', name: 'Formation gratuite', points: 2000, icon: GraduationCap, description: '1 cours au choix' },
  { id: 'r4', name: 'Badge Marchand Pro', points: 5000, icon: Trophy, description: 'Badge et avantages exclusifs' },
]

export function FideliteScreen() {
  const { soleilMode, goBack, merchantPhone } = useAppStore()
  // Load real points from the persisted profile, not a hardcoded value.
  const currentPoints = (() => {
    if (!merchantPhone) return 0
    try {
      const normalized = merchantPhone.replace(/[^\d]/g, '')
      const raw = localStorage.getItem(`julaba-profile-${normalized}`)
      if (raw) {
        const profile = JSON.parse(raw)
        if (typeof profile.score === 'number') return profile.score
      }
    } catch {}
    return 0
  })()

  return (
    <div className="screen-enter pb-24">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Fidélité</h1>
        </div>
      </div>

      {/* Points card */}
      <div className="px-4 mt-4">
        <Card className="bg-gradient-to-br from-[#C66A2C] to-[#A85520] text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">Vos points</p>
                <p className={`font-bold fcfa ${soleilMode ? 'text-4xl' : 'text-3xl'}`}>{currentPoints}</p>
                <p className="text-xs opacity-75 mt-1">10 FCFA = 1 point</p>
              </div>
              <Heart className="w-16 h-16 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rewards */}
      <div className="px-4 mt-4">
        <h3 className={`text-sm font-semibold text-muted-foreground mb-3 ${soleilMode ? 'text-base text-black' : ''}`}>
          Récompenses disponibles
        </h3>
        <div className="space-y-2">
          {MOCK_REWARDS.map(reward => {
            const Icon = reward.icon
            const canRedeem = currentPoints >= reward.points
            const progress = Math.min((currentPoints / reward.points) * 100, 100)
            return (
              <Card key={reward.id} className={canRedeem ? 'border-[#C66A2C]/30' : ''}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${canRedeem ? 'bg-[#C66A2C]/10' : 'bg-muted'}`}>
                    <Icon className={`w-5 h-5 ${canRedeem ? 'text-[#C66A2C]' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${soleilMode ? 'text-black text-base' : ''}`}>{reward.name}</p>
                    <p className={`text-xs text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>{reward.description}</p>
                    <div className={`h-1.5 bg-muted rounded-full overflow-hidden mt-1.5 ${soleilMode ? 'h-2.5' : ''}`}>
                      <div
                        className={`h-full rounded-full ${canRedeem ? 'bg-green-500' : 'bg-[#C66A2C]'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${canRedeem ? 'text-green-600' : 'text-muted-foreground'} ${soleilMode ? 'text-base' : ''}`}>
                      {reward.points} pts
                    </p>
                    {canRedeem && (
                      <Button size="sm" disabled className="mt-1 h-6 text-[10px] bg-green-600 hover:bg-green-700 text-white opacity-70">
                        Bientôt
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// PROTECTION SOCIALE SCREEN - CNPS/CMU info
// ============================================================

export function ProtectionSocialeScreen() {
  const { soleilMode, goBack } = useAppStore()

  return (
    <div className="screen-enter pb-24">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Protection sociale</h1>
        </div>
        <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>
          CNPS, CMU et assurances
        </p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {/* CNPS Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className={`text-sm font-bold ${soleilMode ? 'text-black text-base' : ''}`}>CNPS - Caisse Nationale de Prévoyance Sociale</h3>
                <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>
                  La CNPS vous protège en cas de maladie, de maternité, d'accident du travail et pour la retraite.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge variant="secondary" className="text-[10px]">Maladie</Badge>
                  <Badge variant="secondary" className="text-[10px]">Maternité</Badge>
                  <Badge variant="secondary" className="text-[10px]">Retraite</Badge>
                  <Badge variant="secondary" className="text-[10px]">Accidents</Badge>
                </div>
                <Button variant="outline" size="sm" className="mt-3 text-xs" disabled>
                  En savoir plus
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CMU Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                <Shield className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className={`text-sm font-bold ${soleilMode ? 'text-black text-base' : ''}`}>CMU - Couverture Maladie Universelle</h3>
                <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>
                  La CMU permet l'accès aux soins de santé pour tous. Renseignez-vous dans votre centre de santé le plus proche.
                </p>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    <span className={`text-xs ${soleilMode ? 'text-base' : ''}`}>Gratuit pour les indigents</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    <span className={`text-xs ${soleilMode ? 'text-base' : ''}`}>Famille couverte</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="mt-3 text-xs" disabled>
                  Vérifier mon éligibilité
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info card */}
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800/70 dark:bg-amber-950/40">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-300 mt-0.5 shrink-0" />
              <div>
                <p className={`text-sm font-medium text-amber-800 dark:text-amber-200 ${soleilMode ? 'text-base text-black' : ''}`}>Information</p>
                <p className={`text-xs text-amber-700 dark:text-amber-300 mt-1 ${soleilMode ? 'text-base' : ''}`}>
                  Ces services nécessitent une connexion internet pour vérifier votre immatriculation et statut.
                  Rendez-vous à la CNPS ou à votre centre de santé pour plus d'informations.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
