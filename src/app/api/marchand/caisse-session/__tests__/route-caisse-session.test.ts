import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// MODE-984 (AUDIT-008 P2) — route caisse-session : contrat strict des
// montants (POST fondDeCaisse, PATCH countedCash) identique à l'UI —
// entier >= 0 plafonné, garbage refusé 400 (fin du ignore-silencieux),
// PATCH sans countedCash ferme quand même la session (estimation).

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: vi.fn(async () => null),
}))

import { requireDeviceOwner } from '@/lib/require-owner'
import { PATCH, POST } from '../route'

type Row = Record<string, unknown>

const SESSION_ROW: Row = {
  id: 's-1', merchant_id: 'm-1', fond_de_caisse: 5000, is_open: false,
  opened_at: '2026-09-23T08:00:00Z', closed_at: '2026-09-23T20:00:00Z', total_final: 23400,
}

const builders: Array<Record<string, unknown>> = []
const fromMock = vi.fn()
let dernierBuilder: Record<string, unknown> | null = null

function makeBuilder(result: { data?: Row | null; error?: unknown } = {}) {
  const promise = Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    update: (update: Row) => { builder.__update = update; return builder },
    insert: (row: Row) => { builder.__insert = row; return builder },
    maybeSingle: () => promise,
    single: () => promise,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  }
  return builder
}

beforeEach(() => {
  builders.length = 0
  dernierBuilder = null
  fromMock.mockReset()
  fromMock.mockImplementation(() => {
    dernierBuilder = makeBuilder(builders.shift())
    return dernierBuilder
  })
  vi.mocked(requireDeviceOwner).mockImplementation(async () => null)
})

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/marchand/caisse-session', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/marchand/caisse-session', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/marchand/caisse-session — fond strict', () => {
  it.each([
    ['texte mélangé', '1000abc'],
    ['string numérique (pas de coercion)', '1000'],
    ['décimale', 12.5],
    ['négatif', -1],
    ['plafond dépassé', 1_000_000_000],
    ['undefined', undefined],
  ])('refuse 400 un fond %s', async (_label, fond) => {
    const res = await POST(postRequest({ merchantId: 'm-1', fondDeCaisse: fond }))
    expect(res.status).toBe(400)
  })

  it("accepte un fond entier valide et l'insère tel quel", async () => {
    builders.push({}, { data: SESSION_ROW }) // 1er appel : existing check (vide) ; 2e : insert
    const res = await POST(postRequest({ merchantId: 'm-1', fondDeCaisse: 5000 }))
    expect(res.status).toBe(201)
  })
})

describe('PATCH /api/marchand/caisse-session — countedCash strict', () => {
  it('refuse 400 un countedCash invalide explicite (garbage jamais ignoré)', async () => {
    for (const countedCash of ['1000abc', 12.5, -5, 1_000_000_000]) {
      const res = await PATCH(patchRequest({ merchantId: 'm-1', sessionId: 's-1', countedCash }))
      expect(res.status).toBe(400)
    }
  })

  it('met total_final à jour quand countedCash est valide', async () => {
    builders.push({ data: SESSION_ROW })
    const res = await PATCH(patchRequest({ merchantId: 'm-1', sessionId: 's-1', countedCash: 23400 }))
    expect(res.status).toBe(200)
    const update = ((dernierBuilder as Record<string, unknown> | null)?.__update ?? {}) as Row
    expect(update.is_open).toBe(false)
    expect(update.total_final).toBe(23400)
  })

  it('ferme SANS total_final quand countedCash est absent (estimation)', async () => {
    builders.push({ data: SESSION_ROW })
    const res = await PATCH(patchRequest({ merchantId: 'm-1', sessionId: 's-1' }))
    expect(res.status).toBe(200)
    const update = ((dernierBuilder as Record<string, unknown> | null)?.__update ?? {}) as Row
    expect(update.is_open).toBe(false)
    expect('total_final' in update).toBe(false)
  })

  // MODE-984 (AUDIT-008 P1) — JAMAIS de faux succès générique : la réponse
  // distingue closed / already_closed (idempotent) / no_session (404).
  it('répond statut already_closed quand la session existait mais était déjà fermée', async () => {
    builders.push({ data: null }, { data: { ...SESSION_ROW, is_open: false } }) // update sans effet ; select existante
    const res = await PATCH(patchRequest({ merchantId: 'm-1', sessionId: 's-1', countedCash: 1000 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.statut).toBe('already_closed')
    expect(body.session.id).toBe('s-1')
  })

  it('répond 404 no_session quand la session est inconnue (ou étrangère)', async () => {
    builders.push({ data: null }, { data: null })
    const res = await PATCH(patchRequest({ merchantId: 'm-1', sessionId: 'inconnue', countedCash: 1000 }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.statut).toBe('no_session')
    expect(body.erreur).toBe('Session inconnue')
  })
})
