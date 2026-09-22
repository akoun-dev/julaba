import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MODE-985 (DET-COOP-011 tranche 2) — contrat client du choix de commune
// du MARCHAND (miroir marchand-pin / producteur-commune) :
//   • PATCH /api/marchand/profil/commune?marchandId=… + body AUTOPORTEUR
//     { marchandId, communeId } (le rejeu reconstruit l'URL exacte) ;
//   • verdict honnête synced|queued|rejet|lost — jamais de succès inventé ;
//   • 4xx définitif (400 commune inconnue, 403, 404) → rejet SANS file ;
//   • réseau/5xx/408/429 → file 'marchand-commune' (handler verbatim) ;
//   • file pleine → 'lost' assumé (le choix n'existe nulle part).

vi.mock('@/lib/offline-db', () => ({
  queuePendingSync: (...a: unknown[]) => queueMock(...a),
}))

import { choisirCommuneMarchand } from '../marchand-commune'

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

const MARCHE = '/api/marchand/profil/commune?marchandId=m1'

describe('choisirCommuneMarchand — verdicts (MODE-985)', () => {
  it('200 → synced, PATCH avec QUERY ?marchandId= et body autopporteur', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
    const out = await choisirCommuneMarchand('m1', 'com-1')
    expect(out).toEqual({ statut: 'synced' })
    expect(fetchMock.mock.calls[0][0]).toBe(MARCHE)
    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).method).toBe('PATCH')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ marchandId: 'm1', communeId: 'com-1' })
    expect(queueMock).not.toHaveBeenCalled()
  })

  it('400 (commune inconnue) → rejet, raison serveur traversée, SANS mise en file', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ erreur: 'Commune inconnue — choisissez une commune du référentiel' }), { status: 400 })
    )
    const out = await choisirCommuneMarchand('m1', 'com-x')
    expect(out).toEqual({ statut: 'rejet', raison: 'Commune inconnue — choisissez une commune du référentiel' })
    expect(queueMock).not.toHaveBeenCalled()
  })

  it('403/404 → rejet (mauvais royaume / compte inconnu), jamais une file', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }))
    expect(await choisirCommuneMarchand('m1', 'com-1')).toEqual({ statut: 'rejet', raison: 'Refus du serveur (403)' })
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }))
    expect(await choisirCommuneMarchand('m1', 'com-1')).toEqual({ statut: 'rejet', raison: 'Refus du serveur (404)' })
    expect(queueMock).not.toHaveBeenCalled()
  })

  it('500 → mise en file marchand-commune (payload autopporteur), verdict queued', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }))
    const out = await choisirCommuneMarchand('m1', 'com-1')
    expect(out).toEqual({ statut: 'queued' })
    expect(queueMock).toHaveBeenCalledWith('marchand-commune', { marchandId: 'm1', communeId: 'com-1' })
  })

  it('réseau indisponible + file OK → queued', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down'))
    const out = await choisirCommuneMarchand('m1', 'com-1')
    expect(out).toEqual({ statut: 'queued' })
    expect(queueMock).toHaveBeenCalledWith('marchand-commune', { marchandId: 'm1', communeId: 'com-1' })
  })

  it('réseau indisponible + file pleine → lost assumé (le choix n\'existe nulle part)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down'))
    queueMock.mockResolvedValueOnce({ ok: false })
    const out = await choisirCommuneMarchand('m1', 'com-1')
    expect(out).toEqual({
      statut: 'lost',
      raison: 'Hors ligne et mise en file impossible — stockage local indisponible.',
    })
  })

  it('500 + file pleine → lost assumé (jamais de queued mensonger)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }))
    queueMock.mockResolvedValueOnce({ ok: false })
    const out = await choisirCommuneMarchand('m1', 'com-1')
    expect(out).toEqual({
      statut: 'lost',
      raison: 'Serveur momentanément indisponible et mise en file impossible.',
    })
  })
})
