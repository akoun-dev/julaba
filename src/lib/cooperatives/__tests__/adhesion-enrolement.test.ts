import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// DET-COOP-007 (MODE-978) — contrat du module d'adhésion automatique à
// l'enrôlement : verdicts honnêtes (creee | deja_membre | deja_actif_ailleurs |
// coop_absente | erreur), JAMAIS d'exception (best-effort non bloquant pour le
// dossier), invariant « une seule adhésion active » respecté (ni réactivation
// d'un exclu, ni transfert silencieux entre coopératives), date d'adhésion
// ISO du jour par défaut.

import { creerAdhesionDepuisEnrolement, type VerdictAdhesionEnrolement } from '../adhesion-enrolement'

type Ligne = { id: string; cooperative_id: string; actif: boolean }

interface MockState {
  coopTrouvee: boolean
  lignes: Ligne[]
  erreurLecture: { message: string; code?: string } | null
  erreurInsert: { message: string; code?: string } | null
  leverException: boolean
}

let state: MockState
let insertCapture: Record<string, unknown> | null

// Client mocké à la main : les deux tables seulement, verdicts configurables.
function makeClient(overrides?: Partial<{ coopNulle: boolean }>) {
  const appelInsert = { row: null as Record<string, unknown> | null }
  const client = {
    from(table: string) {
      if (table === 'cooperatives') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () =>
                  overrides?.coopNulle || !state.coopTrouvee ? { data: null, error: null } : { data: { id: 'coop-1' }, error: null },
              }),
            }),
          }),
        }
      }
      if (table === 'cooperative_membres') {
        return {
          select: () => ({
            eq: async () =>
              state.erreurLecture
                ? { data: null, error: state.erreurLecture }
                : { data: state.lignes, error: null },
          }),
          insert: async (row: Record<string, unknown>) => {
            appelInsert.row = row
            if (state.leverException) throw new Error('boom réseau')
            return { error: state.erreurInsert }
          },
        }
      }
      throw new Error(`table inattendue: ${table}`)
    },
  }
  return { client, appelInsert }
}

beforeEach(() => {
  state = { coopTrouvee: true, lignes: [], erreurLecture: null, erreurInsert: null, leverException: false }
  insertCapture = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

const PARAMS = { cooperativeId: 'coop-1', marchandId: 'marchand-1' }

describe('creerAdhesionDepuisEnrolement', () => {
  it('coopérative inconnue ou inactive → coop_absente, aucune insertion', async () => {
    const { client, appelInsert } = makeClient({ coopNulle: true })
    const verdict = await creerAdhesionDepuisEnrolement(client as never, PARAMS)
    expect(verdict).toBe<VerdictAdhesionEnrolement>('coop_absente')
    expect(appelInsert.row).toBeNull()
  })

  it('chemin heureux → creee avec statut actif, rôle membre, date du jour ISO', async () => {
    const { client, appelInsert } = makeClient()
    const verdict = await creerAdhesionDepuisEnrolement(client as never, PARAMS)
    expect(verdict).toBe<VerdictAdhesionEnrolement>('creee')
    expect(appelInsert.row).toMatchObject({
      cooperative_id: 'coop-1',
      membre_id: 'marchand-1',
      statut: 'actif',
      role: 'membre',
      cotisation_payee: false,
    })
    expect(String((appelInsert.row as Record<string, unknown>).date_adhesion)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('date_adhesion fournie → respectée (rejeu déterministe en test)', async () => {
    const { client, appelInsert } = makeClient()
    const verdict = await creerAdhesionDepuisEnrolement(client as never, { ...PARAMS, dateAdhesion: '2026-09-01' })
    expect(verdict).toBe<VerdictAdhesionEnrolement>('creee')
    expect((appelInsert.row as Record<string, unknown>).date_adhesion).toBe('2026-09-01')
  })

  it.each(['en_attente', 'suspendu', 'exclu'] as const)(
    'adhésion préexistante dans la MÊME coop (%s) → deja_membre, jamais réactivée ni recréée',
    async (statut) => {
      void statut
      state.lignes = [{ id: 'l1', cooperative_id: 'coop-1', actif: false }]
      const { client, appelInsert } = makeClient()
      const verdict = await creerAdhesionDepuisEnrolement(client as never, PARAMS)
      expect(verdict).toBe<VerdictAdhesionEnrolement>('deja_membre')
      expect(appelInsert.row).toBeNull()
    }
  )

  it('adhésion ACTIVE dans une AUTRE coop → deja_actif_ailleurs (invariant une seule adhésion active)', async () => {
    state.lignes = [{ id: 'l1', cooperative_id: 'autre-coop', actif: true }]
    const { client, appelInsert } = makeClient()
    const verdict = await creerAdhesionDepuisEnrolement(client as never, PARAMS)
    expect(verdict).toBe<VerdictAdhesionEnrolement>('deja_actif_ailleurs')
    expect(appelInsert.row).toBeNull()
  })

  it('course d\'insertion (23505) → deja_membre (la contrainte UNIQUE a tranché)', async () => {
    state.erreurInsert = { message: 'duplicate key', code: '23505' }
    const { client } = makeClient()
    const verdict = await creerAdhesionDepuisEnrolement(client as never, PARAMS)
    expect(verdict).toBe<VerdictAdhesionEnrolement>('deja_membre')
  })

  it('erreur SQL générique à l\'insertion → erreur, sans exception propagée', async () => {
    state.erreurInsert = { message: 'contrainte inattendue', code: '42501' }
    const { client } = makeClient()
    const verdict = await creerAdhesionDepuisEnrolement(client as never, PARAMS)
    expect(verdict).toBe<VerdictAdhesionEnrolement>('erreur')
  })

  it('erreur SQL à la lecture des adhésions → erreur (jamais d\'insertion en aveugle)', async () => {
    state.erreurLecture = { message: 'base injoignable' }
    const { client, appelInsert } = makeClient()
    const verdict = await creerAdhesionDepuisEnrolement(client as never, PARAMS)
    expect(verdict).toBe<VerdictAdhesionEnrolement>('erreur')
    expect(appelInsert.row).toBeNull()
  })

  it('exception imprévue → erreur, le dossier d\'enrôlement n\'est JAMAIS bloqué', async () => {
    state.leverException = true
    const { client } = makeClient()
    const verdict = await creerAdhesionDepuisEnrolement(client as never, PARAMS)
    expect(verdict).toBe<VerdictAdhesionEnrolement>('erreur')
  })
})
