'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ArrowLeft, WifiOff, Truck, Minus, Plus, ArrowRight } from 'lucide-react'
import { ProductIcon } from '@/lib/product-icons'
import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import { formatFCFA } from '@/lib/utils'
import { tataSpeak, haptic, playBeep } from '@/lib/voice/tata-tts'
import { queuePendingSync } from '@/lib/offline-db'
import { useNetworkStatus } from '@/lib/hooks/use-network-status'
import { clampOrderQuantity } from '@/lib/marchand/secondary-logic'
import { ORDER_STATUS_BADGE, SupplierOrder } from './secondary-parts'

// ============================================================
// MARCHÉ SCREEN - Virtual marketplace with real supplier ordering
// ============================================================

// Catalogue partagé avec le pipeline de commande vocale (src/lib/supplier-catalog.ts) :
// ce que Tata peut commander à la voix = exactement les cartes affichées ici.
import { SUPPLIER_PRODUCTS } from '@/lib/supplier-catalog'

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
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
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
                      setQuantity(clampOrderQuantity(e.target.value))
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
