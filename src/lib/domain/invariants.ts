import type { CashMovement, StockMovement } from './truth-contracts'

export type InvariantViolation = {
  code: 'NEGATIVE_AMOUNT' | 'DUPLICATE_OPERATION' | 'STOCK_UNDERFLOW' | 'OWNER_MISMATCH'
  message: string
}

export function validateCashMovements(movements: readonly CashMovement[]): InvariantViolation[] {
  const violations: InvariantViolation[] = []
  const seen = new Set<string>()
  for (const movement of movements) {
    if (!Number.isInteger(movement.amountCfa) || movement.amountCfa < 0) {
      violations.push({ code: 'NEGATIVE_AMOUNT', message: `Montant invalide pour ${movement.operationId}.` })
    }
    if (seen.has(movement.operationId)) {
      violations.push({ code: 'DUPLICATE_OPERATION', message: `Opération répétée : ${movement.operationId}.` })
    }
    seen.add(movement.operationId)
  }
  return violations
}

export function projectStockQuantity(initial: number, movements: readonly StockMovement[]): number {
  return movements.reduce((quantity, movement) => quantity + movement.delta, initial)
}

export function validateStockMovements(
  initial: number,
  movements: readonly StockMovement[],
): InvariantViolation[] {
  const violations: InvariantViolation[] = []
  const seen = new Set<string>()
  let quantity = initial
  for (const movement of movements) {
    if (seen.has(movement.operationId)) {
      violations.push({ code: 'DUPLICATE_OPERATION', message: `Mouvement répété : ${movement.operationId}.` })
      continue
    }
    seen.add(movement.operationId)
    quantity += movement.delta
    if (quantity < 0) {
      violations.push({ code: 'STOCK_UNDERFLOW', message: `Stock négatif pour ${movement.productId}.` })
    }
  }
  return violations
}

export function sameOwner(ownerIds: readonly string[]): boolean {
  return ownerIds.length === 0 || ownerIds.every((ownerId) => ownerId === ownerIds[0])
}
