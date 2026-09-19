import { beforeEach, describe, expect, it } from 'vitest'
import { useMarketModeStore } from '../market-mode-store'

describe('market mode store', () => {
  beforeEach(() => {
    useMarketModeStore.setState({
      enabled: false,
      offlineFirst: true,
      locationChoice: 'none',
      marketName: '',
      location: null,
      locationStatus: 'idle',
      selectedLanguage: 'fr',
      pendingSyncCount: 0,
      lastSyncAt: null,
      syncStatus: 'idle',
    })
  })

  it('active le mode hors connexion sans modifier les données métier', () => {
    useMarketModeStore.getState().enable()

    expect(useMarketModeStore.getState().enabled).toBe(true)
    expect(useMarketModeStore.getState().offlineFirst).toBe(true)
  })

  it('conserve une position uniquement après le choix explicite actuel', () => {
    const location = { latitude: 5.32, longitude: -4.02, accuracy: 12, capturedAt: 1 }
    useMarketModeStore.getState().setLocationChoice('current')
    useMarketModeStore.getState().setLocation(location)

    expect(useMarketModeStore.getState().location).toEqual(location)
    expect(useMarketModeStore.getState().locationStatus).toBe('captured')
  })

  it('expose le compteur de file et le dernier succès de synchronisation', () => {
    useMarketModeStore.getState().setPendingSyncCount(3)
    useMarketModeStore.getState().markSynced()

    expect(useMarketModeStore.getState().pendingSyncCount).toBe(3)
    expect(useMarketModeStore.getState().lastSyncAt).toBeTypeOf('number')
    expect(useMarketModeStore.getState().syncStatus).toBe('success')
  })
})
