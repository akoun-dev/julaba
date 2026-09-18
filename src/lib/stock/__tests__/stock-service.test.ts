import { describe, expect, it, vi } from 'vitest'
import {
  adjustToCountViaRpc,
  backfillOpeningBalancesViaRpc,
  operationUuid,
  parseStockRpcError,
  recordMovementViaRpc,
  recordPurchaseViaRpc,
  recordSaleViaRpc,
  roundQuantity,
  type RpcOutcome,
} from '../stock-service'

// STK-804 — StockService central : dérivation déterministe des UUID
// d'opération (idempotence offline §31-32), normalisation des erreurs
// métier des RPC (§36) et passation fidèle des arguments à PostgreSQL
// (le serveur est l'autorité — le service ne re-vérifie JAMAIS le stock).

function okSupabase(data: unknown = {}) {
  return { rpc: vi.fn(async () => ({ data, error: null })) }
}

describe('operationUuid — idempotence offline (§31-32)', () => {
  it('un clientId valide en UUID passe tel quel (normalisé minuscule)', () => {
    const uuid = 'A3BB8C24-9B1E-4C1E-8F12-3A5B6C7D8E9F'
    expect(operationUuid(uuid)).toBe(uuid.toLowerCase())
  })

  it('un clientId lisible (« sale-1737-abc ») donne le MÊME UUID à chaque rejeu', () => {
    const a = operationUuid('sale-1737000000000-abc123')
    const b = operationUuid('sale-1737000000000-abc123')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('deux clientId différents donnent deux UUID différents', () => {
    expect(operationUuid('sale-1')).not.toBe(operationUuid('sale-2'))
  })

  it('sans clientId : UUID aléatoire (appel serveur interne)', () => {
    const a = operationUuid()
    const b = operationUuid(null)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(b).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })
})

describe('parseStockRpcError — normalisation des refus métier (§36)', () => {
  it('INSUFFICIENT_STOCK : payload {available, requested, unit, product, product_id} extrait', () => {
    const err = {
      message: 'INSUFFICIENT_STOCK',
      details: JSON.stringify({ available: 7, requested: 15, unit: 'kg', product: 'tomates', product_id: 'p1' }),
    }
    expect(parseStockRpcError(err)).toEqual({
      code: 'INSUFFICIENT_STOCK',
      available: 7,
      requested: 15,
      unit: 'kg',
      product: 'tomates',
      productId: 'p1',
    })
  })

  it('INVALID_QUANTITY : index de la ligne fautive extrait', () => {
    const err = { message: 'INVALID_QUANTITY', details: JSON.stringify({ index: 2, requested: '0' }) }
    const parsed = parseStockRpcError(err)
    expect(parsed!.code).toBe('INVALID_QUANTITY')
    expect(parsed!.index).toBe(2)
  })

  it('details non-JSON : le code seul est conservé (mapping HTTP possible)', () => {
    expect(parseStockRpcError({ message: 'PRODUCT_NOT_FOUND', details: 'boom' })).toEqual({
      code: 'PRODUCT_NOT_FOUND',
    })
  })

  it('message inconnu / non métier → null (l\'appelant garde son erreur générique)', () => {
    expect(parseStockRpcError({ message: 'duplicate key value violates unique constraint' })).toBeNull()
    expect(parseStockRpcError({ message: 'PGRST202' })).toBeNull()
    expect(parseStockRpcError(null)).toBeNull()
    expect(parseStockRpcError('erreur')).toBeNull()
  })
})

describe('recordSaleViaRpc — passation RPC et trois issues', () => {
  const params = {
    merchantId: 'M-TEST',
    operationId: 'a3bb8c24-9b1e-4c1e-8f12-3a5b6c7d8e9f',
    items: [{ productId: 'p1', productName: 'Tomates', quantity: 3, unitPrice: 500 }],
    amountReceived: 1500,
  }

  it('succès : data renvoyée telle quelle (contrat {created, sale, items, stock})', async () => {
    const data = { created: true, sale: { id: 'S1' }, items: [], stock: [] }
    const supabase = okSupabase(data)
    const outcome = await recordSaleViaRpc(supabase, params)
    expect(outcome).toEqual({ ok: true, data })
    expect(supabase.rpc).toHaveBeenCalledWith('merchant_record_sale', {
      p_merchant_id: 'M-TEST',
      p_operation_id: 'a3bb8c24-9b1e-4c1e-8f12-3a5b6c7d8e9f',
      p_device_id: null,
      p_items: params.items,
      p_amount_received: 1500,
      p_is_voice_sale: false,
      p_voice_transcript: null,
      p_note: null,
      p_session_id: null,
    })
  })

  it('refus INSUFFICIENT_STOCK → issue business (le service ne re-vérifie pas le stock)', async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: 'P0001', message: 'INSUFFICIENT_STOCK', details: '{"available":7,"requested":15,"unit":"kg"}' },
      })),
    }
    const outcome = (await recordSaleViaRpc(supabase, params)) as Extract<RpcOutcome, { ok: false; business: unknown }>
    expect(outcome.ok).toBe(false)
    expect(outcome.business).toEqual({ code: 'INSUFFICIENT_STOCK', available: 7, requested: 15, unit: 'kg' })
  })

  it('RPC absente (PGRST202) → rpcMissing (repli legacy avant db push)', async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function merchant_record_sale in the schema cache' },
      })),
    }
    const outcome = (await recordSaleViaRpc(supabase, params)) as Extract<RpcOutcome, { ok: false; rpcMissing: true }>
    expect(outcome).toEqual({ ok: false, rpcMissing: true })
  })

  it('erreur technique → issue raw (HTTP 500 générique côté route)', async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: { code: 'XX000', message: 'db down' } })) }
    const outcome = (await recordSaleViaRpc(supabase, params)) as Extract<RpcOutcome, { ok: false; raw: unknown }>
    expect(outcome.ok).toBe(false)
    expect(outcome.raw).toEqual({ code: 'XX000', message: 'db down' })
  })
})

