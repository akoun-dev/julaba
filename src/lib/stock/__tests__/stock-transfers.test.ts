import { describe, it, expect, vi } from 'vitest'
import {
  operationUuid,
  transferOutViaRpc,
  transferReceiveViaRpc,
  transferCancelViaRpc,
} from '../stock-service'

function okSupabase(data: unknown) {
  return { rpc: vi.fn(async () => ({ data, error: null })) }
}

describe('RPC transferts inter-marchands (STK-809, §28)', () => {
  it('transferOutViaRpc appelle merchant_transfer_out avec les bons p_*', async () => {
    const supabase = okSupabase({ created: true, transfer: { id: 't1' } })
    const outcome = await transferOutViaRpc(supabase as never, {
      merchantId: 'm1',
      operationId: '11111111-1111-1111-1111-111111111111',
      toMerchantId: 'm2',
      items: [{ productId: 'p1', quantityBase: 25 }],
      note: 'envoi',
    })
    expect(outcome.ok).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('merchant_transfer_out', {
      p_merchant_id: 'm1',
      p_operation_id: '11111111-1111-1111-1111-111111111111',
      p_to_merchant_id: 'm2',
      p_device_id: null,
      p_items: [{ productId: 'p1', quantityBase: 25 }],
      p_note: 'envoi',
    })
  })

  it('transferReceiveViaRpc appelle merchant_transfer_receive (items optionnels)', async () => {
    const supabase = okSupabase({ transfer: { id: 't1', status: 'received' } })
    const outcome = await transferReceiveViaRpc(supabase as never, {
      merchantId: 'm2',
      transferId: 't1',
    })
    expect(outcome.ok).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('merchant_transfer_receive', {
      p_merchant_id: 'm2',
      p_transfer_id: 't1',
      p_device_id: null,
      p_items: [],
    })
  })

  it('transferCancelViaRpc appelle merchant_transfer_cancel avec la raison', async () => {
    const supabase = okSupabase({ transfer: { id: 't1', status: 'cancelled' } })
    const outcome = await transferCancelViaRpc(supabase as never, {
      merchantId: 'm1',
      transferId: 't1',
      reason: 'erreur de saisie',
    })
    expect(outcome.ok).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('merchant_transfer_cancel', {
      p_merchant_id: 'm1',
      p_transfer_id: 't1',
      p_device_id: null,
      p_reason: 'erreur de saisie',
    })
  })

  it('clientId lisible du transfert → operationId DÉTERMINISTE (rejeu offline = même envoi)', () => {
    const a = operationUuid('transfer-123-abc')
    const b = operationUuid('transfer-123-abc')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})
