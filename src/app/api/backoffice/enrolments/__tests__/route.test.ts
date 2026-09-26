import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// AUDIT-013 (MODE-1014) — contrat serveur de POST /api/backoffice/enrolments
// pour les médias réels :
//   - 201 : chaque pièce (photo acteur, CNI recto/verso) est téléversée dans
//     le bucket PRIVÉ `enrolments-media` sous {enrolmentId}/{kind}-{ts}.{ext}
//     et seuls les CHEMINS sont écrits en DB (legacy + miroir canonique) —
//     jamais le base64 ;
//   - 413 : pièce au-delà du cap dur 2 Mo décodés ;
//   - 415 : type hors whitelist image/jpeg|png|webp (ou DataURL illisible) ;
//   - GPS {lat,lng,accuracy} transmis jusqu'aux colonnes gps_* de
//     legacy_bo_enrolments ET au miroir canonique (colonnes gps_lat/gps_lng
//     existantes de `enrolments`, réutilisées sans doublon) ;
//   - échec Storage → 500 + rollback du dossier (jamais un dossier visible
//     sans ses pièces) ;
//   - charge ancienne sans pièce ni GPS (files offline pré-AUDIT-013) → 201,
//     colonnes nulles, Storage jamais touché.

type Row = Record<string, unknown>
type DbResult = { data?: unknown; error?: { message?: string } | null }

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => supabaseMock,
}))

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: vi.fn(async () => null),
}))

vi.mock('@/lib/backoffice-auth', () => ({
  requireBackofficePermission: vi.fn(),
  canAccessZone: vi.fn(() => true),
  logAudit: vi.fn(async () => {}),
}))

vi.mock('@/lib/notifications/server', () => ({
  createNotification: vi.fn(async () => {}),
}))

vi.mock('@/lib/device-session', () => ({
  issueLiaisonCode: vi.fn(async () => ({ code: 'ABCD-EFGH' })),
}))

vi.mock('@/lib/auth-pin', () => ({
  hashCodeScrypt: (plain: string) => `scrypt(${plain})`,
}))

import { POST } from '../route'

interface TableConfig {
  /** Résultat du premier .single() SANS insert (contrôle d'existence). */
  single?: DbResult
  /** Résultat du .single() qui suit un insert (insertion du dossier). */
  insertSingle?: DbResult
  /** Résultat d'un await direct sur le builder (select simple, update, delete, upsert). */
  direct?: DbResult
  maybeSingle?: DbResult
}

interface Builder {
  selects: Array<[string, unknown]>
  inserts: Row[]
  updates: Row[]
  upserts: Row[]
  deletes: number
  eq: (col: string, val: unknown) => Builder
  select: () => Builder
  order: () => Builder
  limit: () => Builder
  single: () => Promise<DbResult>
  maybeSingle: () => Promise<DbResult>
  insert: (row: Row) => Builder
  update: (row: Row) => Builder
  upsert: (row: Row) => Builder
  delete: () => Builder
  then: (onFulfilled?: (r: DbResult) => unknown, onRejected?: (e: unknown) => unknown) => unknown
}

const tables = new Map<string, TableConfig>()
const builders: Array<{ table: string; builder: Builder }> = []

function makeBuilder(config: TableConfig): Builder {
  const state = {
    inserts: [] as Row[],
    updates: [] as Row[],
    upserts: [] as Row[],
    deletes: 0,
  }
  const builder: Builder = {
    selects: [],
    inserts: state.inserts,
    updates: state.updates,
    upserts: state.upserts,
    deletes: 0,
    select: () => builder,
    eq: (col: string, val: unknown) => {
      builder.selects.push([col, val])
      return builder
    },
    order: () => builder,
    limit: () => builder,
    single: () => {
      // Un .single() qui suit un insert = résultat de l'insertion.
      if (state.inserts.length > 0) {
        return Promise.resolve(config.insertSingle ?? { data: null, error: null })
      }
      return Promise.resolve(config.single ?? { data: null, error: null })
    },
    maybeSingle: () => Promise.resolve(config.maybeSingle ?? { data: null, error: null }),
    insert: (row: Row) => {
      state.inserts.push(row)
      return builder
    },
    update: (row: Row) => {
      state.updates.push(row)
      return builder
    },
    upsert: (row: Row) => {
      state.upserts.push(row)
      return builder
    },
    delete: () => {
      state.deletes += 1
      builder.deletes = state.deletes
      return builder
    },
    then: (onFulfilled, onRejected) =>
      Promise.resolve(config.direct ?? { data: null, error: null }).then(onFulfilled, onRejected),
  }
  return builder
}

