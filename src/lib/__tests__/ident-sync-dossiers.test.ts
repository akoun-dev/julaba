import { beforeEach, describe, expect, it, vi } from 'vitest'

// MODE-943 (AUDIT-003 F-16/F-19) — l'espace identificateur ne perd plus
// rien : (1) les brouillons jamais soumis survivent au redémarrage (texte
// conservé, images volumineuses retirées), (2) un dossier dont la
// soumission échoue pour cause de réseau part en FILE offline (handler
// 'ident-dossier') au lieu d'être « lost » en silence.

const handlers = new Map<string, (payload: unknown) => Promise<void>>()
vi.mock('@/lib/offline-db', () => ({
  registerSyncHandler: vi.fn((entity: string, handler: (payload: unknown) => Promise<void>) => {
    handlers.set(entity, handler)
  }),
  SyncConflictError: class SyncConflictError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'SyncConflictError'
    }
  },
}))

import { registerAllSyncHandlers } from '../sync-handlers'
import { brouillonsPersistables, type Dossier } from '../stores/identificateur-store'

describe('sync-handlers — file des dossiers identificateur (MODE-943, F-19)', () => {
  registerAllSyncHandlers()

  it('enregistre le handler ident-dossier vers POST /api/backoffice/enrolments', () => {
    expect(handlers.has('ident-dossier')).toBe(true)
  })
})

describe('brouillonsPersistables — survie des brouillons sans les images (MODE-943, F-16)', () => {
  const brouillon: Dossier = {
    id: 'd-1',
    actorType: 'marchand',
    agentId: 'agent-1',
    agentName: 'Awa TRAORE',
    dossierNumber: 'ID-2026-1001',
    firstName: 'Adjoua',
    lastName: 'KONE',
    phone: '0701020304',
    activite: 'Vente de riz',
    zone: 'Adjame',
    status: 'brouillon',
    createdAt: 1,
    updatedAt: 2,
    photoBase64: 'data:image/png;base64,PORTRAIT',
    cniRecto: 'data:image/png;base64,RECTO',
    cniVerso: 'data:image/png;base64,VERSO',
    cniNumero: 'CI0123456789',
    documents: [{ name: 'doc.png', base64: 'data:image/png;base64,DOC', type: 'image/png' }],
  }

  const enAttente: Dossier = {
    ...brouillon,
    id: 'd-2',
    firstName: 'Koffi',
    status: 'en_attente',
    submittedAt: 3,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ne conserve QUE les dossiers jamais soumis', () => {
    const out = brouillonsPersistables([brouillon, enAttente])
    expect(out.length).toBe(1)
    expect(out[0].id).toBe('d-1')
    expect(out[0].status).toBe('brouillon')
  })

  it('conserve tout le texte utile (identité, CNI numéro, code auth) et retire les images', () => {
    const [persiste] = brouillonsPersistables([brouillon])
    expect(persiste.firstName).toBe('Adjoua')
    expect(persiste.lastName).toBe('KONE')
    expect(persiste.phone).toBe('0701020304')
    expect(persiste.cniNumero).toBe('CI0123456789')
    expect(persiste.photoBase64).toBeUndefined()
    expect(persiste.cniRecto).toBeUndefined()
    expect(persiste.cniVerso).toBeUndefined()
    expect(persiste.documents).toBeUndefined()
  })
})
