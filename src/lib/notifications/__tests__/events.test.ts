import { describe, it, expect } from 'vitest'
import {
  saleCreatedInput, saleRejectedInput, saleIncompletePaymentInput, saleChangeDueInput,
  caisseOpenedInput, caisseClosedInput, caisseNotClosedInput, caisseFundChangedInput,
  stockLowInput, stockOutOfStockInput, productAddedInput, restockRecordedInput, productDisabledInput,
  expenseRecordedInput, expenseNeedsReviewInput,
  orderStatusInput,
  tontineInput,
  keiwaInput,
  syncQueuedInput, syncCompletedInput, syncConflictInput, syncUnrecoverableInput,
  connectionLostInput, connectionRestoredInput,
  securityInput,
  trainingContentAvailableInput, harvestRecordedInput, systemStatusInput,
} from '../events'

// Chaque déclencheur de la spec §4 doit produire une NotificationInput
// exploitable : titre non vide, corps explicite (jamais « Une erreur est
// survenue »), catégorie correcte, clé de déduplication stable quand une
// identité existe, montants FCFA formatés avec séparateur de milliers.

const CATEGORIES_EXPECTED = {
  saleCreated: 'vente', caisseOpened: 'caisse', stockLow: 'stock',
  expense: 'depense', order: 'commande', tontine: 'tontine', keiwa: 'keiwa',
  sync: 'synchronisation', security: 'securite', training: 'formation',
  harvest: 'production',
} as const

describe('ventes', () => {
  it('sale synced → success, montant formaté, clé dérivée de la vente', () => {
    const n = saleCreatedInput({ saleId: 'sale-42', amount: 2500, synced: true })
    expect(n.category).toBe(CATEGORIES_EXPECTED.saleCreated)
    expect(n.severity).toBe('success')
    expect(n.title).toBe('Vente enregistrée')
    expect(n.body).toContain('2 500 FCFA')
    expect(n.deduplicationKey).toBe('sale:sale-42:created')
  })

  it('sale offline → warning « en attente de synchronisation »', () => {
    const n = saleCreatedInput({ saleId: 'sale-42', amount: 2500, synced: false })
    expect(n.severity).toBe('warning')
    expect(n.body).toContain('dès le retour de la connexion')
    expect(n.deduplicationKey).toBe('sale:sale-42:queued')
  })

  it('vente vocale mentionne la voix', () => {
    const n = saleCreatedInput({ saleId: 'sale-42', amount: 2500, synced: true, viaVoice: true })
    expect(n.title).toBe('Vente vocale confirmée')
  })

  it('rejet explicite : le corps dit quoi faire', () => {
    const n = saleRejectedInput('problème de connexion')
    expect(n.severity).toBe('error')
    expect(n.priority).toBe('high')
    expect(n.body).toContain('Vérifiez la connexion puis réessayez')
  })

  it('paiement incomplet chiffre le manquant', () => {
    const n = saleIncompletePaymentInput({ amountDue: 2500, amountReceived: 1000 })
    expect(n.body).toContain('1 500 FCFA')
    expect(n.body).toContain('2 500 FCFA')
  })

  it('monnaie à rendre expire vite (1 h)', () => {
    const n = saleChangeDueInput({ change: 500 })
    expect(n.body).toContain('500 FCFA')
    expect(n.expiresAt).toBeTruthy()
  })
})

