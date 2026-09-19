import { describe, expect, it } from 'vitest'
import { parseIntent } from '../localIntent'

// MODE-909 (§28) — intent vocal d'annulation de vente : « annule la dernière
// vente » / « annule la vente ». L'annulation reste une CONFIRMATION orale
// côté voice-modal (pendingConfirmRef) — le parseur ne fait que reconnaître
// l'intention. Les phrases de vente, de stock et de crédit restent inchangées.

describe('parseIntent — annule_vente (MODE-909, §28)', () => {
  it('capte « annule la dernière vente » (cahier des charges)', () => {
    const intent = parseIntent('annule la dernière vente')
    expect(intent.type).toBe('annule_vente')
    expect(intent.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('capte « annule la vente » (sans « dernière »)', () => {
    const intent = parseIntent('annule la vente')
    expect(intent.type).toBe('annule_vente')
  })

  it('capte l’infinitif : « annuler la vente »', () => {
    const intent = parseIntent('annuler la vente')
    expect(intent.type).toBe('annule_vente')
  })

  it('capte « annule ma dernière vente » (possessif parlé)', () => {
    const intent = parseIntent('annule ma dernière vente')
    expect(intent.type).toBe('annule_vente')
  })

  it('est insensible à la casse et aux accents manquants (« derniere »)', () => {
    expect(parseIntent('Annule la DERNIERE vente').type).toBe('annule_vente')
    expect(parseIntent('ANNULE LA VENTE').type).toBe('annule_vente')
  })

  it('capte le participe passé parlé : « j’ai annulé la vente d’avant » n’est PAS requis, « annulé la vente » passe', () => {
    const intent = parseIntent('annulé la vente')
    expect(intent.type).toBe('annule_vente')
  })

  it('fournit toujours un responseText parlable (jamais vide)', () => {
    const intent = parseIntent('annule la dernière vente')
    expect(intent.responseText.trim().length).toBeGreaterThan(0)
  })
})

describe('parseIntent — non-capture (MODE-909)', () => {
  it('« annule tout » reste une annulation générique (cancel), jamais une annulation de vente', () => {
    expect(parseIntent('annule tout').type).toBe('cancel')
  })

  it('« annule » seul reste le refus court historique (no), jamais annule_vente', () => {
    expect(parseIntent('annule').type).not.toBe('annule_vente')
  })

  it('« stop » / « arrête » restent des cancels génériques', () => {
    expect(parseIntent('stop').type).toBe('cancel')
    expect(parseIntent('arrête').type).toBe('cancel')
  })

  it('« annule le stock » n’est pas une annulation de vente', () => {
    expect(parseIntent('annule le stock').type).not.toBe('annule_vente')
  })

  it('« vendu 2 tomates 2000 » reste une vente (garde anti-faux positif)', () => {
    expect(parseIntent('vendu 2 tomates 2000').type).toBe('sale')
  })

  it('« Adjoua me doit 5 000 francs » reste un crédit', () => {
    expect(parseIntent('Adjoua me doit 5 000 francs').type).toBe('credit_doit')
  })
})
