import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// MODE-982 (DET-COOP-011) — contrat de « Notifier un membre » :
// garde président (session appareil + coopérative résolue serveur),
// le membreId est VÉRIFIÉ appartenir à CETTE coopérative (pas de
// notification forgée hors coop), message borné 3-200, notification
// 'cooperative_info' adressée au MARCHAND (membre_id de l'adhésion).

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: (...a: unknown[]) => ownerMock(...a),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/notifications/server', () => ({
  createNotification: (...a: unknown[]) => notifierMock(...a),
}))

import { POST } from '../route'

const ownerMock = vi.fn()
const fromMock = vi.fn()
const notifierMock = vi.fn()

function requete(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/cooperatives/membres/notifier', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  ownerMock.mockReset()
  fromMock.mockReset()
  notifierMock.mockReset()
  notifierMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Chaîne du résolveur président (cooperatives select → eq → maybeSingle). */
function chainePresident(coop: Record<string, unknown> | null) {
  fromMock.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: coop, error: null }),
      }),
    }),
  })
}

/** Chaîne supabase du lookup d'adhésion (select → eq ×2 → maybeSingle). */
function chaineAdhesion(adhesion: { id: string; membre_id: string } | null, erreur: { message: string } | null = null) {
  fromMock.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: adhesion, error: erreur }),
        }),
      }),
    }),
  })
}

describe('POST /api/cooperatives/membres/notifier', () => {
  const COOP = { id: 'coop-1', nom: 'Coop Bouaké', commune: null, commune_id: null, responsable_id: 'pres-1', actif: true }

  it('sans session président → 401 relayé, aucune requête ni notification', async () => {
    ownerMock.mockResolvedValueOnce(new Response(JSON.stringify({ erreur: 'Session requise' }), { status: 401 }))
    const res = await POST(requete({ cooperateurId: 'pres-1', membreId: 'adh-1', message: 'Bonjour la coop' }))
    expect(res.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
    expect(notifierMock).not.toHaveBeenCalled()
  })

  it('message trop court → 400 AVANT tout lookup ni envoi', async () => {
    ownerMock.mockResolvedValueOnce(null)
    chainePresident(COOP)
    const res = await POST(requete({ cooperateurId: 'pres-1', membreId: 'adh-1', message: 'hi' }))
    expect(res.status).toBe(400)
    expect(fromMock).toHaveBeenCalledTimes(1)
    expect(notifierMock).not.toHaveBeenCalled()
  })

  it('message trop long (>200) → 400', async () => {
    ownerMock.mockResolvedValueOnce(null)
    chainePresident(COOP)
    const res = await POST(requete({ cooperateurId: 'pres-1', membreId: 'adh-1', message: 'x'.repeat(201) }))
    expect(res.status).toBe(400)
    expect(notifierMock).not.toHaveBeenCalled()
  })

  it("adhésion hors coopérative → 404, ZÉRO notification (pas de forge d'id)", async () => {
    ownerMock.mockResolvedValueOnce(null)
    chainePresident(COOP)
    chaineAdhesion(null)
    const res = await POST(requete({ cooperateurId: 'pres-1', membreId: 'adh-inconnu', message: 'Assemblée samedi 9 h' }))
    expect(res.status).toBe(404)
    expect(notifierMock).not.toHaveBeenCalled()
  })

  it("succès → notification au MARCHAND de l'adhésion, titre signé coop, message TRIMMÉ", async () => {
    ownerMock.mockResolvedValueOnce(null)
    chainePresident(COOP)
    chaineAdhesion({ id: 'adh-1', membre_id: 'march-9' })
    const res = await POST(requete({ cooperateurId: 'pres-1', membreId: 'adh-1', message: '  Assemblée générale samedi à 9 h  ' }))
    expect(res.status).toBe(200)
    expect(notifierMock).toHaveBeenCalledTimes(1)
    const options = notifierMock.mock.calls[0][0] as Record<string, unknown>
    expect(options.subjectType).toBe('merchant')
    expect(options.subjectId).toBe('march-9')
    expect(options.type).toBe('cooperative_info')
    expect(options.title).toBe('Message de Coop Bouaké')
    expect(options.body).toBe('Assemblée générale samedi à 9 h')
  })

  it('erreur base au lookup → 500 uniforme, aucune notification', async () => {
    ownerMock.mockResolvedValueOnce(null)
    chainePresident(COOP)
    chaineAdhesion(null, { message: 'base injoignable' })
    const res = await POST(requete({ cooperateurId: 'pres-1', membreId: 'adh-1', message: 'Message de test' }))
    expect(res.status).toBe(500)
    expect(notifierMock).not.toHaveBeenCalled()
  })
})
