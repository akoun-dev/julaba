import { beforeEach, describe, expect, it, vi } from 'vitest'

// MODE-908 (§18) — store des points de vente, 100 % offline-first : les
// mutations locales passent AVANT la file ('selling-point') ; elles ne
// font JAMAIS de réseau et ne jettent jamais. « Boutique » est créée au
// premier usage — jamais de liste vide bloquante. Archivage seul : JAMAIS
// de suppression.

vi.mock('@/lib/offline-db', () => ({
  queuePendingSync: vi.fn(async () => ({ ok: true as const })),
}))

import { queuePendingSync } from '@/lib/offline-db'
import { useAppStore } from '@/lib/stores/app-store'
import { useSellingPointsStore } from '../selling-points-store'
import {
  activeOrDefault,
  DEFAULT_SELLING_POINT,
  isPointArchived,
  type SellingPoint,
} from '../selling-point'

const queueMock = vi.mocked(queuePendingSync)

function resetStore() {
  useSellingPointsStore.setState({ points: {}, activePointClientId: null })
  queueMock.mockClear()
}

function fakePoint(overrides: Partial<SellingPoint> = {}): SellingPoint {
  return {
    clientId: 'point-test-0001',
    name: 'Boutique',
    kind: 'boutique',
    createdAt: 1_700_000_000_000,
    archivedAt: null,
    ...overrides,
  }
}

