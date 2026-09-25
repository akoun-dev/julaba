import { describe, expect, it } from 'vitest'
import { CODES_METIER_MARKETPLACE, reponseErreurMarketplace } from '@/lib/marketplace-errors'

describe('marketplace error contract', () => {
  it('exposes the atomic mutation codes through the closed registry', () => {
    expect(CODES_METIER_MARKETPLACE.has('ORDER_NOT_OWNED')).toBe(true)
    expect(CODES_METIER_MARKETPLACE.has('PAYMENT_ALREADY_PENDING')).toBe(true)
    expect(CODES_METIER_MARKETPLACE.has('IDEMPOTENCY_PAYLOAD_MISMATCH')).toBe(true)
  })

  it('maps business errors without propagating the database message', async () => {
    const response = reponseErreurMarketplace(
      { message: 'IDEMPOTENCY_PAYLOAD_MISMATCH', details: '{"from":"pending","to":"confirmed"}' },
      'test',
    )
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      erreur: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
      code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
      from: 'pending',
      to: 'confirmed',
    })
  })

  it('maps unknown database errors to a generic 500', async () => {
    const response = reponseErreurMarketplace(
      { message: 'duplicate key value violates unique constraint', details: 'sensitive' },
      'test',
    )
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ erreur: 'MARKETPLACE_ERROR', code: 'MARKETPLACE_ERROR' })
  })
})
