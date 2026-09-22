import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// MODE-986 (DET-COOP-003) — contrat HTTP de la cotisation à CANAL :
//   • canal invalide → 400 AVANT garde et lecture (le livre ne devine pas
//     comment l'argent est passé) ;
//   • espèces : voie historique étiquetée (insert canal 'especes', flag
//     membre, idempotences client_id puis annuelle inchangées) ;
//   • keiwa : RPC cooperative_cotiser_keiwa appelé avec les bons arguments
//     (détail + écriture DANS la même transaction SQL côté base) ;
//     SOLDE_INSUFFISANT → 400 lisible sans AUCUNE écriture locale ;
//     COTISATION_DEJA_PAYEE → 409 (course fermée par le RPC sous verrou) ;
//     PAS_MEMBRE_ACTIF → 404 ; rejeu RPC → 200 rejeu sans re-débit.

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock, rpc: rpcMock }),
}))

vi.mock('@/lib/cooperatives/resolver', async () => {
  const { NextResponse } = await import('next/server')
  return {
    requireMembreActif: (...a: unknown[]) => membreActifMock(...a),
    erreurServeur: (scope: string, error: unknown) => {
      console.error(scope, error)
      return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
    },
  }
})

vi.mock('@/lib/loyalty/evaluator', () => ({
  awardLoyaltyForEvent: (...a: unknown[]) => loyaltyMock(...a),
}))

import { POST as POST_COTISATION } from '@/app/api/cooperatives/cotisation/route'

const membreActifMock = vi.fn()
const fromMock = vi.fn()
const rpcMock = vi.fn()
const loyaltyMock = vi.fn()

type Result = { data: unknown; error: { message: string; code?: string } | null }

interface Captured {
  table: string
  selectCols?: string
  eqs: Array<[string, unknown]>
  inserted?: Record<string, unknown>
  updated?: Record<string, unknown>
}
const captured: Captured[] = []
let resultsQueue: Result[] = []

