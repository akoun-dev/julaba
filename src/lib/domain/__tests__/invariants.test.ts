import { describe, expect, it } from 'vitest'
import { projectStockQuantity, sameOwner, validateCashMovements, validateStockMovements } from '../invariants'

describe('domain invariants', () => {
  it('rejects duplicate cash operations and invalid amounts', () => {
    const violations = validateCashMovements([
      { type: 'sale', amountCfa: 1000, operationId: 'sale-1', createdAt: '2026-09-20' },
      { type: 'sale', amountCfa: -1, operationId: 'sale-1', createdAt: '2026-09-20' },
    ])
    expect(violations.map((v) => v.code)).toEqual(['NEGATIVE_AMOUNT', 'DUPLICATE_OPERATION'])
  })

  it('projects stock from the initial quantity and detects underflow', () => {
    const movements = [
      { productId: 'rice', delta: -2, operationId: 'sale-1', createdAt: '2026-09-20' },
      { productId: 'rice', delta: 3, operationId: 'purchase-1', createdAt: '2026-09-20' },
    ]
    expect(projectStockQuantity(2, movements)).toBe(3)
    expect(validateStockMovements(2, movements)).toEqual([])
    expect(validateStockMovements(0, [movements[0]])[0].code).toBe('STOCK_UNDERFLOW')
  })

  it('does not mix owners in one replay batch', () => {
    expect(sameOwner(['merchant-1', 'merchant-1'])).toBe(true)
    expect(sameOwner(['merchant-1', 'merchant-2'])).toBe(false)
  })
})
