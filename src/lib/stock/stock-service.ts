// StockService central (STK-804) — LE point de passage vers les RPC
// transactionnelles de stock (cahier des charges §34 : « une couche, zéro
// duplication »). Toute route API marchand qui touche au stock passe ici ;
// aucune logique métier de stock ne vit dans une route.
//
// Architecture (plan .ai/PLAN_STOCK.md, décisions D1-D7) :
// - La garantie « IMPOSSIBLE DE VENDRE SANS STOCK » (§3) vit dans
//   PostgreSQL : RPC merchant_record_sale — verrous FOR UPDATE, CHECK ≥ 0,
//   refus INSUFFICIENT_STOCK avec payload {available, requested, unit,
//   product}, idempotence (merchant_id, operation_id). Ce module ne
//   RE-VÉRIFIE pas le stock : le serveur est l'autorité, la RPC est la
//   transaction tout-ou-rien.
// - Les mouvements sont la source de vérité ; merchant_stock_balances est
//   le cache lisible ; legacy_products.stock_qty est double-écrit (D3)
//   pour la compatibilité des écrans actuels.
//
// Erreurs métier (§36) : la RPC lève `message = code` + `details = JSON`.
// parseStockRpcError les normalise en StockBusinessError pour que les
// routes répondent 422 avec le payload exact attendu par Tata.

// ── Codes d'erreur métier (§36) ──────────────────────────────────────────

export type StockErrorCode =
  | 'INSUFFICIENT_STOCK'
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_INACTIVE'
  | 'INVALID_QUANTITY'
  | 'UNKNOWN_STOCK'
  // Transferts inter-marchands (STK-809, RAISE réels des RPC merchant_transfer_*) :
  // normalisés ici (STK-815) pour que la route réponde 400 avec le label FR
  // au lieu d'un 500 générique — l'UI les parle tels quels.
  | 'TRANSFER_SELF'
  | 'TRANSFER_NOT_FOUND'
  | 'TRANSFER_NOT_ADDRESSED'
  | 'TRANSFER_NOT_OWNER'
  | 'TRANSFER_ALREADY_PROCESSED'

/** Littéral exporté : la garde transverse (STK-812) verrouille cette liste
 * pour qu'aucun code n'apparaisse ou ne disparaisse en silence. */
export const STOCK_ERROR_CODES: readonly StockErrorCode[] = [
  'INSUFFICIENT_STOCK',
  'PRODUCT_NOT_FOUND',
  'PRODUCT_INACTIVE',
  'INVALID_QUANTITY',
  'UNKNOWN_STOCK',
  'TRANSFER_SELF',
  'TRANSFER_NOT_FOUND',
  'TRANSFER_NOT_ADDRESSED',
  'TRANSFER_NOT_OWNER',
  'TRANSFER_ALREADY_PROCESSED',
]

/** Erreur métier normalisée renvoyée par une RPC de stock. */
export interface StockBusinessError {
  code: StockErrorCode
  /** Refus de vente/sortie : {available, requested, unit, product} (§36). */
  available?: number
  requested?: number
  unit?: string
  product?: string
  productId?: string
  /** INVALID_QUANTITY : index de la ligne fautive dans le payload. */
  index?: number
  /** Message brut non-JSON éventuel (ex. « Une raison est obligatoire… »). */
  message?: string
}

/** PostgREST exécute `RAISE EXCEPTION USING message = code, detail = JSON`
 * : supabase-js expose error.message = code métier et error.details = texte
 * JSON. Retourne null pour toute erreur NON métier (réseau, 500, RPC
 * absente…) — l'appelant garde alors son comportement d'erreur générique. */
export function parseStockRpcError(error: unknown): StockBusinessError | null {
  if (!error || typeof error !== 'object') return null
  const { message, details } = error as { message?: unknown; details?: unknown }
  if (typeof message !== 'string') return null
  if (!(STOCK_ERROR_CODES as readonly string[]).includes(message)) return null

  const business: StockBusinessError = { code: message as StockErrorCode }
  if (typeof details === 'string' && details.trim()) {
    try {
      const payload = JSON.parse(details) as Record<string, unknown>
      if (payload.available !== undefined) business.available = Number(payload.available)
      if (payload.requested !== undefined) business.requested = Number(payload.requested)
      if (typeof payload.unit === 'string') business.unit = payload.unit
      if (typeof payload.product === 'string') business.product = payload.product
      if (typeof payload.product_id === 'string') business.productId = payload.product_id
      if (payload.index !== undefined) business.index = Number(payload.index)
    } catch {
      // details non-JSON : le code seul suffit au mapping HTTP.
    }
  }
  return business
}

