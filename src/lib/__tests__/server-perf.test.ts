import { describe, expect, it } from 'vitest'
import { NextResponse } from 'next/server'
import {
  attachServerTiming,
  startServerTiming,
  withServerTiming,
} from '../server-perf'

describe('attachServerTiming — réponse Server-Timing (I-04)', () => {
  it("accumule plusieurs entrées sur le même en-tête avec ', '", () => {
    const resp = NextResponse.json({ ok: true })
    const t0 = startServerTiming()
    const once = attachServerTiming(resp, 'sale', t0)
    const twice = attachServerTiming(once, 'expense', t0)

    const header = twice.headers.get('server-timing') ?? ''
    const entries = header.split(', ').map((e) => e.trim())
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatch(/^sale;dur=\d+$/)
    expect(entries[1]).toMatch(/^expense;dur=\d+$/)
  })

  it('pose une valeur arrondie et positive', () => {
    const resp = NextResponse.json({ ok: true })
    const t0 = startServerTiming()
    const timed = attachServerTiming(resp, 'caisse-session-open', t0)

    const header = timed.headers.get('server-timing') ?? ''
    const dur = Number(header.match(/dur=(\d+)/)?.[1] ?? '')
    expect(Number.isInteger(dur)).toBe(true)
    expect(dur).toBeGreaterThanOrEqual(0)
  })

  it('préserve le statut, le statut texte et le corps JSON', async () => {
    const resp = NextResponse.json({ ok: true, id: 'v-1' }, { status: 201 })
    const timed = attachServerTiming(resp, 'sale', startServerTiming())

    expect(timed.status).toBe(201)
    expect(timed.headers.get('server-timing')).toMatch(/^sale;dur=\d+$/)
    await expect(timed.json()).resolves.toEqual({ ok: true, id: 'v-1' })
  })
})

describe('withServerTiming — commodité (I-04)', () => {
  it('attache l’en-tête sur le NextResponse retourné par fn', async () => {
    const res = await withServerTiming('sale', async () =>
      NextResponse.json({ ok: true }),
    )
    expect(res.headers.get('server-timing')).toMatch(/^sale;dur=\d+$/)
    await expect(res.json()).resolves.toEqual({ ok: true })
  })

  it('laisse intact un résultat qui n’est pas un NextResponse', async () => {
    const value = await withServerTiming('sale', async () => 42)
    expect(value).toBe(42)
  })
})