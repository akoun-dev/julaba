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

/** Refus de vente pour stock insuffisant (STK-805, §3/§36) — le payload
 * exact attendu par Tata (« Tu as seulement X … en stock. »). */
export interface SaleStockRefusal {
  code: 'INSUFFICIENT_STOCK'
  product?: string
  available: number
  requested: number
  /** Unité de base si connue (kg…) — jamais inventée. */
  unit?: string
}

export interface QuickSaleResult {
  ok: boolean
  synced: boolean
  /** Hérité du contrat VOCAL-605, désormais toujours false : une vente
   * acceptée n'a PLUS jamais de stock insuffisant (STK-805 = refus strict,
   * plus d'écrêtage silencieux à 0). Conservé pour la compat des appelants
   * (formatSaleConfirmation). */
  stockShort?: boolean
  /** Présent quand ok=false pour cause de stock insuffisant : la vente
   * EST refusée, en local comme au serveur — l'appelant doit le DIRE
   * (formatStockRefusal) et proposer la correction. */
  refusal?: SaleStockRefusal
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
 *
 * `stockShort` signale que le stock local est inférieur à la quantité
 * demandée : depuis STK-805 ce signal EST un refus — completeQuickSale
 * bloque la vente, l'appelant annonce le refus et la correction possible.
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

/** Les statuts après lesquels rejouer la demande peut encore réussir —
 * hors-ligne, en surcharge (429) ou plantage serveur (5xx). Tout autre
 * 4xx est un refus DÉFINITIF : mettre en file ne ferait que créer un
 * conflit de synchro inévitable (même règle que offline-db §replay). */
function isTransientFailure(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

/** Lit un refus INSUFFICIENT_STOCK dans la réponse 422 de la route ventes
 * (payload {code, available, requested, unit, product}, §36). */
async function readServerRefusal(res: Response): Promise<SaleStockRefusal | null> {
  if (res.status !== 422) return null
  try {
    const body = (await res.json()) as { code?: string; available?: number; requested?: number; unit?: string; product?: string }
    if (body.code !== 'INSUFFICIENT_STOCK') return null
    return {
      code: 'INSUFFICIENT_STOCK',
      available: body.available ?? 0,
      requested: body.requested ?? 0,
      unit: body.unit,
      product: body.product,
    }
  } catch {
    return null
  }
}

/**
 * Enregistre une vente immédiate (vente rapide / voix) sans passer par le
 * flux caisse complet. Persiste côté serveur (timeout 10 s — audit
 * VOCAL-604), met à jour les stats du jour. Hors-ligne, file en attente
 * de synchronisation.
 *
 * Contrat STK-805 — « IMPOSSIBLE DE VENDRE SANS STOCK » (§3) :
 * 1. pré-vérification LOCALE (UX) : stock local < quantité → REFUS immédiat,
 *    rien n'est envoyé ni décrémenté ;
 * 2. le serveur reste l'AUTORITÉ : un refus INSUFFICIENT_STOCK (422, stock
 *    local périmé) est rendu tel quel — jamais mis en file (rejouable ne
 *    réussira jamais), jamais décrémenté ;
 * 3. le stock local n'est décrémenté (delta, projection sans PATCH) qu'
 *    APRÈS un verdict favorable (succès réseau OU file locale confirmée) ;
 *    la vérité serveur est réalignée au prochain fetchProducts.
 */
/** Options de complétion d'une vente rapide — MODE-906 : mode de paiement
 * (défaut 'especes', comportement historique inchangé). MODE-908 : étiquette
 * du point de vente actif (client_id d'idempotence + nom en snapshot),
 * passée par arguments par les écrans — sens unique : ce module n'importe
 * jamais le store des points de vente. */
export interface QuickSaleOptions {
  paymentMethod?: 'especes' | 'mobile_money' | 'credit' | 'autre'
  sellingPointClientId?: string
  sellingPointName?: string
}

export async function completeQuickSale(item: QuickSaleItem, options?: QuickSaleOptions): Promise<QuickSaleResult> {
  const merchantId = useAppStore.getState().merchantId
  if (!merchantId) return { ok: false, synced: false }

  const subtotal = item.total ?? item.quantity * item.unitPrice
  // MODE-906 — 'especes' est le défaut : le payload reste strictement
  // identique au comportement historique tant qu'aucun autre mode n'est passé.
  const paymentMethod = options?.paymentMethod ?? 'especes'
  // MODE-908 — étiquette du point de vente : elle ne voyage que si le point
  // actif est fourni par l'appelant (payload historique identique sinon).
  const sellingPoint = options?.sellingPointClientId && options.sellingPointName
    ? { clientId: options.sellingPointClientId, name: options.sellingPointName }
    : null

  // 1. Pré-vérification locale (UX — le serveur reste l'autorité).
  const localProduct = item.productId
    ? useStockStore.getState().products.find((p) => p.id === item.productId)
    : undefined
  if (localProduct && localProduct.stockQty < item.quantity) {
    return {
      ok: false,
      synced: false,
      refusal: {
        code: 'INSUFFICIENT_STOCK',
        product: localProduct.name,
        available: localProduct.stockQty,
        requested: item.quantity,
      },
    }
  }

  const clientId = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const salePayload: Record<string, unknown> = {
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
  // MODE-906 — le mode de paiement ne voyage que s'il diffère des espèces
  // (colonne legacy_sales.payment_method avec défaut : compatible avant/
  // après migration, jamais de champ superflu pour les ventes historiques).
  if (paymentMethod !== 'especes') {
    salePayload.paymentMethod = paymentMethod
  }
  // MODE-908 — l'étiquette du point ne voyage que si fournie (champs
  // optionnels côté schéma : compat avant/après migration).
  if (sellingPoint) {
    salePayload.sellingPointClientId = sellingPoint.clientId
    salePayload.sellingPointName = sellingPoint.name
  }
  // MODE-939 (AUDIT-003 F-10) — la session de caisse ouverte, s'il y en a
  // une, voyage avec la vente (bilan de clôture réconciliable serveur).
  const sessionCaisse = useCaisseStore.getState().session
  if (sessionCaisse?.id) salePayload.sessionId = sessionCaisse.id

  let synced = false
  try {
    const res = await fetchJsonWithTimeout('/api/marchand/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(salePayload),
    })
    if (res.ok) {
      synced = true
    } else {
      // 2. Refus serveur : définitif — jamais en file, jamais écrêté.
      const refusal = await readServerRefusal(res)
      if (refusal) return { ok: false, synced: false, refusal }
      if (!isTransientFailure(res.status)) return { ok: false, synced: false }
      throw new Error(`Erreur ${res.status}`)
    }
  } catch {
    const queued = await queuePendingSync('sale', salePayload)
    if (!queued.ok) return { ok: false, synced: false }
  }

  // 3. Stock : projection locale en delta APRÈS verdict favorable. Le
  // serveur (RPC merchant_record_sale) a déjà décrémenté la vérité —
  // plus JAMAIS de PATCH absolu calculé côté client.
  if (localProduct) {
    useStockStore.getState().adjustLocalStock(localProduct.id, -item.quantity)
  }

  // MODE-908 — le journal local porte le snapshot du point (stats offline).
  // Sans point fourni, l'appel reste STRICTEMENT à un argument (contrat
  // historique de addTodaySale, tel quel pour tous les appelants existants).
  if (sellingPoint) {
    useCaisseStore.getState().addTodaySale(subtotal, { clientId: sellingPoint.clientId, name: sellingPoint.name })
  } else {
    useCaisseStore.getState().addTodaySale(subtotal)
  }
  useCaisseStore.getState().incrementTodaySalesCount()
  // MODE-909 (§28) — le journal des ventes du jour (annulation possible) :
  // journalisé APRÈS le verdict favorable, comme addTodaySale.
  useCaisseStore.getState().journalTodaySale({
    saleClientId: clientId,
    amountCfa: subtotal,
    items: [{
      productName: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      ...(item.productId ? { productId: item.productId } : {}),
    }],
    ...(sellingPoint ? { point: sellingPoint } : {}),
  })

  return { ok: true, synced, stockShort: false }
}