// ── Idempotence offline (§31-32) : clientId → operation_id UUID ──────────
//
// Le journal merchant_stock_movements indexe les opérations par UUID
// (operation_id uuid UNIQUE (merchant_id, operation_id)) mais les clients
// jùlaba génèrent des clientId lisibles (« sale-1737-… »). La dérivation
// est DÉTERMINISTE (même technique que le backfill OPENING_BALANCE) :
// rejouer la même opération offline → même UUID → idempotence de la RPC.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Formate un hex de 32 caractères en UUID canonique 8-4-4-4-12. */
function hexToUuid(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * UUID d'opération pour une demande client :
 * - clientId déjà UUID → tel quel (contrat futur §31) ;
 * - clientId lisible → UUID dérivé md5 (déterministe, rejouable) ;
 * - absent → UUID aléatoire (appel serveur interne).
 */
export function operationUuid(clientId?: string | null): string {
  const trimmed = clientId?.trim()
  if (trimmed && UUID_RE.test(trimmed)) return trimmed.toLowerCase()
  if (trimmed) return hexToUuid(createMd5Hex(`operation:${trimmed}`))
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return hexToUuid(createMd5Hex(`random:${Date.now()}:${Math.random()}`))
}

/** md5 hex isolé pour testabilité. Node (routes API) utilise node:crypto ;
 * ailleurs, FNV-1a 128 bits — déterministe lui aussi, jamais mélangé aux
 * UUID Node car un même clientId est TOUJOURS dérivé du même côté (routes
 * serveur). */
function createMd5Hex(input: string): string {
  if (typeof globalThis.process !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require('node:crypto') as typeof import('node:crypto')
    return createHash('md5').update(input).digest('hex')
  }
  return fnv1a128(input)
}

/** FNV-1a en 4 mots 32 bits (128 bits) — repli déterministe hors Node. */
function fnv1a128(input: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0x9dc5811c, h4 = 0x1930100f
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ (c + 1), 0x85ebca6b) >>> 0
    h3 = Math.imul(h3 ^ (c + 2), 0xc2b2ae35) >>> 0
    h4 = Math.imul(h4 ^ (c + 3), 0x27d4eb2f) >>> 0
  }
  return [h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, '0')).join('')
}

// ── Appels RPC (le serveur est l'autorité) ───────────────────────────────

/** Supabase admin client — typé any (tables legacy non générées). */
type SupabaseAdmin = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface SaleRpcParams {
  merchantId: string
  operationId: string
  deviceId?: string | null
  items: Array<Record<string, unknown>>
  amountReceived?: number
  isVoiceSale?: boolean
  voiceTranscript?: string | null
  note?: string | null
  sessionId?: string | null
}

export type RpcOutcome =
  | { ok: true; data: Record<string, unknown> }
  /** Erreur métier normalisée (§36) → HTTP 422. */
  | { ok: false; business: StockBusinessError }
  /** La fonction n'existe pas en base (migrations pas encore poussées). */
  | { ok: false; rpcMissing: true }
  /** Tout le reste : HTTP 500 générique. */
  | { ok: false; raw: unknown }

/** Exécute une RPC de stock et normalise les trois issues possibles. */
async function callStockRpc(
  supabase: SupabaseAdmin,
  fn: string,
  args: Record<string, unknown>,
): Promise<RpcOutcome> {
  try {
    const { data, error } = await supabase.rpc(fn, args)
    if (!error) return { ok: true, data: (data ?? {}) as Record<string, unknown> }

    const business = parseStockRpcError(error)
    if (business) return { ok: false, business }

    const err = error as { code?: string; message?: string }
    // PGRST202 = function not found (PostgREST). La bascule réelle est le
    // `supabase db push` : tant que les migrations STK-802/803 ne sont pas
    // appliquées, l'appelant peut replier sur le chemin legacy.
    if (err?.code === 'PGRST202' || /could not find the function/i.test(err?.message ?? '')) {
      return { ok: false, rpcMissing: true }
    }
    return { ok: false, raw: error }
  } catch (error) {
    const business = parseStockRpcError(error)
    if (business) return { ok: false, business }
    return { ok: false, raw: error }
  }
}

/** Vente (§35) — la transaction tout-ou-rien : verrous, refus strict,
 * vente legacy + mouvement + balance, idempotence sur operation_id. */
export function recordSaleViaRpc(supabase: SupabaseAdmin, params: SaleRpcParams): Promise<RpcOutcome> {
  return callStockRpc(supabase, 'merchant_record_sale', {
    p_merchant_id: params.merchantId,
    p_operation_id: params.operationId,
    p_device_id: params.deviceId ?? null,
    p_items: params.items,
    p_amount_received: params.amountReceived ?? 0,
    p_is_voice_sale: params.isVoiceSale ?? false,
    p_voice_transcript: params.voiceTranscript ?? null,
    p_note: params.note ?? null,
    p_session_id: params.sessionId ?? null,
  })
}

export interface MovementRpcParams {
  merchantId: string
  operationId: string
  deviceId?: string | null
  productId: string
  movementType: string
  quantityBase: number
  quantityCommercial?: number
  unitCode?: string
  reason?: string
  reasonNote?: string
  referenceType?: string
  referenceId?: string
}

/** Mouvement simple (§20-22) : perte, dégât, don, retour client,
 * réception libre, production, ajustement manuel. */
