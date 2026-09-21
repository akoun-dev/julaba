import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// MODE-946 (AUDIT-003 D-2, DET-COOP-010) — contrat du tableau coopératif
// BO : garde permission 'dashboard:read', faits agrégés (coopératives
// actives/inactives, membres actifs via COUNT exact, trésorerie avec la
// MÊME sémantique que l'agrégat unique MODE-935, besoins par statut de la
// machine réelle), statut inconnu ignoré (jamais compté nulle part).

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/backoffice-auth', () => ({
  requireBackofficePermission: vi.fn(async () => null),
}))

import { requireBackofficePermission } from '@/lib/backoffice-auth'
import { GET } from '../route'

type Row = Record<string, unknown>

interface TableConfig {
  rows?: Row[]
  count?: number | null
  error?: { code?: string; message?: string } | null
}

const tables = new Map<string, TableConfig>()
const fromMock = vi.fn()
const fromCalls: Array<{ table: string; filters: Array<[string, string]> }> = []

function makeBuilder(config: TableConfig) {
  const filters: Array<[string, string]> = []
  const result = {
    data: config.rows ?? [],
    error: config.error ?? null,
    count: config.count ?? null,
  }
  const builder: Record<string, unknown> = {
    filters,
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push([col, String(val)])
      return builder
    },
    then: Promise.resolve(result).then.bind(Promise.resolve(result)),
    catch: Promise.resolve(result).catch.bind(Promise.resolve(result)),
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
  vi.mocked(requireBackofficePermission).mockImplementation(async () => null as never)
})

function getRequest(): NextRequest {
  return new NextRequest('http://localhost/api/backoffice/cooperatives/stats')
}

describe('GET /api/backoffice/cooperatives/stats (MODE-946)', () => {
  it('refuse sans permission dashboard:read (garde BO avant toute lecture)', async () => {
    vi.mocked(requireBackofficePermission).mockImplementation(async () =>
      NextResponse.json({ erreur: 'Accès refusé' }, { status: 403 })
    )
    const res = await GET(getRequest())
    expect(res.status).toBe(403)
    expect(fromCalls).toHaveLength(0)
  })

  it('agrège les faits : coops actives, membres actifs (COUNT), trésorerie, besoins', async () => {
    tables.set('cooperatives', {
      rows: [
        { id: 'c1', actif: true },
        { id: 'c2', actif: true },
        { id: 'c3', actif: false },
      ],
    })
    tables.set('cooperative_membres', { count: 12 })
    tables.set('cooperative_transactions', {
      rows: [
        { type: 'entree', categorie: 'cotisation', montant: 25000 },
        { type: 'entree', categorie: 'vente', montant: 5000 },
        { type: 'sortie', categorie: 'achat', montant: 10000 },
      ],
    })
    tables.set('cooperative_besoins', {
      rows: [{ statut: 'en_attente' }, { statut: 'en_attente' }, { statut: 'en_cours' }, { statut: 'livre' }],
    })

    const res = await GET(getRequest())
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.cooperatives).toEqual({ actives: 2, inactives: 1 })
    expect(body.membresActifs).toBe(12)
    // Trésorerie = sémantique agrégat unique : 25000+5000-10000 = 20000,
    // cotisations = 25000.
    expect(body.tresorerie).toEqual({ solde: 20000, totalCotisations: 25000 })
    expect(body.besoins).toEqual({ en_attente: 2, consolide: 0, en_cours: 1, livre: 1 })
    expect(typeof body.generatedAt).toBe('string')
  })

  it('filtre la trésorerie sur les écritures validées uniquement', async () => {
    tables.set('cooperatives', { rows: [] })
    tables.set('cooperative_membres', { count: 0 })
    tables.set('cooperative_transactions', { rows: [] })
    tables.set('cooperative_besoins', { rows: [] })
    await GET(getRequest())
    const tx = fromCalls.find((c) => c.table === 'cooperative_transactions')
    expect(tx?.filters).toContainEqual(['statut', 'validee'])
  })

  it('base vide = zéros honnêtes (jamais de chiffre inventé)', async () => {
    tables.set('cooperatives', { rows: [] })
    tables.set('cooperative_membres', { count: null })
    tables.set('cooperative_transactions', { rows: [] })
    tables.set('cooperative_besoins', { rows: [] })
    const res = await GET(getRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cooperatives).toEqual({ actives: 0, inactives: 0 })
    expect(body.membresActifs).toBe(0)
    expect(body.tresorerie).toEqual({ solde: 0, totalCotisations: 0 })
    expect(body.besoins).toEqual({ en_attente: 0, consolide: 0, en_cours: 0, livre: 0 })
  })

  it('une erreur de lecture = 500 parlé (pas de silhouette vide)', async () => {
    tables.set('cooperatives', { rows: [], error: { code: 'XX000', message: 'boom' } })
    const res = await GET(getRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.erreur).toBe('Statistiques coopératives indisponibles')
  })
})
