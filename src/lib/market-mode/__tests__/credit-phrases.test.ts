import { describe, expect, it } from 'vitest'
import {
  creditRecordedPhrase,
  debtTotalPhrase,
  repaymentExceedsDebtPhrase,
  repaymentRecordedPhrase,
} from '../credit-phrases'

// MODE-906 (§21-22/§27-28) — phrases pures du crédit clients.
// La voix marchande TUTOIE (zéro vouvoiement, zéro emoji) et les montants
// passent par formatMontantParle (« 5 000 »).

describe('creditRecordedPhrase', () => {
  it('annonce la nouvelle dette du client (§21)', () => {
    expect(creditRecordedPhrase('Adjoua', 5000, 5000)).toBe(
      "C'est enregistré. Adjoua te doit maintenant 5 000 francs.",
    )
  })

  it('annonce la dette cumulée après un second crédit (§21)', () => {
    expect(creditRecordedPhrase('Adjoua', 2000, 7000)).toBe(
      "C'est enregistré. Adjoua te doit maintenant 7 000 francs.",
    )
  })

  it('ne contient jamais de vouvoiement ni d’emoji', () => {
    const phrase = creditRecordedPhrase('Koffi', 1000, 3000)
    expect(phrase).not.toMatch(/vous|votre/i)
    expect(phrase).toMatch(/^[\p{L}\p{N}'’ .,-]+$/u)
  })
})

describe('repaymentRecordedPhrase', () => {
  it('annonce la dette avant/après (§22)', () => {
    expect(repaymentRecordedPhrase('Adjoua', 5000, 2000)).toBe(
      "C'est enregistré. La dette de Adjoua passe de 5 000 à 2 000 francs.",
    )
  })

  it('dette soldée : « ne te doit plus rien » (§22)', () => {
    expect(repaymentRecordedPhrase('Adjoua', 5000, 0)).toBe(
      "C'est enregistré. Adjoua ne te doit plus rien.",
    )
  })
})

describe('repaymentExceedsDebtPhrase', () => {
  it('refus honnête quand le paiement dépasse la dette (§27)', () => {
    expect(repaymentExceedsDebtPhrase('Adjoua', 2000, 3000)).toBe(
      'Adjoua ne te doit que 2 000 francs. Je ne peux pas noter un paiement de 3 000.',
    )
  })

  it('refus quand le client ne doit déjà plus rien', () => {
    expect(repaymentExceedsDebtPhrase('Koffi', 0, 1000)).toBe(
      'Koffi ne te doit que 0 francs. Je ne peux pas noter un paiement de 1 000.',
    )
  })
})

describe('debtTotalPhrase', () => {
  it('résume le total dû (§27-28)', () => {
    expect(debtTotalPhrase(25000, 3)).toBe(
      'Tes clients te doivent 25 000 francs en tout, sur 3 crédits.',
    )
  })

  it('accorde « crédit » au singulier pour un seul client', () => {
    expect(debtTotalPhrase(5000, 1)).toBe(
      'Tes clients te doivent 5 000 francs en tout, sur 1 crédit.',
    )
  })
})