export function recordMovementViaRpc(supabase: SupabaseAdmin, params: MovementRpcParams): Promise<RpcOutcome> {
  return callStockRpc(supabase, 'merchant_record_movement', {
    p_merchant_id: params.merchantId,
    p_operation_id: params.operationId,
    p_device_id: params.deviceId ?? null,
    p_product_id: params.productId,
    p_movement_type: params.movementType,
    p_quantity_base: roundQuantity(params.quantityBase),
    p_quantity_commercial: params.quantityCommercial != null ? roundQuantity(params.quantityCommercial) : null,
    p_unit_code: params.unitCode ?? null,
    p_reason: params.reason ?? null,
    p_reason_note: params.reasonNote ?? null,
    p_reference_type: params.referenceType ?? null,
    p_reference_id: params.referenceId ?? null,
  })
}

/** Comptage réel (§22) : delta tracé ADJUSTMENT_IN/OUT INVENTORY_COUNT. */
export function adjustToCountViaRpc(
  supabase: SupabaseAdmin,
  params: {
    merchantId: string
    operationId: string
    deviceId?: string | null
    productId: string
    countedQuantityBase: number
    note?: string
  },
): Promise<RpcOutcome> {
  return callStockRpc(supabase, 'merchant_adjust_to_count', {
    p_merchant_id: params.merchantId,
    p_operation_id: params.operationId,
    p_device_id: params.deviceId ?? null,
    p_product_id: params.productId,
    p_counted_quantity_base: roundQuantity(params.countedQuantityBase),
    p_note: params.note ?? null,
  })
}

export interface PurchaseRpcParams {
  merchantId: string
  operationId: string
  deviceId?: string | null
  items: Array<Record<string, unknown>>
  supplierId?: string | null
  amountPaid?: number | null
  note?: string | null
  sessionId?: string | null
  createExpense?: boolean
  expenseCategory?: string
}

/** Achat de marchandises (§10/§30) + coût moyen pondéré. */
export function recordPurchaseViaRpc(supabase: SupabaseAdmin, params: PurchaseRpcParams): Promise<RpcOutcome> {
  return callStockRpc(supabase, 'merchant_record_purchase', {
    p_merchant_id: params.merchantId,
    p_operation_id: params.operationId,
    p_device_id: params.deviceId ?? null,
    p_items: params.items,
    p_supplier_id: params.supplierId ?? null,
    p_amount_paid: params.amountPaid ?? null,
    p_note: params.note ?? null,
    p_session_id: params.sessionId ?? null,
    p_create_expense: params.createExpense ?? false,
    p_expense_category: params.expenseCategory ?? 'aliment',
  })
}

/** Backfill OPENING_BALANCE (§40) — idempotent et rejouable. */
export function backfillOpeningBalancesViaRpc(supabase: SupabaseAdmin): Promise<RpcOutcome> {
  return callStockRpc(supabase, 'merchant_backfill_opening_balances', {})
}

// ── Transferts inter-marchands (STK-809, §28) ────────────────────────────

export interface TransferOutRpcParams {
  merchantId: string
  operationId: string
  toMerchantId: string
  deviceId?: string | null
  items: Array<Record<string, unknown>>
  note?: string | null
}

/** Envoi d'un transfert : sorties TRANSFER_OUT chez l'expéditeur +
 * document status='sent'. Idempotent sur operation_id. */
export function transferOutViaRpc(supabase: SupabaseAdmin, params: TransferOutRpcParams): Promise<RpcOutcome> {
  return callStockRpc(supabase, 'merchant_transfer_out', {
    p_merchant_id: params.merchantId,
    p_operation_id: params.operationId,
    p_to_merchant_id: params.toMerchantId,
    p_device_id: params.deviceId ?? null,
    p_items: params.items,
    p_note: params.note ?? null,
  })
}

/** Réception d'un transfert : entrées RECEIPT chez le destinataire +
 * statut 'received'. Les écarts (reçu ≠ envoyé) sont tracés par la RPC. */
export function transferReceiveViaRpc(
  supabase: SupabaseAdmin,
  params: { merchantId: string; transferId: string; deviceId?: string | null; items?: Array<Record<string, unknown>> },
): Promise<RpcOutcome> {
  return callStockRpc(supabase, 'merchant_transfer_receive', {
    p_merchant_id: params.merchantId,
    p_transfer_id: params.transferId,
    p_device_id: params.deviceId ?? null,
    p_items: params.items ?? [],
  })
}

/** Annulation d'un transfert non reçu (sent → cancelled, raison requise). */
export function transferCancelViaRpc(
  supabase: SupabaseAdmin,
  params: { merchantId: string; transferId: string; deviceId?: string | null; reason: string },
): Promise<RpcOutcome> {
  return callStockRpc(supabase, 'merchant_transfer_cancel', {
    p_merchant_id: params.merchantId,
    p_transfer_id: params.transferId,
    p_device_id: params.deviceId ?? null,
    p_reason: params.reason,
  })
}

/** numeric(14,3) : on borne la précision côté client avant envoi. */
export function roundQuantity(q: number): number {
  return Math.round(q * 1000) / 1000
}
