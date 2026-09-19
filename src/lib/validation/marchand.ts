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
  // MODE-906 (§9/§21) — comment la vente est encaissée ; défaut 'especes'
  // (les ventes antérieures restent des ventes en espèces).
  paymentMethod: z.enum(['especes', 'mobile_money', 'credit', 'autre']).optional(),
  // MODE-908 (§18) — étiquette du point de vente : client_id d'idempotence
  // du point (résolu en merchant_selling_points.id par la route) + nom en
  // snapshot. OPTIONNELS : absents = payload historique identique (compat
  // avant/après migration — jamais de vente bloquée par un point inconnu).
  sellingPointClientId: z.string().min(8).max(64).optional(),
  sellingPointName: z.string().min(2).max(60).optional(),
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
    // STK-808 — identifiant local lisible (« perte-1737-… ») : converti en
    // UUID DÉTERMINISTE côté route (operationUuid) pour que le rejeu
    // offline reproduise exactement la même opération, jamais un doublon.
    clientId: z.string().min(1).max(64).optional(),
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
  // STK-808 — même contrat offline que les mouvements (operationUuid).
  clientId: z.string().min(1).max(64).optional(),
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
 * OPTIONNELLE (D6 : achat ≠ dépense).
 * MODE-907 (§15) — fournisseur : `supplierClientId` (client_id
 * d'idempotence du partenaire, prioritaire) et/ou `supplierName` (secours
 * de création à la volée). La route résout le client_id en
 * business_partners.id avant d'appeler la RPC ; supplierId direct reste
 * accepté (compat). */
export const createPurchaseSchema = z.object({
  merchantId: z.string().min(1),
  items: z.array(purchaseItemSchema).min(1),
  supplierId: z.string().min(1).optional(),
  supplierClientId: z.string().min(8).max(64).optional(),
  supplierName: z.string().min(2).max(80).optional(),
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

/** Unité commerciale d'un produit (STK-806, §8-9) — la conversion vers
 * l'unité de base est configurable par produit ET par marchand (« un sac
 * d'oignons = 25 kg chez A, 50 kg chez B »). unit_code validé côté API
 * contre le catalogue STOCK_UNITS (jamais de code inventé). */
export const stockUnitUpsertSchema = z
  .object({
    merchantId: z.string().min(1),
    productId: z.string().min(1),
    unitCode: z.string().min(1).max(20),
    conversionToBase: z.number().positive().max(9_999_999_999),
    isBase: z.boolean().optional(),
    isDefaultSale: z.boolean().optional(),
    clientId: z.string().min(1).optional(),
  })
  .strict()

// The marchand may only cancel — confirming/marking delivered is the
// supplier/backoffice side of the lifecycle.
export const supplierOrderActionSchema = z
  .object({
    action: z.literal('annuler'),
  })
  .strict()

/** STK-809 — réception d'une commande fournisseur par le marchand :
 * génére l'achat (merchant_record_purchase — mouvement PURCHASE + coût
 * moyen pondéré + coût D3) puis passe la commande à « livrée ». */
export const supplierOrderReceiveSchema = z
  .object({
    action: z.literal('recevoir'),
    clientId: z.string().min(1).max(64).optional(),
    amountPaid: fcfaAmount.optional(),
    createExpense: z.boolean().optional(),
    expenseCategory: z.string().min(1).optional(),
  })
  .strict()

/** Transfert inter-marchands (STK-809, §28) — envoi. */
export const stockTransferCreateSchema = z
  .object({
    merchantId: z.string().min(1),
    toMerchantId: z.string().min(1),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantityBase: z.number().positive().max(9_999_999_999),
          quantityCommercial: z.number().positive().max(9_999_999_999).optional(),
          unitCode: z.string().min(1).max(20).optional(),
        }),
      )
      .min(1),
    note: z.string().max(300).optional(),
    clientId: z.string().min(1).max(64).optional(),
  })
  .strict()

/** Réception (« recevoir ») ou annulation d'un transfert envoyé. */
export const stockTransferActionSchema = z
  .object({
    merchantId: z.string().min(1),
    transferId: z.string().min(1),
    action: z.enum(['recevoir', 'annuler']),
    reason: z.string().min(1).max(200).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.action === 'annuler' && !data.reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Une raison est obligatoire pour annuler un transfert',
      })
    }
  })

/** Flattens a ZodError into one French-readable line for API error responses. */
export function formatZodError(error: z.ZodError): string {
  const first = error.issues[0]
  if (!first) return 'Donnees invalides'
  const path = first.path.join('.')
  return path ? `${path}: ${first.message}` : first.message
}

// ---------------------------------------------------------------------------
// MODE-902 (§7-8) — session de journée marché (upsert idempotent client_id).
// Le payload = l'enregistrement plat construit côté client (rejeu offline
// verbatim) : latitude/longitude/accuracyM ne sont recevables qu'en mode gps.
// ---------------------------------------------------------------------------

