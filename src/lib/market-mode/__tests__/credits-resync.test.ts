import { beforeEach, describe, expect, it, vi } from 'vitest'

// MODE-940 (AUDIT-003 F-11) — resyncFromServer : le grand livre de crédit
// SERVEUR est relu et fusionné doucement dans le store local (fin de la
// dérive multi-appareils). Règles testées :
//  • partenaire inconnu → ajouté (jamais de perte) ;
//  • partenaire connu → le SERVEUR fait foi sur le solde (le grand livre
//    RPC est la seule autorité), les champs appareil restent locaux ;
//  • op inconnue (autre appareil) → ajoutée au journal SANS
//    balanceAfterCfa — le solde après-coup d'un autre appareil n'est pas
//    inventé ;
//  • op déjà connue → jamais dupliquée ;
//  • échec réseau → { ok:false }, l'état local reste intact.

const fetchMock = vi.fn()

vi.stubGlobal('fetch', fetchMock)

import { useCreditsStore } from '../credits-store'

function resetStore() {
  useCreditsStore.setState({ partners: {}, ops: [] })
  fetchMock.mockReset()
}

describe('credits-store — resyncFromServer (MODE-940, F-11)', () => {
  beforeEach(() => {
    resetStore()
  })

  it('ajoute les partenaires/op serveurs inconnus sans jamais inventer de balanceAfterCfa', async () => {
    // Partenaire local existant (créé sur CET appareil).
    useCreditsStore.setState({
      partners: {
        'partner-local': {
          clientId: 'partner-local',
          kind: 'client',
          name: 'Adjoua',
          balanceCfa: 2000,
          location: 'Abidjan',
          createdAt: 1_000,
          updatedAt: 5_000,
        },
      },
      ops: [
        {
          clientId: 'op-locale-1',
          kind: 'credit',
          partnerClientId: 'partner-local',
          partnerName: 'Adjoua',
          amountCfa: 2000,
          balanceAfterCfa: 2000,
          createdAt: 5_000,
        },
      ],
    })

    fetchMock.mockImplementation((url: string) => {
      if (url.includes('kind=client')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            partners: [
              {
                id: 'uuid-serv-1',
                clientId: 'partner-serveur',
                kind: 'client',
                name: 'Koffi (autre appareil)',
                balanceCfa: 7500,
                createdAt: '2026-09-21T08:00:00Z',
                updatedAt: '2026-09-21T09:00:00Z',
              },
              {
                id: 'uuid-serv-1', // même partenaire que ci-dessus
                clientId: 'partner-local',
                kind: 'client',
                name: 'Adjoua (serveur)',
                balanceCfa: 12000, // le serveur fait foi
                createdAt: '2026-09-21T08:00:00Z',
                updatedAt: '2026-09-21T10:00:00Z',
              },
            ],
          }),
        })
      }
      if (url.includes('kind=fournisseur')) {
        return Promise.resolve({ ok: true, json: async () => ({ partners: [] }) })
      }
      if (url.includes('credit-ops')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ops: [
              {
                operationId: 'op-serveur-1',
                kind: 'credit',
                partnerId: 'uuid-serv-1',
                partnerName: 'Adjoua (serveur)',
                amountCfa: 10000,
                createdAt: '2026-09-21T10:00:00Z',
              },
              {
                operationId: 'op-locale-1', // déjà connue localement
                kind: 'credit',
                partnerId: 'uuid-serv-1',
                partnerName: 'Adjoua',
                amountCfa: 2000,
                createdAt: '2026-09-21T09:00:00Z',
              },
            ],
          }),
        })
      }
      return Promise.resolve({ ok: false })
    })

    const r = await useCreditsStore.getState().resyncFromServer('marchand-1')
    expect(r.ok).toBe(true)
    expect(r.partnersMerged).toBe(2)
    expect(r.opsMerged).toBe(1) // op-serveur-1 seulement

    const { partners, ops } = useCreditsStore.getState()
    // Partenaire inconnu → ajouté tel quel.
    expect(partners['partner-serveur'].balanceCfa).toBe(7500)
    expect(partners['partner-serveur'].name).toBe('Koffi (autre appareil)')
    // Partenaire connu → solde SERVEUR adopté, champ appareil conservé.
    expect(partners['partner-local'].balanceCfa).toBe(12000)
    expect(partners['partner-local'].location).toBe('Abidjan')
    // Journal : 2 ops, l'op serveur n'a PAS de balanceAfterCfa inventé.
    expect(ops.length).toBe(2)
    const serveur = ops.find((o) => o.clientId === 'op-serveur-1')
    expect(serveur).toBeDefined()
    expect(serveur?.balanceAfterCfa).toBeUndefined()
    expect(serveur?.partnerClientId).toBe('partner-local') // rattachée via id→clientId
    expect(ops[0].createdAt).toBeGreaterThanOrEqual(ops[1].createdAt) // tri desc
  })

  it('échec réseau : { ok:false } et l\u2019état local reste intact', async () => {
    useCreditsStore.setState({
      partners: {
        'partner-local': {
          clientId: 'partner-local',
          kind: 'client',
          name: 'Adjoua',
          balanceCfa: 2000,
          createdAt: 1,
          updatedAt: 1,
        },
      },
      ops: [],
    })
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('offline')))
    const r = await useCreditsStore.getState().resyncFromServer('marchand-1')
    expect(r.ok).toBe(false)
    expect(useCreditsStore.getState().partners['partner-local'].balanceCfa).toBe(2000)
    expect(useCreditsStore.getState().ops.length).toBe(0)
  })
})
