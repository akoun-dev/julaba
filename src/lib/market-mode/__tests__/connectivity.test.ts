import { describe, it, expect } from 'vitest'
import { buildConnectivityView } from '../connectivity'

// MODE-904 (§34) — indicateur de connectivité discret. Règle absolue du
// cahier des charges : « Ne pas présenter l'offline comme une erreur » —
// l'état hors connexion est un état de travail normal, libellé neutre,
// jamais un ton d'alerte. Quatre états : offline, syncing, pending, synced.

describe('buildConnectivityView (§34)', () => {
  it('hors connexion sans file : « Hors connexion », aucun détail', () => {
    expect(buildConnectivityView(false, 0, false)).toEqual({
      state: 'offline',
      label: 'Hors connexion',
      detail: null,
    })
  })

  it('hors connexion avec file : détail « N opérations en attente » (pluriel)', () => {
    expect(buildConnectivityView(false, 3, false)).toEqual({
      state: 'offline',
      label: 'Hors connexion',
      detail: '3 opérations en attente',
    })
    expect(buildConnectivityView(false, 1, false).detail).toBe('1 opération en attente')
  })

  it('la synchronisation en cours est PRIORITAIRE (état syncing)', () => {
    expect(buildConnectivityView(true, 5, true)).toEqual({
      state: 'syncing',
      label: 'Synchronisation…',
      detail: null,
    })
    expect(buildConnectivityView(true, 0, true).state).toBe('syncing')
  })

  it('en ligne avec file : opérations en attente (synchronisation à venir)', () => {
    expect(buildConnectivityView(true, 2, false)).toEqual({
      state: 'pending',
      label: '2 opérations en attente',
      detail: null,
    })
  })

  it('en ligne, file vide : « À jour »', () => {
    expect(buildConnectivityView(true, 0, false)).toEqual({
      state: 'synced',
      label: 'À jour',
      detail: null,
    })
  })

  it('jamais de libellé d\'erreur : aucun état ne contient « erreur » ni « échec »', () => {
    for (const connected of [false, true]) {
      for (const pending of [0, 1, 7]) {
        for (const flushing of [false, true]) {
          const view = buildConnectivityView(connected, pending, flushing)
          expect(view.label.toLowerCase()).not.toContain('erreur')
          expect(view.label.toLowerCase()).not.toContain('échec')
        }
      }
    }
  })
})
