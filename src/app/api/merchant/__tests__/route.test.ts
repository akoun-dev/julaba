import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// DET-AUTH-001 (MODE-978) — contrat serveur du PATCH /api/merchant :
//   • ancienPin fourni (changement volontaire depuis le profil) → VÉRIFIÉ
//     contre le hash scrypt serveur AVANT écriture — 403 si faux, aucune
//     mise à jour (un cache local périmé ne peut plus faire croire à un
//     changement appliqué partout) ;
//   • ancienPin absent (récupération biométrique — identité prouvée par
//     la biométrie) → chemin inchangé ;
//   • hash scrypt SERVEUR (MODE-936) : le brut ne se stocke jamais ;
//   • gardes inchangées : session appareil requise, sujet = compte visé.

vi.mock('@/lib/device-session', () => ({
  getDeviceSubject: (...a: unknown[]) => subjectMock(...a),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

import { PATCH } from '../route'

const subjectMock = vi.fn()
const fromMock = vi.fn()

// Le hash scrypt réel de '1111' (même format que hashCodeScrypt).
import { hashCodeScrypt } from '@/lib/auth-pin'
const HASH_ANCIEN = hashCodeScrypt('1111')
const HASH_BIOMETRIE = hashCodeScrypt('9999')

function chaineMarchand(existant: Record<string, unknown> | null, erreurFind: { message: string } | null = null) {
  let updateCapture: Record<string, unknown> | null = null
  fromMock.mockImplementation((table: string) => {
    expect(table).toBe('merchants')
    return {
      select: () => ({
        eq: () => ({
          single: async () => ({ data: existant, error: erreurFind }),
        }),
      }),
      update: (row: Record<string, unknown>) => ({
        eq: () => ({
          select: () => ({
            single: async () => {
              updateCapture = row
              return { data: { id: 'm-1', phone: '0701020304' }, error: null }
            },
          }),
        }),
      }),
    }
  })
  return { lireUpdate: () => updateCapture }
}

function requete(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/merchant', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  subjectMock.mockReset().mockReturnValue(null)
  fromMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

const COMPTE = {
  id: 'm-1',
  phone: '0701020304',
  pin_hash: HASH_ANCIEN,
  auth_method: 'pin',
}

describe('PATCH /api/merchant — vérification de l\u2019ancien code (DET-AUTH-001)', () => {
  it('ancienPin correct + nouveau brut → 200, hash scrypt RÉÉCRIT (≠ ancien, jamais le brut)', async () => {
    subjectMock.mockResolvedValueOnce('merchant:m-1')
    const { lireUpdate } = chaineMarchand(COMPTE)
    const res = await PATCH(requete({ phone: '0701020304', authMethod: 'pin', pin: '2222', ancienPin: '1111' }))
    expect(res.status).toBe(200)
    const update = lireUpdate() as Record<string, unknown>
    expect(typeof update.pin_hash).toBe('string')
    expect(update.pin_hash).not.toBe('2222')
    expect(update.pin_hash).not.toBe(HASH_ANCIEN)
  })

  it('ancienPin FAUX → 403 « Code actuel incorrect », AUCUNE écriture', async () => {
    subjectMock.mockResolvedValueOnce('merchant:m-1')
    const { lireUpdate } = chaineMarchand(COMPTE)
    const res = await PATCH(requete({ phone: '0701020304', authMethod: 'pin', pin: '2222', ancienPin: '0000' }))
    expect(res.status).toBe(403)
    expect(lireUpdate()).toBeNull()
  })

  it('ancienPin fourni mais compte SANS pin_hash → 403, aucune écriture', async () => {
    subjectMock.mockResolvedValueOnce('merchant:m-1')
    const { lireUpdate } = chaineMarchand({ ...COMPTE, pin_hash: null })
    const res = await PATCH(requete({ phone: '0701020304', authMethod: 'pin', pin: '2222', ancienPin: '1111' }))
    expect(res.status).toBe(403)
    expect(lireUpdate()).toBeNull()
  })

  it('ancienPin ABSENT (récupération biométrique) → chemin inchangé, mise à jour appliquée', async () => {
    subjectMock.mockResolvedValueOnce('merchant:m-1')
    const { lireUpdate } = chaineMarchand({ ...COMPTE, pin_hash: HASH_BIOMETRIE })
    const res = await PATCH(requete({ phone: '0701020304', authMethod: 'pin', pin: '2222' }))
    expect(res.status).toBe(200)
    const update = lireUpdate() as Record<string, unknown>
    expect(update.pin_hash).not.toBe(HASH_BIOMETRIE)
  })

  it('ancienPin VIDE (chaîne) = non fourni → chemin biométrique inchangé', async () => {
    subjectMock.mockResolvedValueOnce('merchant:m-1')
    const { lireUpdate } = chaineMarchand({ ...COMPTE, pin_hash: HASH_BIOMETRIE })
    const res = await PATCH(requete({ phone: '0701020304', authMethod: 'pin', pin: '2222', ancienPin: '' }))
    expect(res.status).toBe(200)
    expect(lireUpdate()).not.toBeNull()
  })
})

describe('PATCH /api/merchant — gardes inchangées', () => {
  it('sans session appareil → 401', async () => {
    subjectMock.mockResolvedValueOnce(null)
    chaineMarchand(COMPTE)
    const res = await PATCH(requete({ phone: '0701020304', pin: '2222' }))
    expect(res.status).toBe(401)
  })

  it('session d\u2019un AUTRE compte → 403', async () => {
    subjectMock.mockResolvedValueOnce('merchant:m-autre')
    chaineMarchand(COMPTE)
    const res = await PATCH(requete({ phone: '0701020304', pin: '2222' }))
    expect(res.status).toBe(403)
  })

  it('compte inconnu → 404', async () => {
    subjectMock.mockResolvedValueOnce('merchant:m-1')
    chaineMarchand(null, { message: 'not found' })
    const res = await PATCH(requete({ phone: '0000000000', pin: '2222' }))
    expect(res.status).toBe(404)
  })

  it('sans champ à mettre à jour → 400', async () => {
    subjectMock.mockResolvedValueOnce('merchant:m-1')
    chaineMarchand(COMPTE)
    const res = await PATCH(requete({ phone: '0701020304' }))
    expect(res.status).toBe(400)
  })
})
