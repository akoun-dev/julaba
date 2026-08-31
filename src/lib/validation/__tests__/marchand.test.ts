import { describe, it, expect } from 'vitest'
import {
  createSaleSchema,
  createExpenseSchema,
  createProductSchema,
  updateProductSchema,
  formatZodError,
} from '../marchand'

describe('createSaleSchema', () => {
  const validSale = {
    merchantId: 'm1',
    items: [{ productName: 'Tomates', quantity: 2, unitPrice: 500 }],
  }

  it('accepts a well-formed sale', () => {
    expect(createSaleSchema.safeParse(validSale).success).toBe(true)
  })

  it('does not accept a client-supplied totalAmount (recomputed server-side)', () => {
    const parsed = createSaleSchema.safeParse({ ...validSale, totalAmount: 999999 })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect('totalAmount' in parsed.data).toBe(false)
    }
  })

  it('rejects a negative unit price', () => {
    const parsed = createSaleSchema.safeParse({
      merchantId: 'm1',
      items: [{ productName: 'Tomates', quantity: 2, unitPrice: -500 }],
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects a non-integer (decimal) unit price', () => {
    const parsed = createSaleSchema.safeParse({
      merchantId: 'm1',
      items: [{ productName: 'Tomates', quantity: 2, unitPrice: 500.5 }],
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects a zero or negative quantity', () => {
    const parsed = createSaleSchema.safeParse({
      merchantId: 'm1',
      items: [{ productName: 'Tomates', quantity: 0, unitPrice: 500 }],
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects an empty items array', () => {
    const parsed = createSaleSchema.safeParse({ merchantId: 'm1', items: [] })
    expect(parsed.success).toBe(false)
  })

  it('rejects a missing merchantId', () => {
    const parsed = createSaleSchema.safeParse({ items: validSale.items })
    expect(parsed.success).toBe(false)
  })
})

describe('createExpenseSchema', () => {
  it('accepts a well-formed expense', () => {
    const parsed = createExpenseSchema.safeParse({
      merchantId: 'm1',
      amount: 1000,
      category: 'transport',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a negative amount', () => {
    const parsed = createExpenseSchema.safeParse({
      merchantId: 'm1',
      amount: -1000,
      category: 'transport',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('createProductSchema', () => {
  it('accepts a well-formed product', () => {
    const parsed = createProductSchema.safeParse({
      merchantId: 'm1',
      name: 'Tomates',
      priceUnit: 500,
      stockQty: 10,
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a negative stock quantity', () => {
    const parsed = createProductSchema.safeParse({
      merchantId: 'm1',
      name: 'Tomates',
      stockQty: -1,
    })
    expect(parsed.success).toBe(false)
  })
})

describe('updateProductSchema', () => {
  it('accepts a partial update of known fields', () => {
    const parsed = updateProductSchema.safeParse({ priceUnit: 600 })
    expect(parsed.success).toBe(true)
  })

  it('rejects an unknown field (e.g. merchantId reassignment)', () => {
    const parsed = updateProductSchema.safeParse({ merchantId: 'someone-elses-id' })
    expect(parsed.success).toBe(false)
  })

  it('accepts an empty object', () => {
    expect(updateProductSchema.safeParse({}).success).toBe(true)
  })
})

describe('formatZodError', () => {
  it('includes the field path when present', () => {
    const parsed = createSaleSchema.safeParse({ merchantId: 'm1', items: [] })
    if (parsed.success) throw new Error('expected failure')
    expect(formatZodError(parsed.error)).toContain('items')
  })

  it('falls back to a generic message when there are no issues', () => {
    const emptyError = { issues: [] } as unknown as Parameters<typeof formatZodError>[0]
    expect(formatZodError(emptyError)).toBe('Donnees invalides')
  })
})