const fromMock = vi.fn((table: string) => {
  const builder = makeBuilder(tables.get(table) ?? {})
  builders.push({ table, builder })
  return builder
})

const uploadMock = vi.fn()
const removeMock = vi.fn()
const storageFromMock = vi.fn(() => ({ upload: uploadMock, remove: removeMock }))

const supabaseMock = {
  from: fromMock,
  storage: { from: storageFromMock },
}

function postRequest(payload: unknown): NextRequest {
  return new NextRequest('http://localhost/api/backoffice/enrolments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgo='
const TINY_JPG = 'data:image/jpeg;base64,/9j/4AAQ'
const TINY_WEBP = 'data:image/webp;base64,UklGRg=='

const VALID_PAYLOAD = {
  dossierId: 'ID-2026-5001',
  actorName: 'Adjoua KONE',
  actorType: 'marchand',
  firstName: 'Adjoua',
  lastName: 'KONE',
  zone: 'Adjame',
  phone: '0701020304',
  hasPhoto: true,
  hasGps: true,
  gps: { lat: 5.359, lng: -4.008, accuracy: 12 },
  identificateurId: 'ident-1',
  identificateurName: 'Awa TRAORE',
  authMethod: 'pin',
  pin: '1234',
  sexe: 'feminin',
  photoBase64: TINY_JPG,
  cniRecto: TINY_PNG,
  cniVerso: TINY_WEBP,
}

beforeEach(() => {
  tables.clear()
  builders.length = 0
  fromMock.mockClear()
  storageFromMock.mockClear()
  uploadMock.mockReset()
  uploadMock.mockImplementation(async (path: string) => ({ data: { path }, error: null }))
  removeMock.mockReset()
  removeMock.mockResolvedValue({ error: null })

  tables.set('legacy_bo_enrolments', {
    single: { data: null, error: null },
    insertSingle: { data: { id: 'enr-1', dossier_id: 'ID-2026-5001' }, error: null },
  })
  tables.set('merchants', { single: { data: { id: 'm-1' }, error: null } })
  tables.set('organizations', { maybeSingle: { data: { id: 'org-1' }, error: null } })
  tables.set('zones', { direct: { data: [{ id: 'zone-1', name: 'Adjame' }], error: null } })
  tables.set('enrolments', { direct: { data: null, error: null } })
  tables.set('legacy_bo_identificateurs', { direct: { data: null, error: null } })
})

function legacyInsert(): Row | undefined {
  return builders.find((b) => b.table === 'legacy_bo_enrolments' && b.builder.inserts.length > 0)?.builder.inserts[0]
}

function legacyUpdate(): Row | undefined {
  return builders.find((b) => b.table === 'legacy_bo_enrolments' && b.builder.updates.length > 0)?.builder.updates[0]
}

describe('POST enrolments — téléversement des pièces (AUDIT-013)', () => {
  it('201 : les 3 pièces partent au bucket privé, seuls les chemins sont écrits en DB', async () => {
    const res = await POST(postRequest(VALID_PAYLOAD))
    expect(res.status).toBe(201)

    expect(storageFromMock).toHaveBeenCalledWith('enrolments-media')
    expect(uploadMock).toHaveBeenCalledTimes(3)

    const paths = uploadMock.mock.calls.map((c) => c[0] as string)
    expect(paths[0]).toMatch(/^enr-1\/photo-\d+\.jpg$/)
    expect(paths[1]).toMatch(/^enr-1\/cni-recto-\d+\.png$/)
    expect(paths[2]).toMatch(/^enr-1\/cni-verso-\d+\.webp$/)
    expect(uploadMock.mock.calls.map((c) => (c[2] as { contentType: string }).contentType))
      .toEqual(['image/jpeg', 'image/png', 'image/webp'])

    // Chemins persistés sur le dossier legacy, base64 JAMAIS en DB.
    const update = legacyUpdate()
    expect(update).toMatchObject({
      photo_path: paths[0],
      cni_recto_path: paths[1],
      cni_verso_path: paths[2],
    })
    expect(JSON.stringify(update)).not.toContain('data:image')

    const insert = legacyInsert()
    expect(JSON.stringify(insert)).not.toContain('data:image')
  })

  it('413 : pièce au-delà du cap dur de 2 Mo décodés, Storage jamais touché', async () => {
    const tropLourd = 'data:image/jpeg;base64,' + 'A'.repeat(3_000_000) // ≈ 2,25 Mo décodés
    const res = await POST(postRequest({ ...VALID_PAYLOAD, photoBase64: tropLourd }))
    expect(res.status).toBe(413)
    const body = await res.json() as { erreur: string }
    expect(body.erreur).toContain('2 Mo')
    expect(storageFromMock).not.toHaveBeenCalled()
    // Aucun dossier créé (porte payloads, avant toute écriture).
    expect(builders.some((b) => b.table === 'legacy_bo_enrolments' && b.builder.inserts.length > 0)).toBe(false)
  })

  it('413 : la mesure porte sur le binaire décodé, pas sur la base64', async () => {
    // 2 400 000 caractères base64 ≈ 1,8 Mo décodés → SOUS le cap → 201.
    const sousLeCap = 'data:image/jpeg;base64,' + 'A'.repeat(2_400_000)
    const res = await POST(postRequest({ ...VALID_PAYLOAD, photoBase64: sousLeCap }))
    expect(res.status).toBe(201)
  })

  it('415 : type hors whitelist (PDF), Storage jamais touché', async () => {
    const res = await POST(postRequest({ ...VALID_PAYLOAD, cniRecto: 'data:application/pdf;base64,AAAA' }))
    expect(res.status).toBe(415)
    const body = await res.json() as { erreur: string }
    expect(body.erreur).toContain('cni-recto')
    expect(storageFromMock).not.toHaveBeenCalled()
  })

  it('415 : chaîne non DataURL (payload altéré)', async () => {
    const res = await POST(postRequest({ ...VALID_PAYLOAD, cniVerso: 'Bonjour' }))
    expect(res.status).toBe(415)
    expect(storageFromMock).not.toHaveBeenCalled()
  })
})

describe('POST enrolments — GPS réel jusqu\u2019à la DB (AUDIT-013)', () => {
  it('les colonnes gps_* legacy portent la mesure ET le miroir canonique reçoit gps_lat/gps_lng', async () => {
    const res = await POST(postRequest(VALID_PAYLOAD))
    expect(res.status).toBe(201)

    const insert = legacyInsert()
    expect(insert).toMatchObject({ gps_lat: 5.359, gps_lng: -4.008, gps_accuracy_m: 12 })

    const mirror = builders.find((b) => b.table === 'enrolments' && b.builder.upserts.length > 0)?.builder.upserts[0]
    expect(mirror).toMatchObject({ gps_lat: 5.359, gps_lng: -4.008 })
  })

  it('sans GPS ni pièces (charge ancienne) → 201, colonnes nulles, Storage jamais touché', async () => {
    const ancienneCharge: Record<string, unknown> = { ...VALID_PAYLOAD }
    delete ancienneCharge.gps
    delete ancienneCharge.photoBase64
    delete ancienneCharge.cniRecto
    delete ancienneCharge.cniVerso
    const res = await POST(postRequest(ancienneCharge))
    expect(res.status).toBe(201)

    const insert = legacyInsert()
    expect(insert).toMatchObject({ gps_lat: null, gps_lng: null, gps_accuracy_m: null })
    expect(storageFromMock).not.toHaveBeenCalled()
    expect(legacyUpdate()).toBeUndefined()
  })
})

describe('POST enrolments — invariant dossier⇔pièces (AUDIT-013)', () => {
  it('échec Storage → 500 et rollback du dossier inséré (jamais un dossier sans pièces)', async () => {
    uploadMock.mockImplementation(async () => ({ data: null, error: { message: 'storage kaput' } }))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(postRequest(VALID_PAYLOAD))
    expect(res.status).toBe(500)
    const body = await res.json() as { erreur: string }
    expect(body.erreur).toBe('Erreur lors de la creation de l\'inscription')
    expect(body.erreur).not.toContain('kaput')
    // Rollback : le dossier fraîchement inséré est supprimé.
    const rollback = builders.filter((b) => b.table === 'legacy_bo_enrolments').find((b) => b.builder.deletes > 0)
    expect(rollback).toBeDefined()
    expect(rollback!.builder.selects).toContainEqual(['id', 'enr-1'])
    consoleSpy.mockRestore()
  })
})
