import { create } from 'zustand'
import { persist } from 'zustand/middleware'
// MODE-902 (§7-8) — la session de journée marché vit dans CE store (fusion
// UNION 0b209d4) : le type vient des builders purs de market-mode/.
import type { MarketSessionRecord } from '@/lib/market-mode/market-session'

export type MarketLocationChoice = 'current' | 'market' | 'none'
export type MarketSyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export interface MarketLocation {
  latitude: number
  longitude: number
  accuracy: number | null
  capturedAt: number
}

interface MarketModeState {
  enabled: boolean
  offlineFirst: boolean
  locationChoice: MarketLocationChoice
  marketName: string
  location: MarketLocation | null
  locationStatus: 'idle' | 'requesting' | 'captured' | 'refused' | 'unavailable'
  selectedLanguage: 'fr' | 'bci'
  pendingSyncCount: number
  lastSyncAt: number | null
  syncStatus: MarketSyncStatus
  /** MODE-902 — dernière session de journée marché construite (contexte §7-8). */
  lastMarketSession: MarketSessionRecord | null
  enable: () => void
  disable: () => void
  setLocationChoice: (choice: MarketLocationChoice) => void
  setMarketName: (name: string) => void
  setLocationStatus: (status: MarketModeState['locationStatus']) => void
  setLocation: (location: MarketLocation | null) => void
  setLanguage: (language: 'fr' | 'bci') => void
  setPendingSyncCount: (count: number) => void
  setSyncStatus: (status: MarketSyncStatus) => void
  markSynced: () => void
}

export const useMarketModeStore = create<MarketModeState>()(
  persist(
    (set) => ({
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
      lastMarketSession: null,
      enable: () => set({ enabled: true, offlineFirst: true }),
      disable: () => set({ enabled: false }),
      setLocationChoice: (locationChoice) => set({ locationChoice }),
      setMarketName: (marketName) => set({ marketName }),
      setLocationStatus: (locationStatus) => set({ locationStatus }),
      setLocation: (location) => set({ location, locationStatus: location ? 'captured' : 'idle' }),
      setLanguage: (selectedLanguage) => set({ selectedLanguage }),
      setPendingSyncCount: (pendingSyncCount) => set({ pendingSyncCount }),
      setSyncStatus: (syncStatus) => set({ syncStatus }),
      markSynced: () => set({ lastSyncAt: Date.now(), syncStatus: 'success' }),
    }),
    {
      name: 'julaba-market-mode',
      partialize: (state) => ({
        enabled: state.enabled,
        offlineFirst: state.offlineFirst,
        locationChoice: state.locationChoice,
        marketName: state.marketName,
        location: state.location,
        locationStatus: state.locationStatus,
        selectedLanguage: state.selectedLanguage,
        lastMarketSession: state.lastMarketSession,
      }),
    },
  ),
)