describe('mouvements, comptage, achat, backfill — passation fidèle', () => {
  it('recordMovementViaRpc : quantités arrondies numeric(14,3), reason transmise', async () => {
    const supabase = okSupabase({ created: true, movement: {}, balance: {} })
    await recordMovementViaRpc(supabase, {
      merchantId: 'M-TEST',
      operationId: 'a3bb8c24-9b1e-4c1e-8f12-3a5b6c7d8e9f',
      productId: 'p1',
      movementType: 'LOSS',
      quantityBase: 2.3456,
      quantityCommercial: 2.3456,
      unitCode: 'kg',
      reason: 'PERISHABLE',
      reasonNote: 'Les tomates sont gâtées',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('merchant_record_movement', expect.objectContaining({
      p_quantity_base: 2.346,
      p_quantity_commercial: 2.346,
      p_reason: 'PERISHABLE',
      p_reason_note: 'Les tomates sont gâtées',
    }))
  })

  it('adjustToCountViaRpc : comptage réel transmis tel quel', async () => {
    const supabase = okSupabase({ created: true, delta: -5 })
    await adjustToCountViaRpc(supabase, {
      merchantId: 'M-TEST',
      operationId: 'a3bb8c24-9b1e-4c1e-8f12-3a5b6c7d8e9f',
      productId: 'p1',
      countedQuantityBase: 30,
      note: 'j\'ai compté',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('merchant_adjust_to_count', expect.objectContaining({
      p_counted_quantity_base: 30,
      p_note: 'j\'ai compté',
    }))
  })

  it('recordPurchaseViaRpc : items + dépense liée optionnelle (D6)', async () => {
    const supabase = okSupabase({ created: true, purchase: {}, items: [] })
    await recordPurchaseViaRpc(supabase, {
      merchantId: 'M-TEST',
      operationId: 'a3bb8c24-9b1e-4c1e-8f12-3a5b6c7d8e9f',
      items: [{ productId: 'p1', productName: 'Riz', quantity: 5, unitCostCfa: 6000 }],
      supplierId: 'bp1',
      amountPaid: 30000,
      createExpense: true,
    })
    expect(supabase.rpc).toHaveBeenCalledWith('merchant_record_purchase', expect.objectContaining({
      p_items: [{ productId: 'p1', productName: 'Riz', quantity: 5, unitCostCfa: 6000 }],
      p_supplier_id: 'bp1',
      p_amount_paid: 30000,
      p_create_expense: true,
    }))
  })

  it('backfillOpeningBalancesViaRpc : sans argument, idempotent', async () => {
    const supabase = okSupabase({ products_scanned: 3, balances_created: 3, movements_created: 2 })
    const outcome = await backfillOpeningBalancesViaRpc(supabase)
    expect(outcome.ok).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('merchant_backfill_opening_balances', {})
  })
})

describe('roundQuantity — précision numeric(14,3)', () => {
  it('borne à 3 décimales', () => {
    expect(roundQuantity(2.3456)).toBe(2.346)
    expect(roundQuantity(10)).toBe(10)
    expect(roundQuantity(0.0004)).toBe(0)
  })
})