function makeBuilder(table: string) {
  const state: Captured = { table, eqs: [] }
  captured.push(state)
  const b = {} as Record<string, unknown> & {
    then: (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise<unknown>
  }
  b.select = (cols: string) => {
    state.selectCols = cols
    return b
  }
  b.insert = (payload: Record<string, unknown>) => {
    state.inserted = payload
    return b
  }
  b.update = (payload: Record<string, unknown>) => {
    state.updated = payload
    return b
  }
  b.eq = (col: string, val: unknown) => {
    state.eqs.push([col, val])
    return b
  }
  b.gte = (col: string, val: unknown) => {
    state.eqs.push([col, val])
    return b
  }
  b.maybeSingle = async () => resultsQueue.shift() ?? { data: null, error: null }
  b.single = async () => resultsQueue.shift() ?? { data: null, error: null }
  b.then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(resultsQueue.shift() ?? { data: null, error: null }).then(res, rej)
  return b
}
function req(body: unknown): NextRequest {
  return new NextRequest(new Request('http://localhost/api/cooperatives/cotisation', {
    method: 'POST',
    body: JSON.stringify(body),
  }))
}
function gardeOk() {
  membreActifMock.mockResolvedValue({
    ctx: {
      merchantId: 'm1',
      cooperative: { id: 'coop-1', nom: 'Coop Agbo' },
      membre: { id: 'ad1', statut: 'actif', role: 'membre', cotisation_payee: false },
    },
  })
}
/** Lectures de trésorerie du garde HTTP : replay client_id puis règle
 * annuelle — les deux renvoient null par défaut (aucune déjà-là). */
function queueGardeLectures() {
  fromMock.mockImplementation((table: string) => {
    const b = makeBuilder(table)
    if (table === 'cooperative_transactions') {
      resultsQueue.push({ data: null, error: null }) // replay client_id
      resultsQueue.push({ data: null, error: null }) // règle annuelle
    }
    return b
  })
}

beforeEach(() => {
  membreActifMock.mockReset()
  fromMock.mockReset()
  rpcMock.mockReset()
  loyaltyMock.mockReset()
  loyaltyMock.mockResolvedValue(undefined)
  captured.length = 0
  resultsQueue = []
})

describe('POST /api/cooperatives/cotisation — canal (MODE-986)', () => {
  it('400 canal invalide AVANT garde et lecture — jamais de conversion silencieuse', async () => {
    const res = await POST_COTISATION(req({ merchantId: 'm1', montant: 25000, canal: 'orange_money' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.erreur).toContain('Canal invalide')
    expect(membreActifMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('404 lisible sans adhésion active (garde relayée)', async () => {
    membreActifMock.mockResolvedValue({
      erreur: NextResponse.json({ erreur: 'Aucune adhésion active' }, { status: 404 }),
    })
    const res = await POST_COTISATION(req({ merchantId: 'm1', montant: 25000 }))
    expect(res.status).toBe(404)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('422 montant ≠ cotisation annuelle imposée (MODE-935 inchangé)', async () => {
    gardeOk()
    const res = await POST_COTISATION(req({ merchantId: 'm1', montant: 100 }))
    expect(res.status).toBe(422)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('espèces : insert étiqueté canal especes + flag membre + 201', async () => {
    gardeOk()
    fromMock.mockImplementation((table: string) => {
      const b = makeBuilder(table)
      if (table === 'cooperative_transactions') {
        resultsQueue.push({ data: null, error: null }) // replay client_id
        resultsQueue.push({ data: null, error: null }) // règle annuelle
        resultsQueue.push({ data: { id: 'tx-1', statut: 'validee', montant: 25000 }, error: null }) // insert
      }
      return b
    })

    const res = await POST_COTISATION(req({ merchantId: 'm1', montant: 25000, clientId: 'c-1' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.canal).toBe('especes')
    expect(body.cotisationPayee).toBe(true)

    const inserts = captured.filter((c) => c.inserted)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].inserted!.canal).toBe('especes')
    expect(inserts[0].inserted!.statut).toBe('validee')

    const updates = captured.filter((c) => c.updated)
    expect(updates).toHaveLength(1)
    expect(updates[0].updated!.cotisation_payee).toBe(true)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('espèces : rejeu client_id → 200 rejeu, aucun insert ni flag re-touché', async () => {
    gardeOk()
    fromMock.mockImplementation((table: string) => {
      const b = makeBuilder(table)
      if (table === 'cooperative_transactions') {
        resultsQueue.push({ data: { id: 'tx-0', statut: 'validee', montant: 25000 }, error: null })
      }
      return b
    })
    const res = await POST_COTISATION(req({ merchantId: 'm1', montant: 25000, clientId: 'c-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rejeu).toBe(true)
    expect(captured.filter((c) => c.inserted)).toHaveLength(0)
    expect(captured.filter((c) => c.updated)).toHaveLength(0)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('espèces : 409 cotisation de l\u2019année déjà enregistrée', async () => {
    gardeOk()
    fromMock.mockImplementation((table: string) => {
      const b = makeBuilder(table)
      if (table === 'cooperative_transactions') {
        resultsQueue.push({ data: null, error: null }) // replay client_id
        resultsQueue.push({ data: { id: 'tx-9' }, error: null }) // règle annuelle
      }
      return b
    })
    const res = await POST_COTISATION(req({ merchantId: 'm1', montant: 25000, clientId: 'c-1' }))
    expect(res.status).toBe(409)
    expect(captured.filter((c) => c.inserted)).toHaveLength(0)
  })

  it('keiwa : RPC appelé avec les bons arguments, 201, canal keiwa, solde renvoyé', async () => {
    gardeOk()
    queueGardeLectures()
    rpcMock.mockResolvedValue({
      data: { rejeu: false, transaction: { id: 'tx-k1', statut: 'validee' }, soldeKeiwa: 0 },
      error: null,
    })

    const res = await POST_COTISATION(req({ merchantId: 'm1', montant: 25000, clientId: 'c-1', canal: 'keiwa' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.canal).toBe('keiwa')
    expect(body.soldeKeiwa).toBe(0)
    expect(body.cotisationPayee).toBe(true)

    expect(rpcMock).toHaveBeenCalledTimes(1)
    const [fn, args] = rpcMock.mock.calls[0]
    expect(fn).toBe('cooperative_cotiser_keiwa')
    expect(args).toEqual({
      p_cooperative_id: 'coop-1',
      p_marchand_id: 'm1',
      p_montant: 25000,
      p_description: `Cotisation ${new Date().getFullYear()}`,
      p_client_id: 'c-1',
    })
    // AUCUN insert local : l'écriture vit dans le RPC (une seule
    // transaction SQL — débit + écriture ne peuvent pas diverger).
    expect(captured.filter((c) => c.inserted)).toHaveLength(0)
    expect(loyaltyMock).toHaveBeenCalledTimes(1)
  })

  it('keiwa : solde insuffisant → 400 lisible, AUCUNE écriture', async () => {
    gardeOk()
    queueGardeLectures()
    rpcMock.mockResolvedValue({ data: null, error: { message: 'SOLDE_INSUFFISANT' } })

    const res = await POST_COTISATION(req({ merchantId: 'm1', montant: 25000, clientId: 'c-1', canal: 'keiwa' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.erreur).toContain('Solde Keiwa insuffisant')
    expect(captured.filter((c) => c.inserted)).toHaveLength(0)
    expect(loyaltyMock).not.toHaveBeenCalled()
  })

  it('keiwa : course sur la règle annuelle fermée par le RPC → 409', async () => {
    gardeOk()
    queueGardeLectures()
    rpcMock.mockResolvedValue({ data: null, error: { message: 'COTISATION_DEJA_PAYEE' } })

    const res = await POST_COTISATION(req({ merchantId: 'm1', montant: 25000, clientId: 'c-1', canal: 'keiwa' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.erreur).toContain('déjà enregistrée')
  })

  it('keiwa : adhésion disparue entre garde et écriture (I-07) → 404 honnête', async () => {
    gardeOk()
    queueGardeLectures()
    rpcMock.mockResolvedValue({ data: null, error: { message: 'PAS_MEMBRE_ACTIF' } })

    const res = await POST_COTISATION(req({ merchantId: 'm1', montant: 25000, clientId: 'c-1', canal: 'keiwa' }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.erreur).toContain('pas enregistrée')
  })

  it('keiwa : rejeu RPC → 200 rejeu (loyalty ré-attribuée localement, sans re-débit serveur)', async () => {
    gardeOk()
    queueGardeLectures()
    rpcMock.mockResolvedValue({
      data: { rejeu: true, transaction: { id: 'tx-k0' }, soldeKeiwa: 1000 },
      error: null,
    })

    const res = await POST_COTISATION(req({ merchantId: 'm1', montant: 25000, clientId: 'c-1', canal: 'keiwa' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rejeu).toBe(true)
    expect(loyaltyMock).toHaveBeenCalledTimes(1)
  })
})
