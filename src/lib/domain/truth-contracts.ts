/** Canonical contracts shared by local projections, API mutations and outbox. */
export type DomainEntity = 'sale' | 'expense' | 'stock-movement' | 'client' | 'credit-op'

export type DomainMutation<TPayload = unknown> = {
  operationId: string
  ownerId: string
  entity: DomainEntity
  payload: TPayload
  createdAt: string
}

export type CashMovement = {
  type: 'sale' | 'expense' | 'opening' | 'closing' | 'reversal'
  amountCfa: number
  createdAt: string
  operationId: string
}

export type StockMovement = {
  productId: string
  delta: number
  operationId: string
  createdAt: string
}

export type ClientIdentity = {
  clientId: string
  ownerId: string
  displayName: string
  phone?: string
}

/** One authoritative write path per entity; UI state is only a projection. */
export const DOMAIN_TRUTH = {
  sale: 'server-rpc-ledger',
  expense: 'server-rpc-ledger',
  'stock-movement': 'server-rpc-ledger',
  client: 'server-upsert',
  'credit-op': 'server-credit-ledger',
} as const
