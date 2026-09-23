'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, ShoppingCart, Package, AlertCircle } from 'lucide-react'
import { ProductIcon } from '@/lib/product-icons'
import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import { formatFCFA } from '@/lib/utils'
import { tataSpeak, haptic, playBeep } from '@/lib/voice/tata-tts'
import { ORDER_STATUS_BADGE, SupplierOrder } from './secondary-parts'

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
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
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
                    {formatFCFA(order.totalAmount)}
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