describe('caisse', () => {
  it('ouverture avec fond de caisse', () => {
    const n = caisseOpenedInput(5000)
    expect(n.title).toBe('Caisse ouverte')
    expect(n.body).toContain('5 000 FCFA')
    expect(n.deduplicationKey).toContain('caisse:opened:')
  })

  it('clôture sans écart → succès ; avec écart → avertissement chiffré', () => {
    const ok = caisseClosedInput({ expected: 10000, counted: 10000, sessionId: 's-1' })
    expect(ok.severity).toBe('success')
    const gap = caisseClosedInput({ expected: 10000, counted: 9000, sessionId: 's-1' })
    expect(gap.severity).toBe('warning')
    expect(gap.body).toContain('1 000 FCFA')
    expect(gap.body).toContain('en moins')
  })

  it('MODE-984 — attendu = fond + ventes - dépenses (déficit SIGNÉ), périmètre annoncé, dédup PAR SESSION', () => {
    // Déficit : attendu 5 000 (fond 2 000 + ventes 4 000 - dépenses 1 000),
    // compté 3 000 → écart -2 000 « en moins » — jamais masqué.
    const deficit = caisseClosedInput({ expected: 5000, counted: 3000, sessionId: 's-2' })
    expect(deficit.severity).toBe('warning')
    expect(deficit.body).toContain('5 000 FCFA')
    expect(deficit.body).toContain('fond initial + ventes - dépenses du jour')
    expect(deficit.body).toContain('2 000 FCFA')
    expect(deficit.body).toContain('en moins')
    // Dédup par SESSION : deux clôtures de sessions différentes ne se
    // masquent plus ; la même session garde la même clé (idempotence).
    expect(caisseClosedInput({ expected: 1, counted: 1, sessionId: 's-1' }).deduplicationKey)
      .toBe('caisse:closed:s-1')
    expect(caisseClosedInput({ expected: 1, counted: 1, sessionId: 's-2' }).deduplicationKey)
      .toBe('caisse:closed:s-2')
  })

  it('rappel de clôture : reminder haute priorité, dédup journalière', () => {
    const n = caisseNotClosedInput({ openedAt: '2026-09-17T08:00:00.000Z' })
    expect(n.severity).toBe('reminder')
    expect(n.priority).toBe('high')
    expect(n.deduplicationKey).toBe(`caisse:not-closed:${new Date().toISOString().slice(0, 10)}`)
  })

  it('fond de caisse modifié', () => {
    expect(caisseFundChangedInput(3000).title).toBe('Fond de caisse modifié')
  })
})

describe('stock', () => {
  it('stock faible : pluriel du corps et clé par produit+jour', () => {
    const n = stockLowInput({ productId: 'p1', productName: 'tomates', quantity: 3 })
    expect(n.title).toBe('Stock faible')
    expect(n.body).toBe('Il reste seulement 3 unités de tomates.')
    expect(n.deduplicationKey).toBe(`stock:p1:low:${new Date().toISOString().slice(0, 10)}`)
    expect(n.actionRoute).toBe('stock')
    expect(n.metadata?.groupTitlePlural).toBeTruthy()
  })

  it('stock épuisé : erreur haute priorité', () => {
    const n = stockOutOfStockInput({ productId: 'p1', productName: 'tomates' })
    expect(n.severity).toBe('error')
    expect(n.priority).toBe('high')
  })

  it('ajout, réappro et désactivation', () => {
    expect(productAddedInput('oignons').severity).toBe('success')
    expect(restockRecordedInput({ productId: 'p1', productName: 'oignons', quantity: 12 }).body).toContain('12 unités')
    expect(productDisabledInput('oignons').title).toBe('Produit désactivé')
  })
})

describe('dépenses', () => {
  it('enregistrée hors ligne → avertissement ; en ligne → succès', () => {
    expect(expenseRecordedInput({ amount: 1500, synced: false }).severity).toBe('warning')
    expect(expenseRecordedInput({ amount: 1500, synced: true }).severity).toBe('success')
  })

  it('montant inhabituel → à vérifier', () => {
    expect(expenseNeedsReviewInput('Transport').title).toBe('Dépense à vérifier')
  })
})

