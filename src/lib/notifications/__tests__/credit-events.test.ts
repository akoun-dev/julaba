import { describe, it, expect } from 'vitest'
import { creditRecordedInput, repaymentReceivedInput } from '../events'
import { categoryLabel, NOTIFICATION_CATEGORIES } from '../preferences'
import { effectiveCategoryPref } from '../rules'
import type { NotificationPrefs } from '../types'

// MODE-910 (§26-b) — non-régression des builders de notifications CRÉDIT
// (MODE-906, Task 74-b) : ils n'avaient aucun test dédié — le grand livre
// de crédit s'appuie dessus à chaque recordCredit/recordRepayment (best-
// effort), une régression silencieuse priverait la marchande de ses
// alertes. Garde : catégorie 'credit', corps explicite, montants FCFA
// formatés, action vers l'écran Mes crédits, aucun emoji.
// Ces tests gardent du code DÉJÀ LIVRÉ : verts d'emblée par construction.

describe('creditRecordedInput — crédit noté (MODE-906, §26-b)', () => {
  it('catégorie credit, succès, corps explicite avec nom et montants formatés', () => {
    const n = creditRecordedInput({ clientName: 'Adjoua KONE', amount: 2500, newBalance: 7500 })
    expect(n.type).toBe('credit_recorded')
    expect(n.category).toBe('credit')
    expect(n.severity).toBe('success')
    expect(n.priority).toBe('normal')
    expect(n.title).toBe('Crédit enregistré')
    expect(n.body).toContain('Adjoua KONE')
    expect(n.body).toContain('7\u202F500 FCFA')
    expect(n.body).toContain('2\u202F500 FCFA')
  })

  it('action vers l\u2019écran Mes crédits, clé de déduplication présente, aucun emoji', () => {
    const n = creditRecordedInput({ clientName: 'Adjoua', amount: 2500, newBalance: 2500 })
    expect(n.actionLabel).toBe('Voir mes crédits')
    expect(n.actionRoute).toBe('credits')
    expect(n.deduplicationKey?.length ?? 0).toBeGreaterThan(0)
    expect(n.body).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })
})

describe('repaymentReceivedInput — remboursement encaissé (MODE-906, §26-b)', () => {
  it('dette partielle : « Paiement enregistré » + ce qu\u2019il reste à payer', () => {
    const n = repaymentReceivedInput({ clientName: 'Adjoua', amount: 3000, remainingBalance: 2000 })
    expect(n.type).toBe('repayment_received')
    expect(n.category).toBe('credit')
    expect(n.severity).toBe('success')
    expect(n.title).toBe('Paiement enregistré')
    expect(n.body).toContain('Adjoua')
    expect(n.body).toContain('3\u202F000 FCFA')
    expect(n.body).toContain('2\u202F000 FCFA')
    expect(n.body).toContain('à payer')
  })

  it('dette soldée : « Dette soldée »', () => {
    const n = repaymentReceivedInput({ clientName: 'Adjoua', amount: 3000, remainingBalance: 0 })
    expect(n.title).toBe('Dette soldée')
    expect(n.body).toContain('soldée')
    expect(n.actionRoute).toBe('credits')
  })
})

// MODE-910 (§26-a) — décision MODE-906 VÉRIFIÉE et FIGÉE ici : la
// catégorie 'credit' a un libellé (centre de notifications) mais reste
// HORS du périmètre affichable des préférences (figé à 12 catégories par
// le test preferences.test.ts) — préférence non réglable = « on » par
// défaut (effectiveCategoryPref) : les alertes crédit sont toujours
// affichées, personne ne peut les couper par accident.

describe('catégorie crédit — périmètre affichable (décision MODE-906, §26-a)', () => {
  const prefsSansCredit = {
    categories: {},
    toastsEnabled: true,
    keepHistory: true,
    silentUntil: null,
  } as unknown as NotificationPrefs

  it('libellé présent pour le centre de notifications', () => {
    expect(categoryLabel('credit')).toBe('Crédits clients')
  })

  it('hors liste affichable des préférences (12 catégories figées)', () => {
    expect(NOTIFICATION_CATEGORIES).toHaveLength(12)
    expect(NOTIFICATION_CATEGORIES).not.toContain('credit')
  })

  it('préférence non définie = « on » : les alertes crédit s\u2019affichent par défaut', () => {
    expect(effectiveCategoryPref(prefsSansCredit, 'credit')).toBe('on')
  })
})
