import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// db is mocked before importing the route so the route's own `import { db }`
// picks up the mock — a real Prisma connection isn't available in this test
// environment, and route handlers should be testable without one.
vi.mock('@/lib/db', () => ({
  db: {
    sale: { findUnique: vi.fn(), create: vi.fn() },
    deviceSession: { findUnique: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import { POST } from '../route'

function postRequest(body: unknown, cookie?: string) {
  return new NextRequest('http://localhost/api/marchand/sales', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie: `julaba_device=${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

const MERCHANT_ID = 'merchant-1'

describe('POST /api/marchand/sales', () => {
  beforeEach(() => {
    vi.mocked(db.deviceSession.findUnique).mockReset()
    vi.mocked(db.sale.findUnique).mockReset()
    vi.mocked(db.sale.create).mockReset()
  })

  it('rejects a request with no device session cookie (401)', async () => {
    const res = await POST(postRequest({
      merchantId: MERCHANT_ID,
      items: [{ productName: 'Tomates', quantity: 2, unitPrice: 500 }],
    }))
    expect(res.status).toBe(401)
  })

  it('rejects a device session bound to a different merchant (403)', async () => {
    vi.mocked(db.deviceSession.findUnique).mockResolvedValue({
      subject: 'merchant:someone-else',
      expiresAt: new Date(Date.now() + 1000_000),
    } as never)

    const res = await POST(postRequest(
      { merchantId: MERCHANT_ID, items: [{ productName: 'Tomates', quantity: 2, unitPrice: 500 }] },
      'tok',
    ))
    expect(res.status).toBe(403)
  })

  it('rejects invalid input before touching the database (400)', async () => {
    const res = await POST(postRequest({ merchantId: MERCHANT_ID, items: [] }, 'tok'))
    expect(res.status).toBe(400)
    expect(db.deviceSession.findUnique).not.toHaveBeenCalled()
  })

  it('recomputes totalAmount server-side, ignoring any client-supplied value', async () => {
    vi.mocked(db.deviceSession.findUnique).mockResolvedValue({
      subject: `merchant:${MERCHANT_ID}`,
      expiresAt: new Date(Date.now() + 1000_000),
    } as never)
    vi.mocked(db.sale.create).mockImplementation((async (args: { data: Record<string, unknown> }) => {
      const data = args.data as { items: { create: unknown } } & Record<string, unknown>
      return { id: 'sale-1', ...data, items: data.items.create }
    }) as never)

    const res = await POST(postRequest({
      merchantId: MERCHANT_ID,
      items: [
        { productName: 'Tomates', quantity: 2, unitPrice: 500 },
        { productName: 'Oignons', quantity: 3, unitPrice: 400 },
      ],
      amountReceived: 5000,
      // A tampered client wouldn't normally send this (the schema doesn't
      // even declare the field), but a route bug that read it anyway would
      // pass this test only if it ignored it, so send it to prove it does.
      totalAmount: 1,
    }, 'tok'))

    expect(res.status).toBe(201)
    const createCall = vi.mocked(db.sale.create).mock.calls[0][0] as { data: { totalAmount: number; changeAmount: number } }
    expect(createCall.data.totalAmount).toBe(2 * 500 + 3 * 400)
    expect(createCall.data.changeAmount).toBe(5000 - (2 * 500 + 3 * 400))
  })

  it('returns the existing sale for a repeated clientId instead of creating a duplicate', async () => {
    vi.mocked(db.deviceSession.findUnique).mockResolvedValue({
      subject: `merchant:${MERCHANT_ID}`,
      expiresAt: new Date(Date.now() + 1000_000),
    } as never)
    const existing = { id: 'sale-existing', clientId: 'c1', items: [] }
    vi.mocked(db.sale.findUnique).mockResolvedValue(existing as never)

    const res = await POST(postRequest({
      merchantId: MERCHANT_ID,
      items: [{ productName: 'Tomates', quantity: 1, unitPrice: 500 }],
      clientId: 'c1',
    }, 'tok'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(existing)
    expect(db.sale.create).not.toHaveBeenCalled()
  })
})