describe('selling-points-store — points de vente (MODE-908, §18)', () => {
  beforeEach(() => {
    useAppStore.setState({ merchantId: 'marchand-1' })
    resetStore()
  })

  it('activePoint crée « Boutique » au premier usage — jamais de liste vide bloquante', () => {
    const active = useSellingPointsStore.getState().activePoint()

    expect(active.name).toBe('Boutique')
    const points = Object.values(useSellingPointsStore.getState().points)
    expect(points).toHaveLength(1)
    expect(points[0].kind).toBe('boutique')
    expect(points[0].archivedAt ?? null).toBeNull()
    expect(useSellingPointsStore.getState().activePointClientId).toBe(active.clientId)

    // File 'selling-point' : payload complet de l'upsert idempotent.
    expect(queueMock).toHaveBeenCalledTimes(1)
    expect(queueMock.mock.calls[0][0]).toBe('selling-point')
    const payload = queueMock.mock.calls[0][1] as Record<string, unknown>
    expect(payload).toMatchObject({
      merchantId: 'marchand-1',
      name: 'Boutique',
      kind: 'boutique',
    })
    expect(payload.archivedAt).toBeUndefined()
  })

  it('activePoint génère un clientId au format UUID (idempotence serveur)', () => {
    const active = useSellingPointsStore.getState().activePoint()
    expect(active.clientId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  it('activePoint est stable : le deuxième appel ne recrée rien et ne remet rien en file', () => {
    const first = useSellingPointsStore.getState().activePoint()
    queueMock.mockClear()

    const second = useSellingPointsStore.getState().activePoint()

    expect(second.clientId).toBe(first.clientId)
    expect(second.name).toBe('Boutique')
    expect(queueMock).not.toHaveBeenCalled()
    expect(Object.keys(useSellingPointsStore.getState().points)).toHaveLength(1)
  })

  it('add crée un point (kind fourni, défaut autre) et met l’upsert en file', () => {
    const result = useSellingPointsStore.getState().addPoint({ name: '  Marché Treichville  ', kind: 'marche' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.point.name).toBe('Marché Treichville') // trimmé
    expect(result.point.kind).toBe('marche')
    expect(result.point.archivedAt ?? null).toBeNull()
    // Un nouveau point n'est PAS automatiquement actif (choix explicite).
    expect(useSellingPointsStore.getState().activePointClientId).not.toBe(result.point.clientId)

    expect(queueMock).toHaveBeenCalledTimes(1)
    expect(queueMock.mock.calls[0][0]).toBe('selling-point')
    expect(queueMock.mock.calls[0][1]).toMatchObject({
      merchantId: 'marchand-1',
      clientId: result.point.clientId,
      name: 'Marché Treichville',
      kind: 'marche',
    })
  })

  it('add sans kind donne « autre » et refuse un nom hors bornes (2-60) sans rien mettre en file', () => {
    const ok = useSellingPointsStore.getState().addPoint({ name: 'Kiosque du coin' })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.point.kind).toBe('autre')

    queueMock.mockClear()
    expect(useSellingPointsStore.getState().addPoint({ name: 'A' }).ok).toBe(false)
    expect(useSellingPointsStore.getState().addPoint({ name: 'x'.repeat(61) }).ok).toBe(false)
    expect(queueMock).not.toHaveBeenCalled()
  })

  it('rename change le nom local et remet l’upsert en file (le même client_id voyage)', () => {
    const created = useSellingPointsStore.getState().addPoint({ name: 'Marché Adjamé', kind: 'marche' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    queueMock.mockClear()

    const result = useSellingPointsStore.getState().renamePoint(created.point.clientId, 'Marché Adjamé Rosiers')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.point.name).toBe('Marché Adjamé Rosiers')
    expect(useSellingPointsStore.getState().points[created.point.clientId]?.name).toBe('Marché Adjamé Rosiers')

    expect(queueMock).toHaveBeenCalledTimes(1)
    expect(queueMock.mock.calls[0][1]).toMatchObject({
      merchantId: 'marchand-1',
      clientId: created.point.clientId,
      name: 'Marché Adjamé Rosiers',
      kind: 'marche',
    })
  })

  it('rename refuse un nom invalide et un point inconnu (aucune file)', () => {
    expect(useSellingPointsStore.getState().renamePoint('inconnu-xyz', 'Nouveau nom').ok).toBe(false)
    const created = useSellingPointsStore.getState().addPoint({ name: 'Boutique du quartier' })
    if (!created.ok) return
    queueMock.mockClear()
    expect(useSellingPointsStore.getState().renamePoint(created.point.clientId, 'A').ok).toBe(false)
    expect(queueMock).not.toHaveBeenCalled()
  })

  it('archive met archivedAt, GARDE le point (jamais de suppression) et met l’upsert en file avec archivedAt', () => {
    const created = useSellingPointsStore.getState().addPoint({ name: 'Vieux kiosque', kind: 'autre' })
    if (!created.ok) return
    queueMock.mockClear()

    const result = useSellingPointsStore.getState().archivePoint(created.point.clientId)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(typeof result.point.archivedAt).toBe('number')
    // Le point reste dans la liste locale — JAMAIS de suppression.
    expect(useSellingPointsStore.getState().points[created.point.clientId]?.archivedAt).not.toBeNull()

    expect(queueMock).toHaveBeenCalledTimes(1)
    const payload = queueMock.mock.calls[0][1] as { archivedAt?: string }
    expect(typeof payload.archivedAt).toBe('string')
    expect(new Date(payload.archivedAt!).toISOString()).toBe(payload.archivedAt)
  })

  it('archiver deux fois est idempotent (pas de deuxième file)', () => {
    const created = useSellingPointsStore.getState().addPoint({ name: 'Vieux kiosque' })
    if (!created.ok) return
    useSellingPointsStore.getState().archivePoint(created.point.clientId)
    queueMock.mockClear()

    const again = useSellingPointsStore.getState().archivePoint(created.point.clientId)
    expect(again.ok).toBe(true)
    expect(queueMock).not.toHaveBeenCalled()
  })

  it('archiver le point actif libère la sélection : activePoint retombe sur un autre point', () => {
    const defaut = useSellingPointsStore.getState().activePoint() // Boutique
    const added = useSellingPointsStore.getState().addPoint({ name: 'Marché Treichville', kind: 'marche' })
    if (!added.ok) return
    expect(useSellingPointsStore.getState().setActive(added.point.clientId).ok).toBe(true)
    queueMock.mockClear()

    useSellingPointsStore.getState().archivePoint(added.point.clientId)

    expect(useSellingPointsStore.getState().activePointClientId).toBeNull()
    const active = useSellingPointsStore.getState().activePoint()
    expect(active.clientId).toBe(defaut.clientId)
  })

  it('tous les points archivés → activePoint recrée une « Boutique » neuve (jamais bloquant)', () => {
    const defaut = useSellingPointsStore.getState().activePoint()
    useSellingPointsStore.getState().archivePoint(defaut.clientId)
    queueMock.mockClear()

    const active = useSellingPointsStore.getState().activePoint()
    expect(active.name).toBe('Boutique')
    expect(active.clientId).not.toBe(defaut.clientId)
    expect(queueMock).toHaveBeenCalledTimes(1)
    expect(queueMock.mock.calls[0][0]).toBe('selling-point')
  })

  it('setActive refuse un point archivé — état inchangé, aucune file', () => {
    const created = useSellingPointsStore.getState().addPoint({ name: 'Point à archiver' })
    if (!created.ok) return
    useSellingPointsStore.getState().archivePoint(created.point.clientId)
    queueMock.mockClear()

    const result = useSellingPointsStore.getState().setActive(created.point.clientId)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('archiv')
    expect(useSellingPointsStore.getState().activePointClientId).not.toBe(created.point.clientId)
    expect(queueMock).not.toHaveBeenCalled()
  })

  it('setActive définit le point actif (préférence appareil : pas de file) et activePoint le renvoie', () => {
    const created = useSellingPointsStore.getState().addPoint({ name: 'Marché Adjamé', kind: 'marche' })
    if (!created.ok) return
    queueMock.mockClear()

    const result = useSellingPointsStore.getState().setActive(created.point.clientId)
    expect(result.ok).toBe(true)
    expect(useSellingPointsStore.getState().activePointClientId).toBe(created.point.clientId)

    const active = useSellingPointsStore.getState().activePoint()
    expect(active.clientId).toBe(created.point.clientId)
    expect(active.name).toBe('Marché Adjamé')
    expect(queueMock).not.toHaveBeenCalled() // setActive ne change rien côté serveur
  })

  it('sans compte marchand : mutations locales OK mais AUCUNE file (l’offline n’est jamais une erreur)', () => {
    useAppStore.setState({ merchantId: null })

    const added = useSellingPointsStore.getState().addPoint({ name: 'Boutique hors compte' })
    expect(added.ok).toBe(true)
    const active = useSellingPointsStore.getState().activePoint()
    expect(active.name).toBe('Boutique hors compte')
    expect(queueMock).not.toHaveBeenCalled()
  })
})

describe('builder pur selling-point — activeOrDefault (MODE-908)', () => {
  it('liste vide → défaut « Boutique » (jamais null)', () => {
    expect(activeOrDefault([], null)).toEqual(DEFAULT_SELLING_POINT)
    expect(activeOrDefault([], undefined).name).toBe('Boutique')
  })

  it('actif valide → renvoyé tel quel (id + nom snapshot)', () => {
    const points = [fakePoint({ clientId: 'p-1', name: 'Boutique' }), fakePoint({ clientId: 'p-2', name: 'Marché', createdAt: 2 })]
    expect(activeOrDefault(points, 'p-2')).toEqual({ clientId: 'p-2', name: 'Marché' })
  })

  it('actif archivé → retombe sur le premier non archivé (createdAt croissant)', () => {
    const points: SellingPoint[] = [
      fakePoint({ clientId: 'p-ancien', name: 'Ancien', createdAt: 10 }),
      fakePoint({ clientId: 'p-actif', name: 'Actif', createdAt: 20, archivedAt: 99 }),
      fakePoint({ clientId: 'p-neuf', name: 'Neuf', createdAt: 30 }),
    ]
    expect(activeOrDefault(points, 'p-actif')).toEqual({ clientId: 'p-ancien', name: 'Ancien' })
  })

  it('tous archivés → défaut « Boutique » ; isPointArchived lit archivedAt', () => {
    const archived = fakePoint({ archivedAt: 42 })
    expect(isPointArchived(archived)).toBe(true)
    expect(isPointArchived(fakePoint({ archivedAt: null }))).toBe(false)
    expect(activeOrDefault([archived], archived.clientId)).toEqual(DEFAULT_SELLING_POINT)
  })
})
