import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// MODE-947 (AUDIT-003 D-3) — route du rapport producteur : auth appareil
// (requireDeviceOwner 400/401/403 AVANT toute lecture), agrégation des
// FAITS serveur (cycles par statut + kg récoltés, récoltes par statut et
// par produit, ventes réalisées = récoltes avec acheteur ET montant),
// base vide = zéros honnêtes.

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: vi.fn(async () => null),
}))

import { requireDeviceOwner } from '@/lib/require-owner'
import { GET } from '../route'

type Row = Record<string, unknown>

interface TableConfig {
  rows?: Row[]
  error?: { code?: string; message?: string } | null
}

const tables = new Map<string, TableConfig>()
const fromMock = vi.fn()
const fromCalls: Array<{ table: string; filters: Array<[string, string]> }> = []

function makeBuilder(config: TableConfig) {
  const filters: Array<[string, string]> = []
  const listPromise = Promise.resolve({ data: config.rows ?? [], error: config.error ?? null })
  const builder: Record<string, unknown> = {
    filters,
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push([col, String(val)])
      return builder
    },
    order: () => builder,
    limit: () => builder,
    then: listPromise.then.bind(listPromise),
    catch: listPromise.catch.bind(listPromise),
  }
  return builder
}

beforeEach(() => {
  tables.clear()
  fromCalls.length = 0
  fromMock.mockReset()
  fromMock.mockImplementation((table: string) => {
    const builder = makeBuilder(tables.get(table) ?? {})
    fromCalls.push({ table, filters: builder.filters as Array<[string, string]> })
    return builder
  })
  vi.mocked(requireDeviceOwner).mockImplementation(async () => null)
})

function getRequest(query = '?producteurId=p1'): NextRequest {
  return new NextRequest(`http://localhost/api/producteur/rapport${query}`)
}

describe('GET /api/producteur/rapport (MODE-947)', () => {
  it('laisse requireDeviceOwner refuser sans identifiant (400)', async () => {
    vi.mocked(requireDeviceOwner).mockImplementation(async () =>
      NextResponse.json({ erreur: 'Identifiant requis' }, { status: 400 })
    )
    const res = await GET(getRequest('?'))
    expect(res.status).toBe(400)
    expect(fromCalls).toHaveLength(0)
  })

  it('refuse une session étrangère (403, avant toute lecture)', async () => {
    vi.mocked(requireDeviceOwner).mockImplementation(async () =>
      NextResponse.json({ erreur: 'Accès refusé à cette ressource' }, { status: 403 })
    )
    const res = await GET(getRequest())
    expect(res.status).toBe(403)
    expect(fromCalls).toHaveLength(0)
  })

  it('filtre cycles et récoltes sur producteur_id', async () => {
    tables.set('legacy_producteur_cycles', { rows: [] })
    tables.set('legacy_producteur_recoltes', { rows: [] })
    await GET(getRequest())
    expect(fromCalls.find((c) => c.table === 'legacy_producteur_cycles')?.filters)
      .toContainEqual(['producteur_id', 'p1'])
    expect(fromCalls.find((c) => c.table === 'legacy_producteur_recoltes')?.filters)
      .toContainEqual(['producteur_id', 'p1'])
  })

  it('agrège les faits : cycles par statut, récoltes par produit, ventes', async () => {
    tables.set('legacy_producteur_cycles', {
      rows: [
        { statut: 'en_cours', quantite_recoltee_kg: null },
        { statut: 'recolte', quantite_recoltee_kg: 120.456 },
      ],
    })
    tables.set('legacy_producteur_recoltes', {
      rows: [
        { statut: 'publiee', produit: 'Manioc', quantite_kg: 50, acheteur: 'Koffi', montant_vente: 30000 },
        { statut: 'publiee', produit: 'Manioc', quantite_kg: 30, acheteur: null, montant_vente: null },
        { statut: 'brouillon', produit: 'Igname', quantite_kg: 15, acheteur: 'Awa', montant_vente: 15000 },
      ],
    })

    const res = await GET(getRequest())
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.cycles.total).toBe(2)
    expect(body.cycles.parStatut).toEqual({ en_cours: 1, recolte: 1 })
    expect(body.cycles.quantiteRecolteeKg).toBe(120.46)

    expect(body.recoltes.total).toBe(3)
    expect(body.recoltes.totalKg).toBe(95)
    // Ventes réalisées = acheteur ET montant connus (pas une estimation).
    expect(body.recoltes.ventesRealisees).toBe(2)
    expect(body.recoltes.montantVentes).toBe(45000)
    expect(body.recoltes.parProduit[0]).toEqual({ nom: 'Manioc', nombreRecoltes: 2, totalKg: 80 })
  })

  it('base vide = zéros honnêtes (jamais de chiffre inventé)', async () => {
    tables.set('legacy_producteur_cycles', { rows: [] })
    tables.set('legacy_producteur_recoltes', { rows: [] })
    const res = await GET(getRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cycles).toEqual({ total: 0, parStatut: {}, quantiteRecolteeKg: 0 })
    expect(body.recoltes).toEqual({
      total: 0, parStatut: {}, totalKg: 0, ventesRealisees: 0, montantVentes: 0, parProduit: [],
    })
  })

  it('une erreur de lecture = 500 parlé', async () => {
    tables.set('legacy_producteur_cycles', { rows: [], error: { code: 'XX000', message: 'boom' } })
    const res = await GET(getRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.erreur).toBe('Rapport indisponible')
  })
})
