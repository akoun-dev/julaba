// Store d'état des packs vocaux (Sprint V, MODE-952).
//
// Façade réactive au-dessus du pack-manager : l'UI (réglages voix,
// MODE-954) lit packs/installProgress ici au lieu de sonder six modules.
//
// ⚠️ INCIDENT-006 (règle permanente) : AUCUN useMemo dans les selectors
// zustand — les composants filtrent sur place, le store ne memoïse pas.
//
// Pas de persist : installed dérive du stockage réel (OPFS / Cache API /
// coque native) via les sondes des modules propriétaires — persister cet
// état introduirait une vérité parallèle (exactement ce que le projet
// interdit). refreshPacks() est le seul moyen d'actualiser.

import { create } from 'zustand'
import {
  installVoicePack,
  listVoicePackStates,
  removeVoicePack,
  type VoicePackState,
} from '../voice/packs/pack-manager'
import type { VoicePackId } from '../voice/packs/registry'

interface VoicePacksState {
  packs: VoicePackState[]
  refreshInFlight: boolean
  /** Id du pack en cours d'installation (null = aucune installation). */
  installInFlight: VoicePackId | null
  /** Progression (0..100) de l'installation en cours. */
  installProgress: number
  /** Dernier échec explicite (message français, jamais avalé). */
  lastError: string | null
  /** Re-sonde TOUS les packs (état réel du stockage). */
  refreshPacks: () => Promise<void>
  /** Installe un pack (consentement déjà acquis côté UI) puis rafraîchit. */
  installPack: (id: VoicePackId) => Promise<boolean>
  /** Désinstalle un pack puis rafraîchit. */
  removePack: (id: VoicePackId) => Promise<void>
}

export const useVoicePacksStore = create<VoicePacksState>()((set, get) => ({
  packs: [],
  refreshInFlight: false,
  installInFlight: null,
  installProgress: 0,
  lastError: null,

  refreshPacks: async () => {
    if (get().refreshInFlight) return
    set({ refreshInFlight: true })
    try {
      const packs = await listVoicePackStates()
      set({ packs })
    } catch (error) {
      set({
        lastError:
          error instanceof Error
            ? error.message
            : 'Impossible de vérifier l’état des packs vocaux.',
      })
    } finally {
      set({ refreshInFlight: false })
    }
  },

  installPack: async (id) => {
    if (get().installInFlight) return false
    set({ installInFlight: id, installProgress: 0, lastError: null })
    try {
      const ok = await installVoicePack(id, (percent) => set({ installProgress: percent }))
      if (!ok) {
        set({ lastError: `Installation du pack « ${id} » impossible pour le moment.` })
      }
      return ok
    } catch (error) {
      set({
        lastError:
          error instanceof Error
            ? error.message
            : `Installation du pack « ${id} » impossible pour le moment.`,
      })
      return false
    } finally {
      set({ installInFlight: null, installProgress: 0 })
      void get().refreshPacks()
    }
  },

  removePack: async (id) => {
    try {
      await removeVoicePack(id)
    } catch (error) {
      set({
        lastError:
          error instanceof Error
            ? error.message
            : `Suppression du pack « ${id} » impossible pour le moment.`,
      })
    } finally {
      void get().refreshPacks()
    }
  },
}))
