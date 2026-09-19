import { describe, it, expect } from 'vitest'
import {
  buildMarketSessionOpen,
  buildMarketSessionClosed,
  type MarketModeConfig,
  type MarketPosition,
} from '../market-session'

// MODE-902 (§7-8) — session de journée marché. L'enregistrement est RÉSUMÉ :
// il porte le CONTEXTE (marché, position, caisse de départ, clôture) et
// s'upsert côté serveur par client_id (idempotence §32 — le rejeu offline
// rejoue le MÊME payload). La caisse reste la source de vérité des montants.

const baseConfig: MarketModeConfig = {
  marketName: "Marché d'Adjamé",
  locationMode: 'select',
}

const basePosition: MarketPosition = {
  lat: 5.35995,
  lng: -4.00809,
  accuracy: 12.5,
  timestamp: 1_700_000_000_000,
}

describe('buildMarketSessionOpen (§7)', () => {
  it('construit l\'enregistrement d\'ouverture complet', () => {
    const record = buildMarketSessionOpen({
      merchantId: 'merchant-1',
      sessionId: 'abc-123',
      fondDeCaisse: 10_000,
      openedAt: '2026-09-19T08:00:00.000Z',
      config: baseConfig,
      position: null,
    })
    expect(record).toEqual({
      merchantId: 'merchant-1',
      clientId: 'abc-123',
      marketName: "Marché d'Adjamé",
      locationMode: 'select',
      latitude: null,
      longitude: null,
      accuracyM: null,
      startedAt: '2026-09-19T08:00:00.000Z',
      startingCash: 10_000,
      status: 'open',
      closedAt: null,
      endingCash: null,
      salesTotal: null,
      expensesTotal: null,
    })
  })

  it('attache la position uniquement en mode « gps »', () => {
    const record = buildMarketSessionOpen({
      merchantId: 'merchant-1',
      sessionId: 'abc-123',
      fondDeCaisse: 5_000,
      openedAt: '2026-09-19T08:00:00.000Z',
      config: { marketName: null, locationMode: 'gps' },
      position: basePosition,
    })
    expect(record.latitude).toBe(5.35995)
    expect(record.longitude).toBe(-4.00809)
    expect(record.accuracyM).toBe(12.5)
  })

  it('jamais de position hors mode « gps » (collecte minimale, §6)', () => {
    for (const mode of ['select', 'none'] as const) {
      const record = buildMarketSessionOpen({
        merchantId: 'm1',
        sessionId: 's1',
        fondDeCaisse: 0,
        openedAt: '2026-09-19T08:00:00.000Z',
        config: { marketName: null, locationMode: mode },
        position: basePosition, // volontairement fournie : le builder doit l'ignorer
      })
      expect(record.latitude).toBeNull()
      expect(record.longitude).toBeNull()
      expect(record.accuracyM).toBeNull()
    }
  })

  it('mode « none » : ni marché ni position (§5.2)', () => {
    const record = buildMarketSessionOpen({
      merchantId: 'm1',
      sessionId: 's1',
      fondDeCaisse: 0,
      openedAt: '2026-09-19T08:00:00.000Z',
      config: { marketName: "Marché fantôme", locationMode: 'none' },
      position: null,
    })
    expect(record.marketName).toBeNull()
    expect(record.locationMode).toBe('none')
  })
})

describe('buildMarketSessionClosed (§8)', () => {
  const open = buildMarketSessionOpen({
    merchantId: 'merchant-1',
    sessionId: 'abc-123',
    fondDeCaisse: 10_000,
    openedAt: '2026-09-19T08:00:00.000Z',
    config: baseConfig,
    position: null,
  })

  it('fusionne les champs d\'ouverture et de clôture (caisse comptée)', () => {
    const closed = buildMarketSessionClosed({
      open,
      closedAt: '2026-09-19T18:30:00.000Z',
      countedCash: 64_000,
      salesTotal: 84_500,
      expensesTotal: 8_000,
    })
    expect(closed).toMatchObject({
      clientId: 'abc-123',
      status: 'closed',
      startingCash: 10_000,
      closedAt: '2026-09-19T18:30:00.000Z',
      endingCash: 64_000,
      salesTotal: 84_500,
      expensesTotal: 8_000,
    })
  })

  it('sans caisse comptée : caisse estimée = départ + ventes − dépenses (§8)', () => {
    const closed = buildMarketSessionClosed({
      open,
      closedAt: '2026-09-19T18:30:00.000Z',
      countedCash: null,
      salesTotal: 84_500,
      expensesTotal: 8_000,
    })
    expect(closed.endingCash).toBe(10_000 + 84_500 - 8_000)
  })

  it('le client_id ne change JAMAIS entre open et close (idempotence §32)', () => {
    const closed = buildMarketSessionClosed({
      open,
      closedAt: '2026-09-19T18:30:00.000Z',
      countedCash: 0,
      salesTotal: 0,
      expensesTotal: 0,
    })
    expect(closed.clientId).toBe(open.clientId)
  })
})
