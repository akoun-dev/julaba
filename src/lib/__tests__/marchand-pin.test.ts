import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// DET-AUTH-001 (MODE-978) — contrat client du changement de PIN marchand :
//   • le serveur reçoit le BRUT (pin + ancienPin — hachage scrypt serveur,
//     MODE-936) via PATCH /api/merchant ;
//   • verdict honnête synced|queued|local_seul|rejet|lost — jamais de
//     succès inventé, jamais de mise en file silencieuse ;
//   • 404 = compte local-seul (chemin biométrique de référence, MODE-934) ;
//   • réseau/5xx/408/429 → file 'merchant-update' (rejeu verbatim
//     existant) ; file pleine → 'lost' assumé.

vi.mock('@/lib/offline-db', () => ({
  queuePendingSync: (...a: unknown[]) => queueMock(...a),
}))

import { changerPinMarchand } from '../marchand-pin'

const queueMock = vi.fn()
const fetchMock = vi.fn()

beforeEach(() => {
  queueMock.mockReset().mockResolvedValue({ ok: true })
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('changerPinMarchand — verdicts (DET-AUTH-001)', () => {
  it('200 → synced, payload brut { phone, authMethod, pin, ancienPin }', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
    const out = await changerPinMarchand('0701020304', '1111', '2222')
    expect(out).toEqual({ statut: 'synced' })
    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).method).toBe('PATCH')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      phone: '0701020304',
      authMethod: 'pin',
      pin: '2222',
      ancienPin: '1111',
    })
  })

  it('403 (ancien code refusé par le SERVEUR) → rejet, raison serveur traversée', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Code actuel incorrect' }), { status: 403 }))
    const out = await changerPinMarchand('0701020304', '1111', '2222')
    expect(out).toEqual({ statut: 'rejet', raison: 'Code actuel incorrect' })
  })

  it('404 (compte enregistré localement seulement) → local_seul, JAMAIS une erreur', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Marchand non trouvé' }), { status: 404 }))
    const out = await changerPinMarchand('0701020304', '1111', '2222')
    expect(out).toEqual({ statut: 'local_seul' })
  })

  it('4xx définitif (400) → rejet, SANS mise en file', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Aucun champ à mettre à jour' }), { status: 400 }))
    const out = await changerPinMarchand('0701020304', '1111', '2222')
    expect(out.statut).toBe('rejet')
    expect(queueMock).not.toHaveBeenCalled()
  })

  it('500 → mise en file merchant-update (rejeu verbatim), verdict queued', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }))
    const out = await changerPinMarchand('0701020304', '1111', '2222')
    expect(out).toEqual({ statut: 'queued' })
    expect(queueMock).toHaveBeenCalledWith('merchant-update', {
      phone: '0701020304',
      authMethod: 'pin',
      pin: '2222',
      ancienPin: '1111',
    })
  })

  it('429 (transient) → mise en file, comme le contrat jsonRequest', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429 }))
    const out = await changerPinMarchand('0701020304', '1111', '2222')
    expect(out).toEqual({ statut: 'queued' })
  })

  it('réseau indisponible → queued (le changement partira à la reconnexion)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    const out = await changerPinMarchand('0701020304', '1111', '2222')
    expect(out).toEqual({ statut: 'queued' })
  })

  it('réseau indisponible ET file indisponible → lost assumé avec raison parlée', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    queueMock.mockResolvedValueOnce({ ok: false })
    const out = await changerPinMarchand('0701020304', '1111', '2222')
    expect(out.statut).toBe('lost')
    expect((out as { raison: string }).raison).toContain('Hors ligne')
  })
})
