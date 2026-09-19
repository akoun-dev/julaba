import { beforeEach, describe, expect, it, vi } from 'vitest'

// MODE-906 (§21-22/§27-28) — store de crédits clients, 100 % offline-first :
// les actions mutent le journal local PUIS mettent en file ('merchant-partner',
// 'credit-op') ; elles ne font JAMAIS de réseau et ne jettent jamais.

vi.mock('@/lib/offline-db', () => ({
  queuePendingSync: vi.fn(async () => ({ ok: true as const })),
}))
vi.mock('@/lib/notifications/triggers', () => ({
  notify: vi.fn(async () => {}),
}))

import { queuePendingSync } from '@/lib/offline-db'
import { useAppStore } from '@/lib/stores/app-store'
import { useCreditsStore } from '../credits-store'

const queueMock = vi.mocked(queuePendingSync)

function resetStore() {
  useCreditsStore.setState({ partners: {}, ops: [] })
  queueMock.mockClear()
}

describe('credits-store — crédits clients (MODE-906, §21-22)', () => {
  beforeEach(() => {
    useAppStore.setState({ merchantId: 'marchand-1' })
    resetStore()
  })

  it('recordCredit crée le partenaire à la volée, augmente sa dette et met l’op en file', () => {
    const result = useCreditsStore.getState().recordCredit({
      partnerName: 'Adjoua',
      amountCfa: 5000,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.partner.balanceCfa).toBe(5000)
    expect(result.partner.kind).toBe('client')
    expect(result.op.kind).toBe('credit')
    expect(result.op.balanceAfterCfa).toBe(5000)

    // Partenaire inconnu → 2 entrées en file : le partenaire d'abord
    // ('merchant-partner'), puis l'op ('credit-op') qui le référence.
    expect(queueMock).toHaveBeenCalledTimes(2)
    expect(queueMock.mock.calls[0][0]).toBe('merchant-partner')
    expect(queueMock.mock.calls[1][0]).toBe('credit-op')
    const payload = queueMock.mock.calls[1][1] as Record<string, unknown>
    expect(payload).toMatchObject({
      merchantId: 'marchand-1',
      kind: 'credit',
      partnerName: 'Adjoua',
      amountCfa: 5000,
    })
    // clientId d'idempotence = UUID
    expect(typeof payload.clientId).toBe('string')
    expect(payload.clientId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  it('recordCredit réutilise le partenaire connu et cumule la dette', () => {
    useCreditsStore.getState().recordCredit({ partnerName: 'Adjoua', amountCfa: 3000 })
    const second = useCreditsStore.getState().recordCredit({ partnerName: 'adjoua', amountCfa: 2000 })

    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.partner.balanceCfa).toBe(5000)
    expect(Object.keys(useCreditsStore.getState().partners)).toHaveLength(1)
  })

  it('recordCredit propage saleClientId (vente à crédit liée, §21)', () => {
    const result = useCreditsStore.getState().recordCredit({
      partnerName: 'Adjoua',
      amountCfa: 1500,
      saleClientId: 'sale-123-abc',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.op.saleClientId).toBe('sale-123-abc')
    // calls[0] = partenaire, calls[1] = op de crédit.
    const payload = queueMock.mock.calls[1][1] as { saleClientId?: string }
    expect(payload.saleClientId).toBe('sale-123-abc')
  })

  it('recordRepayment diminue la dette, journalise et met l’op en file', () => {
    useCreditsStore.getState().recordCredit({ partnerName: 'Adjoua', amountCfa: 5000 })
    queueMock.mockClear()

    const result = useCreditsStore.getState().recordRepayment({
      partnerName: 'Adjoua',
      amountCfa: 2000,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.partner.balanceCfa).toBe(3000)
    expect(result.op.kind).toBe('repayment')
    expect(result.op.balanceAfterCfa).toBe(3000)
    expect(queueMock).toHaveBeenCalledTimes(1)
    expect(queueMock.mock.calls[0][0]).toBe('credit-op')
    expect(queueMock.mock.calls[0][1]).toMatchObject({ kind: 'repayment', amountCfa: 2000 })
  })

  it('recordRepayment refuse si le paiement dépasse la dette — SANS rien muter ni mettre en file (§27)', () => {
    useCreditsStore.getState().recordCredit({ partnerName: 'Adjoua', amountCfa: 2000 })
    queueMock.mockClear()
    const before = useCreditsStore.getState()

    const result = useCreditsStore.getState().recordRepayment({
      partnerName: 'Adjoua',
      amountCfa: 3000,
    })

    expect(result.ok).toBe(false)
    if (result.ok || !('refusal' in result)) return
    expect(result.refusal.code).toBe('REPAYMENT_EXCEEDS_DEBT')
    expect(result.refusal.balanceCfa).toBe(2000)
    // Rien n'a bougé : solde, journal, file (même référence d'état).
    expect(useCreditsStore.getState().partnerByName('Adjoua')?.balanceCfa).toBe(2000)
    expect(useCreditsStore.getState().ops).toHaveLength(1)
    expect(queueMock).not.toHaveBeenCalled()
    expect(useCreditsStore.getState()).toBe(before)
  })

  it('upsertPartner met un nouveau client en file merchant-partner', () => {
    useCreditsStore.getState().upsertPartner({ clientId: 'partner-abc-123', name: 'Koffi Koné' })

    expect(queueMock).toHaveBeenCalledTimes(1)
    expect(queueMock.mock.calls[0][0]).toBe('merchant-partner')
    expect(queueMock.mock.calls[0][1]).toMatchObject({
      merchantId: 'marchand-1',
      clientId: 'partner-abc-123',
      kind: 'client',
      name: 'Koffi Koné',
    })
  })

  it('upsertPartner ne remet PAS en file un partenaire déjà connu', () => {
    useCreditsStore.getState().upsertPartner({ clientId: 'partner-abc-123', name: 'Koffi Koné' })
    queueMock.mockClear()
    useCreditsStore.getState().upsertPartner({ clientId: 'partner-abc-123', name: 'Koffi Koné', phone: '0701020304' })

    expect(queueMock).not.toHaveBeenCalled()
    expect(useCreditsStore.getState().partners['partner-abc-123']?.phone).toBe('0701020304')
  })

  it('totalOutstandingCfa somme les balances strictement positives', () => {
    useCreditsStore.getState().recordCredit({ partnerName: 'Ali', amountCfa: 5000 })
    useCreditsStore.getState().recordCredit({ partnerName: 'Bertin', amountCfa: 1200 })
    // Céline a tout remboursé : ne compte plus.
    useCreditsStore.getState().recordCredit({ partnerName: 'Céline', amountCfa: 800 })
    useCreditsStore.getState().recordRepayment({ partnerName: 'Céline', amountCfa: 800 })

    expect(useCreditsStore.getState().totalOutstandingCfa()).toBe(6200)
  })

  it('clientsWithDebt trie par dette décroissante et ignore les soldes nuls', () => {
    useCreditsStore.getState().recordCredit({ partnerName: 'Awa', amountCfa: 1000 })
    useCreditsStore.getState().recordCredit({ partnerName: 'Bertin', amountCfa: 9000 })
    useCreditsStore.getState().recordCredit({ partnerName: 'Céline', amountCfa: 4000 })
    useCreditsStore.getState().recordRepayment({ partnerName: 'Awa', amountCfa: 1000 })

    const clients = useCreditsStore.getState().clientsWithDebt()
    expect(clients.map((c) => c.name)).toEqual(['Bertin', 'Céline'])
  })

  it('partnerByName est insensible à la casse et aux accents', () => {
    useCreditsStore.getState().recordCredit({ partnerName: 'Adjoua Koné', amountCfa: 500 })

    const found = useCreditsStore.getState().partnerByName('adjoua kone')
    expect(found?.name).toBe('Adjoua Koné')
    expect(useCreditsStore.getState().partnerByName('Awa')).toBeNull()
  })

  it('opère un journal append-only plafonné à 200 ops', () => {
    for (let i = 0; i < 210; i++) {
      useCreditsStore.getState().recordCredit({ partnerName: 'Adjoua', amountCfa: 100 })
    }
    const ops = useCreditsStore.getState().ops
    expect(ops).toHaveLength(200)
    // Append-only : la plus récente est en tête.
    expect(ops[0].balanceAfterCfa).toBe(21000)
  })

  it('refuse proprement sans compte marchand (jamais de throw, jamais de file)', () => {
    useAppStore.setState({ merchantId: null })
    const result = useCreditsStore.getState().recordCredit({ partnerName: 'Adjoua', amountCfa: 500 })

    expect(result.ok).toBe(false)
    if (!result.ok && 'refusal' in result) return
    expect(queueMock).not.toHaveBeenCalled()
  })
})