export const marketSessionSchema = z
  .object({
    merchantId: z.string().min(1),
    clientId: z.string().min(1),
    marketName: z.string().min(1).max(120).nullable().optional(),
    locationMode: z.enum(['gps', 'select', 'none']),
    startedAt: z.string().min(1),
    startingCash: fcfaAmount,
    status: z.enum(['open', 'closed']).optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    accuracyM: z.number().min(0).nullable().optional(),
    closedAt: z.string().min(1).nullable().optional(),
    endingCash: fcfaAmount.nullable().optional(),
    salesTotal: fcfaAmount.nullable().optional(),
    expensesTotal: fcfaAmount.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    // La position n'est recevable qu'en mode « gps » (§6 — collecte minimale).
    if (data.locationMode !== 'gps' && (data.latitude != null || data.longitude != null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['latitude'],
        message: 'La position n\'est acceptée qu\'en mode gps',
      })
    }
    // Une clôture porte toujours l'heure de fermeture.
    if (data.endingCash !== undefined && data.endingCash !== null && !data.closedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['closedAt'],
        message: 'Une clôture exige l\'heure de fermeture',
      })
    }
  })

export type MarketSessionPayload = z.infer<typeof marketSessionSchema>

// ---------------------------------------------------------------------------
// MODE-906 (§21-22/§27-28) — crédits clients : partenaires (clients nommés)
// et opérations du grand livre de crédit. Montants FCFA entiers strictement
// positifs ; client_id unique = idempotence (rejeu offline = même payload).
// ---------------------------------------------------------------------------

export const createPartnerSchema = z.object({
  merchantId: z.string().min(1),
  /** client_id d'idempotence, généré par l'appareil (min 8 = jamais court). */
  clientId: z.string().min(8).max(64),
  kind: z.enum(['client', 'fournisseur']).default('client'),
  name: z.string().min(2).max(80),
  phone: z.string().max(20).optional(),
  note: z.string().max(200).optional(),
})

export type PartnerPayload = z.infer<typeof createPartnerSchema>

export const createCreditOpSchema = z.object({
  merchantId: z.string().min(1),
  /** operation_id d'idempotence de l'op de crédit (UUID côté store). */
  clientId: z.string().min(8).max(64),
  kind: z.enum(['credit', 'repayment']),
  partnerClientId: z.string().min(8),
  /** Requis si le partenaire est inconnu côté serveur (création à la volée) —
   * règle croisée vérifiée dans la route (elle seule connaît la base). */
  partnerName: z.string().min(2).max(80).optional(),
  /** Vente à crédit liée (legacy_sales.client_id) — crédit issu d'une vente. */
  saleClientId: z.string().min(1).optional(),
  amountCfa: z.number().int().positive().max(100_000_000),
  note: z.string().max(200).optional(),
})

export type CreditOpPayload = z.infer<typeof createCreditOpSchema>

// ---------------------------------------------------------------------------
// MODE-908 (§18) — points de vente multiples : entité locale-first du
// marchand (boutique, marché Treichville, marché Adjamé…), synchronisée par
// upsert IDEMPOTENT client_id (le rejeu offline rejoue le MÊME payload ; le
// renommage/l'archivage voyagent par le même client_id). Le nom fait 2-60
// caractères ; le vocabulaire du kind est fermé — jamais de valeur inventée.
// ---------------------------------------------------------------------------

export const createSellingPointSchema = z.object({
  merchantId: z.string().min(1),
  /** client_id d'idempotence, généré par l'appareil (UUID — min 8). */
  clientId: z.string().min(8).max(64),
  name: z.string().min(2).max(60),
  kind: z.enum(['boutique', 'marche', 'autre']).default('autre'),
  /** Archivage (jamais de suppression) — ISO 8601 ; absent = point en activité.
   * L'UPDATE ne pose JAMAIS la colonne à NULL : on ne désarchive pas par accident. */
  archivedAt: z.string().min(1).optional(),
})

export type SellingPointPayload = z.infer<typeof createSellingPointSchema>

// ---------------------------------------------------------------------------
// MODE-909 (§28) — annulation/correction de vente : OPÉRATION INVERSE
// append-only. Une vente enregistrée ne se supprime JAMAIS — l'annulation
// crée une entité `sale-reversal` ciblant la vente (saleClientId =
// legacy_sales.client_id). La raison est OBLIGATOIRE (3-200 après trim :
// une annulation sans pourquoi n'est pas traçable — même règle que le CHECK
// en base). clientId = id d'idempotence de l'annulation (UUID — le rejeu
// offline rejoue le MÊME operation_id).
// ---------------------------------------------------------------------------

export const createSaleReversalSchema = z.object({
  merchantId: z.string().min(1),
  /** operation_id d'idempotence de l'annulation, généré par l'appareil. */
  clientId: z.string().min(8).max(64),
  /** Vente annulée = legacy_sales.client_id (jamais son id technique). */
  saleClientId: z.string().min(8).max(64),
  /** Raison obligatoire, nettoyée (même règle que length(trim(reason)) en base). */
  reason: z.string().trim().min(3).max(200),
})

export type SaleReversalPayload = z.infer<typeof createSaleReversalSchema>
