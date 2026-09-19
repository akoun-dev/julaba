/**
 * Pont voix → stock (STK-807). Module PUR : aucun store, aucun réseau.
 *
 * La marchande parle en unités commerciales (« 2 sacs », « 5 kilos ») ; le
 * stock serveur vit en unité de base. La conversion est celle configurée
 * par produit (merchant_product_units via stock-store) — ce module ne
 * devine JAMAIS une conversion : unité non configurée = refus honnête
 * (INVALID_UNIT), Tata demande de la configurer au lieu d'inventer.
 */

import type { ProductUnitConfig } from '@/lib/stock/units'
import { findUnit, getBaseUnit } from '@/lib/stock/units'

export type SpokenQuantityResolution =
  | { ok: true; quantityBase: number; unitCode: string }
  | { ok: false; reason: 'INVALID_UNIT'; unitCode: string }
  | { ok: false; reason: 'INVALID_QUANTITY'; quantity: number }

/**
 * Résout une quantité parlée vers la base.
 *
 *  • unit null (« 5 tomates ») → la quantité parlée EST en base
 *    (pièces/unités nues) : quantityBase = quantity.
 *  • unit == unité de base (« 5 kilos », base kg) → quantityBase = quantity.
 *  • unit configurée (« 2 sacs », sac = 25 kg) → quantityBase = 2 × 25.
 *  • unit non configurée pour ce produit → INVALID_UNIT (honnête :
 *    on ne connaît pas la taille « d'un sac » de ce produit chez ce
 *    marchand — c'est exactement ce que la config §8 doit dire).
 *  • quantity ≤ 0 / non finie → INVALID_QUANTITY.
 */
export function resolveSpokenQuantity(
  quantity: number | undefined,
  unit: string | null | undefined,
  config: ProductUnitConfig | null | undefined,
): SpokenQuantityResolution {
  if (quantity === undefined || !isFinite(quantity) || quantity <= 0) {
    return { ok: false, reason: 'INVALID_QUANTITY', quantity: quantity ?? 0 }
  }
  if (!unit) {
    const base = getBaseUnit(config)
    return { ok: true, quantityBase: quantity, unitCode: base?.unitCode ?? '' }
  }
  const base = getBaseUnit(config)
  if (base && unit === base.unitCode) {
    return { ok: true, quantityBase: quantity, unitCode: unit }
  }
  const unitDef = findUnit(config, unit)
  if (!unitDef) {
    return { ok: false, reason: 'INVALID_UNIT', unitCode: unit }
  }
  return { ok: true, quantityBase: quantity * unitDef.conversionToBase, unitCode: unit }
}

/**
 * ClientId d'opération stock généré localement (STK-807/808, §31-32) :
 * stable sur toute la vie de l'opération — un rejeu offline réenvoie le
 * MÊME id, le serveur le rend idempotent (UNIQUE merchant_id/operation_id
 * via operationUuid côté routes). Format lisible en base :
 * « vocal-perte-1737-… ».
 */
export function stockOperationClientId(kind: 'vente' | 'perte' | 'ajustement' | 'comptage' | 'achat' | 'mouvement'): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${kind}-${Date.now()}-${rand}`
}
