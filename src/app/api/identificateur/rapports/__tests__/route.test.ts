import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// IDF-RAP-001 (AUDIT_MATRICE_47_CAS I-03) — contrat de la route rapports de
// l'app identificateur :
//   - lecture gardée par la session appareil (requireDeviceOwner) ;
//   - compteurs du MOIS COURANT sur legacy_bo_enrolments filtré
//     identificateur_id (bornes submitted_at) — total, parStatut, taux ;
//   - route OPTIONNELLE : jamais attendue par l'écran (100 % local).

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: (...a: unknown[]) => ownerMock(...a),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

import { GET } from '../route'

const ownerMock = vi.fn()
const fromMock = vi.fn()

let chain: string[] = []

const URL = 'http://localhost/api/identificateur/rapports?identificateurId=ident-1'

function chaineRapports(rows: Array<{ status: string | null }>, erreur: { message: string } | null = null) {
  chain = []
  fromMock.mockReset().mockReturnValueOnce({
    select: (cols: string) => {
      chain.push(`select:${cols}`)
      return {
        eq: (col: string, val: unknown) => {
          chain.push(`eq:${col}=${val}`)
          return {
            gte: (col2: string, val2: unknown) => {
              chain.push(`gte:${col2}=${val2}`)
              return {
                lt: async (col3: string, val3: unknown) => {
                  chain.push(`lt:${col3}=${val3}`)
                  return { data: rows, error: erreur }
                },
              }
            },
          }
        },
      }
    },
  })
}

beforeEach(() => {
  ownerMock.mockReset().mockResolvedValue(null)
  fromMock.mockReset()
  chain = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/identificateur/rapports', () => {
  it('session appareil refusée → la garde passe, base jamais interrogée', async () => {
    ownerMock.mockResolvedValueOnce(new Response(JSON.stringify({ erreur: 'Session appareil requise' }), { status: 401 }))
    const res = await GET(new NextRequest(URL))
    expect(res.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('agrège les dossiers du mois par statut et calcule le taux d’acceptation', async () => {
    const maintenant = new Date()
    chaineRapports([
      { status: 'valide' },
      { status: 'valide' },
      { status: 'rejete' },
      { status: 'en_attente' },
    ])
    const res = await GET(new NextRequest(URL))
    expect(res.status).toBe(200)
    // Filtre sur le MOIS courant de l'identificateur (bornes submitted_at).
    expect(chain).toEqual([
      'select:status',
      `eq:identificateur_id=ident-1`,
      `gte:submitted_at=${new Date(maintenant.getFullYear(), maintenant.getMonth(), 1).toISOString()}`,
      `lt:submitted_at=${new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1).toISOString()}`,
    ])
    const body = await res.json() as {
      total: number
      mois: number
      annee: number
      parStatut: { en_attente: number; valide: number; rejete: number }
      tauxAcceptation: number
    }
    expect(body.total).toBe(4)
    expect(body.parStatut).toEqual({ en_attente: 1, valide: 2, rejete: 1 })
    expect(body.tauxAcceptation).toBe(67)
    expect(body.mois).toBe(maintenant.getMonth())
    expect(body.annee).toBe(maintenant.getFullYear())
  })

  it('aucun dossier du mois → zéros et taux 0', async () => {
    chaineRapports([])
    const res = await GET(new NextRequest(URL))
    const body = await res.json() as { total: number; parStatut: { valide: number; rejete: number }; tauxAcceptation: number }
    expect(body.total).toBe(0)
    expect(body.parStatut).toEqual({ en_attente: 0, valide: 0, rejete: 0 })
    expect(body.tauxAcceptation).toBe(0)
  })

  it('status null compté en en_attente sans casser', async () => {
    chaineRapports([{ status: null }, { status: 'valide' }])
    const res = await GET(new NextRequest(URL))
    const body = await res.json() as { total: number; parStatut: { en_attente: number; valide: number; rejete: number } }
    expect(body.total).toBe(2)
    expect(body.parStatut.en_attente).toBe(1)
    expect(body.parStatut.valide).toBe(1)
  })

  it('erreur base → 500 uniforme', async () => {
    chaineRapports([], { message: 'base injoignable' })
    const res = await GET(new NextRequest(URL))
    expect(res.status).toBe(500)
    expect((await res.json()).erreur).toBe('Erreur serveur')
  })
})