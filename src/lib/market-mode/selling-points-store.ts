import { create } from 'zustand'
import { persist } from 'zustand/middleware'
// MODE-908 (§18) — points de vente multiples côté appareil.
//
// 100 % offline-first : les actions MUTENT l'état local PUIS mettent
// l'upsert en file offline ('selling-point') — elles ne font JAMAIS de
// réseau et ne jettent jamais (l'offline n'est pas une erreur). Le fichier
// part à CHAQUE mutation qui change les données serveur (création,
// renommage, archivage — upsert idempotent par client_id) ; setActive est
// une préférence APPAREIL (aucune colonne is_active côté serveur) → pas de
// file. Le point actif est passé par ARGUMENTS aux ventes (quick-sale
// options) — sens unique : ce store n'importe jamais la caisse.
//
// « Boutique » est créée au premier usage (activePoint) — jamais de liste
// vide bloquante. Archivage seul : JAMAIS de suppression.

import { useAppStore } from '@/lib/stores/app-store'
import { queuePendingSync } from '@/lib/offline-db'
import {
  activeOrDefault,
  type ActiveSellingPoint,
  type SellingPoint,
  type SellingPointKind,
} from './selling-point'

export type { SellingPoint, SellingPointKind, ActiveSellingPoint }

export type SellingPointActionResult =
  | { ok: true; point: SellingPoint }
  | { ok: false; error: string }

interface SellingPointsState {
  points: Record<string, SellingPoint>
  /** Préférence appareil : le point actif (null = laisser le builder décider). */
  activePointClientId: string | null
  addPoint: (input: { name: string; kind?: SellingPointKind; clientId?: string }) => SellingPointActionResult
  renamePoint: (clientId: string, name: string) => SellingPointActionResult
  archivePoint: (clientId: string) => SellingPointActionResult
  /** Refuse un point archivé (jamais actif). Préférence appareil : pas de file. */
  setActive: (clientId: string) => SellingPointActionResult
  /** Le point actif — « Boutique » est créée au premier usage si la liste
   * est vide ou tout archivée. Jamais null. À appeler hors rendu React
   * (handlers de vente, effets) : il mute le store au premier usage. */
  activePoint: () => ActiveSellingPoint
}

/** client_id d'idempotence d'un NOUVEAU point de vente : UUID (le format
 * attendu par l'entité), repli lisible hors crypto — jamais court (min 8
 * côté schéma). */
export function newSellingPointClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `point-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
}

/** Payload d'upsert serveur (createSellingPointSchema) : archivedAt ne
 * voyage QUE s'il existe — la route ne désarchive jamais par accident. */
function buildSyncPayload(merchantId: string, point: SellingPoint): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    merchantId,
    clientId: point.clientId,
    name: point.name,
    kind: point.kind,
  }
  if (point.archivedAt != null) {
    payload.archivedAt = new Date(point.archivedAt).toISOString()
  }
  return payload
}

const NAME_BOUNDS_ERROR = 'Le nom doit faire entre 2 et 60 caractères'

export const useSellingPointsStore = create<SellingPointsState>()(
  persist(
    (set, get) => ({
      points: {},
      activePointClientId: null,

      addPoint: (input) => {
        const name = input.name.trim()
        if (name.length < 2 || name.length > 60) {
          return { ok: false, error: NAME_BOUNDS_ERROR }
        }
        const point: SellingPoint = {
          clientId: input.clientId ?? newSellingPointClientId(),
          name,
          kind: input.kind ?? 'autre',
          createdAt: Date.now(),
          archivedAt: null,
        }
        set((s) => ({ points: { ...s.points, [point.clientId]: point } }))
        const merchantId = useAppStore.getState().merchantId
        if (merchantId) {
          void queuePendingSync('selling-point', buildSyncPayload(merchantId, point))
        }
        return { ok: true, point }
      },

      renamePoint: (clientId, name) => {
        const existing = get().points[clientId]
        if (!existing) return { ok: false, error: 'Point de vente inconnu' }
        const trimmed = name.trim()
        if (trimmed.length < 2 || trimmed.length > 60) {
          return { ok: false, error: NAME_BOUNDS_ERROR }
        }
        const updated: SellingPoint = { ...existing, name: trimmed }
        set((s) => ({ points: { ...s.points, [clientId]: updated } }))
        const merchantId = useAppStore.getState().merchantId
        if (merchantId) {
          void queuePendingSync('selling-point', buildSyncPayload(merchantId, updated))
        }
        return { ok: true, point: updated }
      },

      archivePoint: (clientId) => {
        const existing = get().points[clientId]
        if (!existing) return { ok: false, error: 'Point de vente inconnu' }
        // Déjà archivé : idempotent, pas de nouvelle file.
        if (existing.archivedAt != null) return { ok: true, point: existing }
        const updated: SellingPoint = { ...existing, archivedAt: Date.now() }
        set((s) => ({
          points: { ...s.points, [clientId]: updated },
          // Archiver le point actif libère la sélection (retombe sur un
          // autre point au prochain activePoint — jamais bloquant).
          activePointClientId: s.activePointClientId === clientId ? null : s.activePointClientId,
        }))
        const merchantId = useAppStore.getState().merchantId
        if (merchantId) {
          void queuePendingSync('selling-point', buildSyncPayload(merchantId, updated))
        }
        return { ok: true, point: updated }
      },

      setActive: (clientId) => {
        const existing = get().points[clientId]
        if (!existing) return { ok: false, error: 'Point de vente inconnu' }
        if (existing.archivedAt != null) {
          return { ok: false, error: 'Ce point est archivé : il ne peut pas devenir actif' }
        }
        set({ activePointClientId: clientId })
        return { ok: true, point: existing }
      },

      activePoint: () => {
        const state = get()
        const resolved = activeOrDefault(Object.values(state.points), state.activePointClientId)
        if (state.points[resolved.clientId]) {
          return { clientId: resolved.clientId, name: resolved.name }
        }
        // Premier usage (ou tout archivé) : « Boutique » est créée
        // automatiquement — jamais de liste vide bloquante.
        const point: SellingPoint = {
          clientId: newSellingPointClientId(),
          name: 'Boutique',
          kind: 'boutique',
          createdAt: Date.now(),
          archivedAt: null,
        }
        set((s) => ({
          points: { ...s.points, [point.clientId]: point },
          activePointClientId: point.clientId,
        }))
        const merchantId = useAppStore.getState().merchantId
        if (merchantId) {
          void queuePendingSync('selling-point', buildSyncPayload(merchantId, point))
        }
        return { clientId: point.clientId, name: point.name }
      },
    }),
    {
      name: 'julaba-selling-points',
      partialize: (state) => ({
        points: state.points,
        activePointClientId: state.activePointClientId,
      }),
    },
  ),
)