describe('commandes', () => {
  it('tous les statuts produisent une notification catégorisée', () => {
    for (const status of ['created', 'sent', 'pending', 'confirmed', 'canceled', 'failed', 'synced_after_offline'] as const) {
      const n = orderStatusInput({ orderId: 'o1', status, supplierName: 'Fournisseur Y' })
      expect(n.category).toBe(CATEGORIES_EXPECTED.order)
      expect(n.title).toBeTruthy()
      expect(n.body).toBeTruthy()
    }
    expect(orderStatusInput({ orderId: 'o1', status: 'failed' }).priority).toBe('high')
  })
})

describe('tontines', () => {
  it('tous les événements tontine sont catégorisés et dédupliqués par tontine', () => {
    for (const event of ['created', 'member_joined', 'contribution', 'late', 'due_soon', 'closed'] as const) {
      const n = tontineInput({ event, tontineId: 't1', tontineName: 'Tontine A', memberName: 'Awa', amount: 5000 })
      expect(n.category).toBe(CATEGORIES_EXPECTED.tontine)
      if (n.deduplicationKey) expect(n.deduplicationKey.startsWith('tontine:t1:')).toBe(true)
    }
    expect(tontineInput({ event: 'late', tontineId: 't1', tontineName: 'A' }).priority).toBe('high')
  })
})

describe('keiwa', () => {
  it('dépôt/retrait/transfert dédupliqués par transaction', () => {
    expect(keiwaInput({ event: 'deposit', txId: 'tx1', amount: 10000 }).deduplicationKey).toBe('keiwa:tx1:deposit')
    expect(keiwaInput({ event: 'withdrawal', txId: 'tx1' }).deduplicationKey).toBe('keiwa:tx1:withdrawal')
    expect(keiwaInput({ event: 'transfer_received', txId: 'tx9', amount: 2000 }).title).toBe('Transfert reçu')
  })

  it('solde insuffisant et activité inhabituelle sont à fort impact', () => {
    expect(keiwaInput({ event: 'insufficient' }).priority).toBe('high')
    expect(keiwaInput({ event: 'unusual' }).priority).toBe('critical')
    expect(keiwaInput({ event: 'failed', txId: 'tx2' }).severity).toBe('error')
  })
})

describe('synchronisation', () => {
  it('mise en file, terminée, conflit, impossible', () => {
    expect(syncQueuedInput({ entity: 'sale', queueId: 7 }).deduplicationKey).toBe('sync:7:queued')
    expect(syncCompletedInput({ count: 3 }).body).toContain('3 opérations')
    expect(syncConflictInput({ entity: 'sale' }).severity).toBe('error')
    expect(syncUnrecoverableInput({ entity: 'sale', reason: '404' }).priority).toBe('high')
  })

  it('connexion perdue/rétablie : dédup horaire, jamais d\u2019erreur', () => {
    expect(connectionLostInput().severity).toBe('info')
    expect(connectionRestoredInput({ pendingCount: 2 }).body).toContain('2 opérations')
  })
})

describe('sécurité', () => {
  it('tous les événements de sécurité sont critiques de conservation', () => {
    for (const event of ['new_device', 'pin_changed', 'access_denied', 'session_expired', 'role_changed'] as const) {
      const n = securityInput({ event, deviceName: 'Pixel 8' })
      expect(n.category).toBe(CATEGORIES_EXPECTED.security)
      expect(n.priority === 'high' || n.priority === 'critical').toBe(true)
    }
    expect(securityInput({ event: 'access_denied' }).priority).toBe('critical')
  })
})

describe('divers', () => {
  it('formation, récolte et système', () => {
    expect(trainingContentAvailableInput('Vendre mieux').actionRoute).toBe('academy')
    expect(harvestRecordedInput({ culture: 'manioc', quantity: '50 kg', synced: false }).severity).toBe('warning')
    expect(harvestRecordedInput({ culture: 'manioc', quantity: '50 kg', synced: true }).actionRoute).toBe('prod-recoltes')
    expect(systemStatusInput({ service: 'Maintenance', message: 'Le service reprend à 18 h.', severity: 'warning' }).severity).toBe('warning')
  })
})
