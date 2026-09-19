import { beforeEach, describe, expect, it, vi } from 'vitest'

// MODE-907 (§15) — annuaire fournisseurs côté credits-store : upsertPartner
// accepte kind 'fournisseur' (défaut 'client' inchangé), porte la
// localisation et les produits (texte libre) localement, les embarque dans
// le payload 'merchant-partner' via note (texte libre serveur) et part en
// file AVANT tout achat qui référence le fournisseur (FIFO offline).

vi.mock('@/lib/offline-db', () => ({
  queuePendingSync: vi.fn(async () => ({ ok: true as const })),
}))
vi.mock('@/lib/notifications/triggers', () => ({
  notify: vi.fn(async () => {}),
}))

import { queuePendingSync } from '@/lib/offline-db'
import { useAppStore } from '@/lib/stores/app-store'
import { newPartnerClientId, useCreditsStore } from '../credits-store'

const queueMock = vi.mocked(queuePendingSync)

function resetStore() {
  useCreditsStore.setState({ partners: {}, ops: [] })
  queueMock.mockClear()
}

describe('credits-store — annuaire fournisseurs (MODE-907, §15)', () => {
  beforeEach(() => {
    useAppStore.setState({ merchantId: 'marchand-1' })
    resetStore()
  })

  it('newPartnerClientId produit un identifiant lisible long (min 8)', () => {
    const id = newPartnerClientId()
    expect(id).toMatch(/^partner-\d+-[a-z0-9]+$/)
    expect(id.length).toBeGreaterThanOrEqual(8)
    expect(id).not.toBe(newPartnerClientId())
  })

  it('upsertPartner crée un fournisseur (kind fourni) et le met en file merchant-partner', () => {
    const partner = useCreditsStore.getState().upsertPartner({
      clientId: 'partner-1737-abc123',
      name: 'Koné',
      kind: 'fournisseur',
    })

    expect(partner.kind).toBe('fournisseur')
    expect(partner.name).toBe('Koné')
    expect(queueMock).toHaveBeenCalledTimes(1)
    expect(queueMock.mock.calls[0][0]).toBe('merchant-partner')
    expect(queueMock.mock.calls[0][1]).toMatchObject({
      merchantId: 'marchand-1',
      clientId: 'partner-1737-abc123',
      kind: 'fournisseur',
      name: 'Koné',
    })
  })

  it('upsertPartner sans kind reste un client (défaut historique inchangé)', () => {
    const partner = useCreditsStore.getState().upsertPartner({
      clientId: 'partner-1737-def456',
      name: 'Adjoua',
    })
    expect(partner.kind).toBe('client')
  })

  it('localisation et produits restent structurés en local et voyagent dans note', () => {
    useCreditsStore.getState().upsertPartner({
      clientId: 'partner-1737-abc123',
      name: 'Koné',
      kind: 'fournisseur',
      phone: '0701020304',
      location: 'Adjamé, rangee 12',
      products: 'tomates, oignons',
    })

    const partner = useCreditsStore.getState().partners['partner-1737-abc123']
    expect(partner.location).toBe('Adjamé, rangee 12')
    expect(partner.products).toBe('tomates, oignons')

    const payload = queueMock.mock.calls[0][1] as Record<string, unknown>
    expect(payload.note).toBe('Localisation : Adjamé, rangee 12 · Produits : tomates, oignons')
    // Les champs structurés ne fuient PAS dans le payload serveur (note = texte libre).
    expect('location' in payload).toBe(false)
    expect('products' in payload).toBe(false)
  })

  it('partenaire sans localisation ni produits : note du payload inchangée', () => {
    useCreditsStore.getState().upsertPartner({
      clientId: 'partner-1737-abc123',
      name: 'Koné',
      kind: 'fournisseur',
      note: 'Livraison le mardi',
    })

    const payload = queueMock.mock.calls[0][1] as Record<string, unknown>
    expect(payload.note).toBe('Livraison le mardi')
  })

  it('édition d\'un fournisseur connu : mise à jour locale SANS remettre en file', () => {
    useCreditsStore.getState().upsertPartner({
      clientId: 'partner-1737-abc123',
      name: 'Koné',
      kind: 'fournisseur',
    })
    queueMock.mockClear()

    const updated = useCreditsStore.getState().upsertPartner({
      clientId: 'partner-1737-abc123',
      name: 'Koné',
      kind: 'fournisseur',
      phone: '0701020304',
      location: 'Adjamé',
    })

    expect(updated.phone).toBe('0701020304')
    expect(updated.location).toBe('Adjamé')
    expect(queueMock).not.toHaveBeenCalled()
  })

  it('le fournisseur part en file AVANT l\'achat qui le référence (FIFO offline)', () => {
    useCreditsStore.getState().upsertPartner({
      clientId: 'partner-1737-abc123',
      name: 'Koné',
      kind: 'fournisseur',
    })
    // L'achat vocal arrive juste après (même flux, même appareil).
    queueMock('stock-purchase', { merchantId: 'marchand-1', clientId: 'achat-1' })

    expect(queueMock.mock.calls[0][0]).toBe('merchant-partner')
    expect(queueMock.mock.calls[1][0]).toBe('stock-purchase')
  })

  it('partnerByName retrouve un fournisseur (insensible casse/accents)', () => {
    useCreditsStore.getState().upsertPartner({
      clientId: 'partner-1737-abc123',
      name: 'Adjoua Koné',
      kind: 'fournisseur',
    })
    expect(useCreditsStore.getState().partnerByName('adjoua kone')?.kind).toBe('fournisseur')
  })
})
