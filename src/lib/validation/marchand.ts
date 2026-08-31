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
// validation instead of silently passing through to Prisma's update — this
// is the actual fix for the "no field whitelist" finding: without it, a
// PATCH body could reassign a product to a different merchantId.
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

/** Flattens a ZodError into one French-readable line for API error responses. */
export function formatZodError(error: z.ZodError): string {
  const first = error.issues[0]
  if (!first) return 'Donnees invalides'
  const path = first.path.join('.')
  return path ? `${path}: ${first.message}` : first.message
}
