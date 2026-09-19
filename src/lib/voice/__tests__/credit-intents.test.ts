import { describe, expect, it } from 'vitest'
import { parseIntent } from '../localIntent'

// MODE-906 (§21-22) — intents vocaux de crédit : « <nom> me doit <montant> »
// (nouvelle dette) et « <nom> m'a payé <montant> » (remboursement).
// Les phrases de vente et de stock restent inchangées.

describe('parseIntent — credit_doit (MODE-906, §21)', () => {
  it('capte « Adjoua me doit 5 000 francs » (cahier des charges)', () => {
    const intent = parseIntent('Adjoua me doit 5 000 francs')
    expect(intent.type).toBe('credit_doit')
    expect(intent.client).toBe('Adjoua')
    expect(intent.amount).toBe(5000)
  })

  it('capte le montant en lettres : « Adjoua me doit deux mille francs »', () => {
    const intent = parseIntent('Adjoua me doit deux mille francs')
    expect(intent.type).toBe('credit_doit')
    expect(intent.client).toBe('Adjoua')
    expect(intent.amount).toBe(2000)
  })

  it('capte un nom composé : « Adjoua Koné me doit 1 500 francs »', () => {
    const intent = parseIntent('Adjoua Koné me doit 1 500 francs')
    expect(intent.type).toBe('credit_doit')
    expect(intent.client).toBe('Adjoua Koné')
    expect(intent.amount).toBe(1500)
  })

  it('capte l’abréviation F : « Adjoua me doit 1500 F »', () => {
    const intent = parseIntent('Adjoua me doit 1500 F')
    expect(intent.type).toBe('credit_doit')
    expect(intent.amount).toBe(1500)
  })

  it('refus propre sans montant : intent reconnu, amount absent', () => {
    const intent = parseIntent('Adjoua me doit')
    expect(intent.type).toBe('credit_doit')
    expect(intent.amount).toBeUndefined()
    expect(intent.responseText).toMatch(/combien/i)
  })

  it('est insensible à la casse', () => {
    const intent = parseIntent('koffi ME DOIT 500 francs')
    expect(intent.type).toBe('credit_doit')
    expect(intent.client).toBe('koffi')
    expect(intent.amount).toBe(500)
  })
})

describe('parseIntent — credit_paye (MODE-906, §22)', () => {
  it('capte « Adjoua m\'a payé les 3 000 francs » (cahier des charges)', () => {
    const intent = parseIntent("Adjoua m'a payé les 3 000 francs")
    expect(intent.type).toBe('credit_paye')
    expect(intent.client).toBe('Adjoua')
    expect(intent.amount).toBe(3000)
  })

  it('capte l’apostrophe dactylographique : "Adjoua m\'a payé 3000"', () => {
    const intent = parseIntent("Adjoua m'a payé 3000")
    expect(intent.type).toBe('credit_paye')
    expect(intent.amount).toBe(3000)
  })

  it('capte l’apostrophe typographique : « Adjoua m’a payé les 3000 francs »', () => {
    const intent = parseIntent('Adjoua m’a payé les 3000 francs')
    expect(intent.type).toBe('credit_paye')
    expect(intent.client).toBe('Adjoua')
    expect(intent.amount).toBe(3000)
  })

  it('capte la forme simple : « Adjoua a payé 3 000 »', () => {
    const intent = parseIntent('Adjoua a payé 3 000')
    expect(intent.type).toBe('credit_paye')
    expect(intent.client).toBe('Adjoua')
    expect(intent.amount).toBe(3000)
  })

  it('refus propre sans montant', () => {
    const intent = parseIntent('Adjoua m’a payé')
    expect(intent.type).toBe('credit_paye')
    expect(intent.amount).toBeUndefined()
  })

  it('« j’ai payé 2000 francs transport » reste une dépense (jamais un crédit)', () => {
    const intent = parseIntent("j'ai payé 2000 francs transport")
    expect(intent.type).toBe('expense')
  })
})

describe('parseIntent — non-capture vente/stock (MODE-906)', () => {
  it('« vente de tomates 2000 » reste une vente', () => {
    const intent = parseIntent('vente de tomates 2000')
    expect(intent.type).toBe('sale')
  })

  it('« j\'ai vendu 2 kilos de tomates 2000 » reste une vente', () => {
    const intent = parseIntent("j'ai vendu 2 kilos de tomates 2000")
    expect(intent.type).toBe('sale')
  })

  it('« j\'ai acheté 2 sacs de riz à 12 000 » reste un achat de stock', () => {
    const intent = parseIntent("j'ai acheté 2 sacs de riz à 12 000")
    expect(intent.type).toBe('purchase')
  })

  it('une phrase mêlant dette et vente vendue n’est PAS un intent crédit', () => {
    const intent = parseIntent('Adjoua me doit les tomates vendues hier')
    expect(intent.type).not.toBe('credit_doit')
    expect(intent.type).not.toBe('credit_paye')
  })

  it('« vendre à crédit » reste bloqué par credit_block (aide, §21)', () => {
    const intent = parseIntent('je veux vendre à crédit')
    expect(intent.type).toBe('credit_block')
    expect(intent.responseText).toMatch(/caisse/)
  })
})
