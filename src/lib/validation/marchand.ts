import { z } from 'zod'

// FCFA amounts are always non-negative integers project-wide (see
// formatFCFA()) — reject decimals and negative values at the API boundary
// rather than trusting the client, per the audit's P2-7 finding.
const fcfaAmount = z.number().int().min(0)

export const saleItemSchema = z.object({
  productName: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: fcfaAmount,
  productId: z.string().min(1).optional(),
})

// totalAmount is intentionally not accepted from the client — the route
// recomputes it server-side from `items` so a tampered or stale client
// total can never be trusted directly.
export const createSaleSchema = z.object({
  merchantId: z.string().min(1),
  items: z.array(saleItemSchema).min(1),
  amountReceived: fcfaAmount.optional(),
  isVoiceSale: z.boolean().optional(),
  voiceTranscript: z.string().optional(),
  note: z.string().optional(),
  clientId: z.string().min(1).optional(),
})

export const createExpenseSchema = z.object({
  merchantId: z.string().min(1),
  amount: z.number().int().positive(),
  category: z.string().min(1),
  description: z.string().optional(),
  isVoice: z.boolean().optional(),
  voiceTranscript: z.string().optional(),
  clientId: z.string().min(1).optional(),
})

export const createProductSchema = z.object({
  merchantId: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1).optional(),
  priceUnit: fcfaAmount.optional(),
  stockQty: z.number().int().min(0).optional(),
  imageUrl: z.string().optional(),
  isActive: z.boolean().optional(),
  clientId: z.string().min(1).optional(),
})

// .strict(): a field not listed here (merchantId, clientId, id...) fails
// validation — this prevents a PATCH body from reassigning a product
// to a different merchantId.
export const updateProductSchema = z
  .object({
    name: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    priceUnit: fcfaAmount.optional(),
    stockQty: z.number().int().min(0).optional(),
    imageUrl: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()

// Tontine creation from the marchand device — mirrors the frequencies the
// `tontines` modern table constrains (hebdomadaire/mensuel/trimestriel/
// annuel) so both generations of tables agree on vocabulary.
export const createTontineSchema = z.object({
  merchantId: z.string().min(1),
  name: z.string().min(1).max(80),
  amount: z.number().int().positive(),
  frequency: z.enum(['hebdomadaire', 'mensuel', 'trimestriel', 'annuel']),
  memberCount: z.number().int().min(2).max(100),
  nextDueDate: z.string().optional(),
  clientId: z.string().min(1).optional(),
})

// Keiwa wallet operations. recipient fields are only required for
// 'transfert' — enforced in the route after parsing (cross-field rule).
export const keiwaOperationSchema = z.object({
  merchantId: z.string().min(1),
  type: z.enum(['depot', 'retrait', 'transfert']),
  amount: z.number().int().positive(),
  recipientName: z.string().min(1).optional(),
  recipientPhone: z.string().min(1).optional(),
  note: z.string().max(200).optional(),
  clientId: z.string().min(1).optional(),
})

export const createSupplierOrderSchema = z.object({
  merchantId: z.string().min(1),
  supplier: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: fcfaAmount,
  note: z.string().max(300).optional(),
  clientId: z.string().min(1).optional(),
})

// ── Stock (STK-804) — la garantie « jamais de stock négatif » vit côté
// PostgreSQL (RPC merchant_record_*) : ces schémas ne font que filtrer la
// surface d'attaque. Les quantités acceptent jusqu'à 3 décimales
// (numeric(14,3) en base, unité de base kg) ; les montants restent des
// FCFA entiers.

/** Quantité de stock : strictement positive, 3 décimales max. */
const stockQuantity = z.number().positive().max(9_999_999_999)

/** Types de mouvement acceptés par la RPC merchant_record_movement —
 * SALE passe par la route ventes, PURCHASE par la route achats,
 * TRANSFER_* / OPENING_BALANCE ont leur circuit dédié. */
export const stockMovementTypeSchema = z.enum([
  // Entrées
  'RECEIPT', 'PRODUCTION', 'CUSTOMER_RETURN', 'ADJUSTMENT_IN',
  // Sorties (reason obligatoire côté RPC — vérifiée ici pour un refus 400 propre)
  'LOSS', 'DAMAGE', 'DONATION', 'SUPPLIER_RETURN', 'ADJUSTMENT_OUT',
])

export const createStockMovementSchema = z
  .object({
    merchantId: z.string().min(1),
    productId: z.string().min(1),
    movementType: stockMovementTypeSchema,
    quantityBase: stockQuantity,
    quantityCommercial: stockQuantity.optional(),
    unitCode: z.string().min(1).max(20).optional(),
    reason: z.string().min(1).max(50).optional(),
    reasonNote: z.string().max(300).optional(),
    referenceType: z.string().min(1).max(50).optional(),
    referenceId: z.string().min(1).optional(),
    operationId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    // Sortie anormale ⇒ raison obligatoire (même règle que le CHECK en
    // table — le client obtient un refus 400 lisible plutôt qu'un 500).
    if (
      ['LOSS', 'DAMAGE', 'DONATION', 'SUPPLIER_RETURN', 'ADJUSTMENT_OUT'].includes(data.movementType) &&
      !data.reason?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Une raison est obligatoire pour une sortie de stock',
      })
    }
  })

/** Comptage réel (§22) : « j'ai compté, il reste 30 kg » — la RPC calcule
 * le delta et trace ADJUSTMENT_IN/OUT reason=INVENTORY_COUNT. */
export const stockCountSchema = z.object({
  merchantId: z.string().min(1),
  productId: z.string().min(1),
  countedQuantityBase: z.number().min(0).max(9_999_999_999),
  note: z.string().max(300).optional(),
  operationId: z.string().uuid().optional(),
})

export const purchaseItemSchema = z.object({
  productName: z.string().min(1),
  quantity: stockQuantity,
  unitCostCfa: fcfaAmount,
  productId: z.string().min(1).optional(),
  unitCode: z.string().min(1).max(20).optional(),
  quantityBase: z.number().positive().max(9_999_999_999).optional(),
})

/** Achat de marchandises (§10/§30) : document + mouvements PURCHASE +
 * coût moyen pondéré, calculés par la RPC. Dépense comptable liée
 * OPTIONNELLE (D6 : achat ≠ dépense). */
export const createPurchaseSchema = z.object({
  merchantId: z.string().min(1),
  items: z.array(purchaseItemSchema).min(1),
  supplierId: z.string().min(1).optional(),
  amountPaid: fcfaAmount.optional(),
  note: z.string().max(300).optional(),
  sessionId: z.string().optional(),
  createExpense: z.boolean().optional(),
  expenseCategory: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
})

/** Backfill OPENING_BALANCE (§40) — idempotent, rejouable, scoppé par
 * requireDeviceOwner au marchand de la session. */
export const stockBackfillSchema = z.object({
  merchantId: z.string().min(1),
})

// The marchand may only cancel — confirming/marking delivered is the
// supplier/backoffice side of the lifecycle.
export const supplierOrderActionSchema = z
  .object({
    action: z.literal('annuler'),
  })
  .strict()

/** Flattens a ZodError into one French-readable line for API error responses. */
export function formatZodError(error: z.ZodError): string {
  const first = error.issues[0]
  if (!first) return 'Donnees invalides'
  const path = first.path.join('.')
  return path ? `${path}: ${first.message}` : first.message
}
