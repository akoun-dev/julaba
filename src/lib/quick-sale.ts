import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { useStockStore } from '@/lib/stores/stock-store'
import { queuePendingSync } from '@/lib/offline-db'
import { fetchJsonWithTimeout } from '@/lib/http'
import type { ParsedIntent } from '@/lib/voice/localIntent'
import type { Product } from '@/lib/stores/stock-store'

export interface QuickSaleItem {
  name: string
  quantity: number
  unitPrice: number
  /** Montant total DICTÉ par le marchand (audit VOCAL-603) — fait foi sur
   * quantity × unitPrice quand l'arrondi entrier diverge (3 × 667 = 2001
   * pour « trois sacs 2000 »). Absent : total = quantity × unitPrice. */
  total?: number
  productId?: string
}

export interface QuickSaleResult {
  ok: boolean
  synced: boolean
  /** Vrai quand le stock restant était inférieur à la quantité vendue :
   * la vente est enregistrée (l'argent est réel) mais le stock a été
   * écrêté à zéro — l'appelant doit le SIGNALER (audit VOCAL-605,
   * plus de survente silencieuse). */
  stockShort?: boolean
}

/**
 * Plan de vente calculé depuis une intention vocale — LE montant dicté
 * fait loi (audit VOCAL-603).
 *
 * Avant : `unitPrice = product?.priceUnit || floor(amount/qty)` — dès que
 * le produit existait au stock avec un prix unitaire, le montant DICTÉ
 * était écrasé (« tomates 2000 » avec tomates à 500 → vente de 500 FCFA).
 * Désormais : le total = montant dicté, le prix unitaire en DÉCOUT
 * (total/quantité, arrondi FCFA) et le prix catalogue ne sert plus qu'à
 * SIGNALER un écart éventuel — jamais à remplacer la parole du marchand.
 */
export interface QuickSalePlan {
  name: string
  quantity: number
  unitPrice: number
  total: number
  productId?: string
  stockShort: boolean
  /** Prix catalogue du produit trouvé — pour signaler l'écart, pas pour
   * décider (le champ peut rester inutilisé par l'appelant). */
  catalogUnitPrice?: number
}

export function planQuickSale(
  intent: Pick<ParsedIntent, 'product' | 'amount' | 'quantity'>,
  product?: Product | null,
): QuickSalePlan | null {
  if (!intent.amount || intent.amount <= 0) return null
  const quantity = Math.max(1, Math.floor(intent.quantity || 1))
  const total = Math.floor(intent.amount)
  const unitPrice = Math.round(total / quantity)
  return {
    name: intent.product || 'Article',
    quantity,
    unitPrice,
    total,
    productId: product?.id,
    stockShort: product ? product.stockQty < quantity : false,
    catalogUnitPrice: product?.priceUnit,
  }
}

/**
 * Enregistre une vente immédiate (vente rapide / voix) sans passer par le
 * flux caisse complet. Persiste côté serveur (timeout 10 s — audit
 * VOCAL-604, plus de « processing » figé), met à jour le stock et les
 * stats du jour. Hors-là, file en attente de synchronisation.
 * Le stock n'est décrémenté qu'APRÈS un verdict (succès réseau OU file
 * locale confirmée) — plus de stock sorti pour une vente refusée.
 */
export async function completeQuickSale(item: QuickSaleItem): Promise<QuickSaleResult> {
  const merchantId = useAppStore.getState().merchantId
  if (!merchantId) return { ok: false, synced: false }

  const subtotal = item.total ?? item.quantity * item.unitPrice

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
    const res = await fetchJsonWithTimeout('/api/marchand/sales', {
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

  let stockShort = false
  if (item.productId) {
    const product = useStockStore.getState().products.find(p => p.id === item.productId)
    if (product) {
      stockShort = product.stockQty < item.quantity
      useStockStore.getState().updateProduct(product.id, {
        stockQty: Math.max(0, product.stockQty - item.quantity),
      })
    }
  }

  useCaisseStore.getState().addTodaySale(subtotal)
  useCaisseStore.getState().incrementTodaySalesCount()

  return { ok: true, synced, stockShort }
}
