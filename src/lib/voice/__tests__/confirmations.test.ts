import { describe, it, expect } from 'vitest'
import {
  normalizeConfirmationText,
  parseConfirmation,
  CONFIRMATION_VOCABULARY,
  routeConfirmResponse,
} from '../confirmations'

describe('normalizeConfirmationText', () => {
  it('retire les tons (NFD), unifie apostrophes et minuscules', () => {
    expect(normalizeConfirmationText('Ɛhɛ́ !')).toBe('ɛhɛ')
    expect(normalizeConfirmationText("C'est ça.")).toBe("c'est ca")
    expect(normalizeConfirmationText('  D’ACCORD ')).toBe("d'accord")
  })
})

describe('parseConfirmation — français (superset des regex historiques)', () => {
  it.each(['oui', 'Oui', 'OUI', 'oui oui', "c'est ça", "c'est ca", 'exact', "c'est bon", 'ouais', "D'accord", 'OK'])(
    'yes : « %s »',
    (input) => {
      expect(parseConfirmation(input)).toBe('yes')
    },
  )

  it.each(['non', 'NON', 'non non', 'annule', 'annuler'])('no : « %s »', (input) => {
    expect(parseConfirmation(input)).toBe('no')
  })
})

describe('parseConfirmation — baoulé (liste PILOTE, validation natif B3-032)', () => {
  it.each(['ɛhɛ', 'ɛhɛ́', 'Ɛhɛ', 'ehe', 'ɔ', 'ɔɔ', 'o', 'oo', 'ɛhɛ, d’accord'])('yes bci : « %s »', (input) => {
    expect(parseConfirmation(input)).toBe('yes')
  })

  it.each(['ao', 'Ao.', 'a o', 'àó'])('no bci : « %s »', (input) => {
    expect(parseConfirmation(input)).toBe('no')
  })

  it('« a o » est reconnu AVANT le oui court « o »', () => {
    expect(parseConfirmation('a o')).toBe('no')
  })
})

describe('parseConfirmation — réponses hors vocabulaire', () => {
  it.each([
    'ouvre la caisse',
    'tomates deux mille',
    "je n'ai pas compris",
    '',
    '   ',
    'vente 5000',
  ])('null : « %s » (ré-analysée comme nouvelle commande par la modale)', (input) => {
    expect(parseConfirmation(input)).toBeNull()
  })

  it('ne confond pas un début de phrase contenant oui/no en milieu de mots', () => {
    // « maintenant » contient pas de match ancré ; « retour » ne matche pas non plus.
    expect(parseConfirmation('maintenant')).toBeNull()
    expect(parseConfirmation('retourner au stock')).toBeNull()
  })
})

describe('CONFIRMATION_VOCABULARY', () => {
  it('expose les listes pilotes fr + bci (documentation vivante)', () => {
    expect(CONFIRMATION_VOCABULARY.fr.yes).toContain('oui')
    expect(CONFIRMATION_VOCABULARY.fr.no).toContain('non')
    expect(CONFIRMATION_VOCABULARY.bci.yes).toContain('ɛhɛ')
    expect(CONFIRMATION_VOCABULARY.bci.no).toContain('ao')
  })
})

describe('routeConfirmResponse — routage de la phase confirmation (audit VOCAL-605)', () => {
  it('« oui » et variantes bilingues → yes', () => {
    expect(routeConfirmResponse('oui')).toEqual({ kind: 'yes' })
    expect(routeConfirmResponse('ɛhɛ')).toEqual({ kind: 'yes' })
    expect(routeConfirmResponse("C'est ça")).toEqual({ kind: 'yes' })
  })

  it('« non » et variantes bilingues → no', () => {
    expect(routeConfirmResponse('non')).toEqual({ kind: 'no' })
    expect(routeConfirmResponse('ao')).toEqual({ kind: 'no' })
    expect(routeConfirmResponse('annule')).toEqual({ kind: 'no' })
  })

  it('« encore tomates 2000 » → intent sale enchaînée (vente suivante perdue avant le fix)', () => {
    const route = routeConfirmResponse('encore tomates 2000')
    expect(route.kind).toBe('intent')
    if (route.kind === 'intent') {
      expect(route.intent.type).toBe('sale')
      expect(route.intent.amount).toBe(2000)
    }
  })

  it('« mes ventes » → intent navigation (au lieu de fermer en silence)', () => {
    const route = routeConfirmResponse('mes ventes')
    expect(route.kind).toBe('intent')
    if (route.kind === 'intent') {
      expect(route.intent.type).toBe('navigation')
      expect(route.intent.targetRoute).toBe('ventes')
    }
  })

  it('« stop » → intent cancel (la modale ferme poliment)', () => {
    const route = routeConfirmResponse('stop')
    expect(route.kind).toBe('intent')
    if (route.kind === 'intent') {
      expect(route.intent.type).toBe('cancel')
    }
  })

  it('réponse incompréhensible → intent unknown (la modale repose la question)', () => {
    const route = routeConfirmResponse('euh comment dire')
    expect(route.kind).toBe('intent')
    if (route.kind === 'intent') {
      expect(route.intent.type).toBe('unknown')
    }
  })
})
