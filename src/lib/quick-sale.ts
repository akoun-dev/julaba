import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { useStockStore } from '@/lib/stores/stock-store'
import { queuePendingSync } from '@/lib/offline-db'

export interface QuickSaleItem {
  name: string
  quantity: number
  unitPrice: number
  productId?: string
}

export interface QuickSaleResult {
  ok: boolean
  synced: boolean
}

/**
 * Enregistre une vente immédiate (vente rapide / voix) sans passer par le
 * flux caisse complet. Persiste côté serveur, met à jour le stock et les
 * stats du jour. Hors-là, file en attente de synchronisation.
 */
export async function completeQuickSale(item: QuickSaleItem): Promise<QuickSaleResult> {
  const merchantId = useAppStore.getState().merchantId
  if (!merchantId) return { ok: false, synced: false }

  const subtotal = item.quantity * item.unitPrice

  // Update stock if product is tracked
  if (item.productId) {
    const product = useStockStore.getState().products.find(p => p.id === item.productId)
    if (product) {
      useStockStore.getState().updateProduct(product.id, {
        stockQty: Math.max(0, product.stockQty - item.quantity),
      })
    }
  }

  const clientId = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const salePayload = {
    merchantId,
    clientId,
    items: [{
      productName: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      productId: item.productId,
    }],
    totalAmount: subtotal,
    amountReceived: subtotal,
  }

  let synced = false
  try {
    const res = await fetch('/api/marchand/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(salePayload),
    })
    if (!res.ok) throw new Error(`Erreur ${res.status}`)
    synced = true
  } catch {
    const queued = await queuePendingSync('sale', salePayload)
    if (!queued.ok) return { ok: false, synced: false }
  }

  useCaisseStore.getState().addTodaySale(subtotal)
  useCaisseStore.getState().incrementTodaySalesCount()

  return { ok: true, synced }
}
