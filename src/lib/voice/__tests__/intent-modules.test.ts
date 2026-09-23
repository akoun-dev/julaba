// MODE-994 (DET-001 tranche 8) — épinglage des modules extraits de
// localIntent.ts : comportements historiques inline désormais couverts
// directement au niveau des nouvelles libs pures (white-box).
import { describe, it, expect } from 'vitest'
import { parseFrenchNumber, extractAmount } from '../intent/numbers'
import { extractQuantity, extractQuantityWithUnit } from '../intent/quantities'
import { extractProduct, searchProducts, getAllProducts } from '../intent/products'
import { parseVoicePin } from '../intent/pin'
import { creditClientName, creditTailAmount, END_CONVERSATION_RE } from '../intent/triggers'
import { normalizeVoiceTranscript } from '../intent/transcript'
import { buildClarifyingIntent } from '../intent/clarify'
import { parseIntent, TATA_GOODBYE } from '../localIntent'

describe('intent/numbers — nombres et montants', () => {
  it('parseFrenchNumber lit les nombres en lettres (lexique MODE-955)', () => {
    expect(parseFrenchNumber('deux mille')).toBe(2000)
    expect(parseFrenchNumber('mille cinq')).toBe(1005)
    expect(parseFrenchNumber('sept')).toBe(7)
  })

  it('quirk historique figé : « cents » pluriel absent du lexique', () => {
    // parseSimpleNumber ignore « cents » (le lexique ne contient que « cent »)
    // → « deux mille cinq cents » = 2×1000 + 5. Comportement historique
    // PROUVÉ identique avant/après split (2005 sur l'original git 4532d48) ;
    // le commentaire d'origine annonçait 2500 — jamais vrai avec ce lexique.
    expect(parseFrenchNumber('deux mille cinq cents')).toBe(2005)
  })

  it('parseFrenchNumber lit les montants abrégés à suffixe f', () => {
    expect(parseFrenchNumber('2000f')).toBe(2000)
  })

  it('quirk historique figé : la branche « X mille » ne lit que des mots', () => {
    // parseSimpleNumber ne lit pas les chiffres : le préfixe « 2 » de
    // « 2millef » est ignoré → 1×1000. Prouvé identique avant/après split.
    expect(parseFrenchNumber('2millef')).toBe(1000)
  })

  it('parseFrenchNumber renvoie null hors lexique', () => {
    expect(parseFrenchNumber('xyzabc')).toBeNull()
  })

  it('extractAmount privilégie les chiffres finaux sur les mots (VOCAL-603)', () => {
    // « trois » ne doit PAS être lu comme montant : les chiffres finaux font foi.
    expect(extractAmount('trois sacs de riz 2000')).toBe(2000)
  })

  it('extractAmount lit francs/FCFA et abréviation f', () => {
    expect(extractAmount('5000 FCFA')).toBe(5000)
    expect(extractAmount('pommes 1500f')).toBe(1500)
  })

  it('extractAmount renvoie null sans montant', () => {
    expect(extractAmount('merci Tata')).toBeNull()
  })
})

describe('intent/quantités — quantité seule et quantité+unité (STK-807)', () => {
  it('extractQuantity lit chiffres et mots, format X à Y', () => {
    expect(extractQuantity('2 sacs de riz')).toBe(2)
    expect(extractQuantity('deux sacs')).toBe(2)
    expect(extractQuantity('vente 3 à 500')).toBe(3)
    expect(extractQuantity('bonjour')).toBeNull()
  })

  it('extractQuantityWithUnit résout le code canonique du catalogue units', () => {
    expect(extractQuantityWithUnit('2 sacs de riz')).toEqual({ quantity: 2, unit: 'sac' })
    expect(extractQuantityWithUnit('1,5 kilo')).toEqual({ quantity: 1.5, unit: 'kg' })
    expect(extractQuantityWithUnit('deux régimes de plantain')).toEqual({ quantity: 2, unit: 'regime' })
  })

  it('extractQuantityWithUnit : nombre nu sans mot d\'unité → unit null', () => {
    expect(extractQuantityWithUnit('vendu 5 tomates')).toEqual({ quantity: 5, unit: null })
    expect(extractQuantityWithUnit('merci')).toBeNull()
  })
})

describe('intent/products — lexique produits', () => {
  it('extractProduct reconnaît canonique et alias STT', () => {
    expect(extractProduct('vente de tomates 2000')).toBe('tomates')
    expect(extractProduct('ognons 500')).toBe('oignons')
    expect(extractProduct('xyzabc')).toBeNull()
  })

  it('searchProducts et getAllProducts exposent le lexique', () => {
    expect(searchProducts('tom')).toContain('tomates')
    expect(searchProducts('zzzz')).toEqual([])
    expect(getAllProducts()).toContain('tomates')
    expect(getAllProducts().length).toBeGreaterThan(10)
  })
})

describe('intent/pin — PIN vocal 4 chiffres', () => {
  it('lit les chiffres dictés en mots comme en chiffres', () => {
    expect(parseVoicePin('un deux trois quatre')).toEqual([1, 2, 3, 4])
    expect(parseVoicePin('1 2 3 4')).toEqual([1, 2, 3, 4])
    expect(parseVoicePin('zéro un deux trois')).toEqual([0, 1, 2, 3])
  })

  it('exige exactement 4 chiffres', () => {
    expect(parseVoicePin('un deux trois')).toBeNull()
    expect(parseVoicePin('un deux trois quatre cinq')).toBeNull()
  })
})

describe('intent/triggers — helpers crédit et fin de conversation', () => {
  it('creditClientName accepte 1 à 3 mots valides', () => {
    expect(creditClientName('Adjoua')).toBe('Adjoua')
    expect(creditClientName('Adjoua Koné')).toBe('Adjoua Koné')
    expect(creditClientName("l'adjoua")).toBe("l'adjoua")
  })

  it('creditClientName refuse pronoms et structures invalides', () => {
    expect(creditClientName('je')).toBeNull()
    expect(creditClientName('la')).toBeNull()
    expect(creditClientName('Adjoua Koné Yao Kouassi')).toBeNull()
    expect(creditClientName('')).toBeNull()
  })

  it('creditTailAmount normalise l\'espace des milliers puis extrait', () => {
    expect(creditTailAmount('les 3 000 francs')).toBe(3000)
    expect(creditTailAmount('beaucoup')).toBeNull()
    expect(creditTailAmount(undefined)).toBeNull()
  })

  it('END_CONVERSATION_RE capte les clotûres explicites, pas une vente', () => {
    expect(END_CONVERSATION_RE.test('plus rien')).toBe(true)
    expect(END_CONVERSATION_RE.test("c'est tout")).toBe(true)
    expect(END_CONVERSATION_RE.test('il me reste plus rien de tomates')).toBe(true)
    expect(END_CONVERSATION_RE.test('vendu tomates 2000')).toBe(false)
  })
})

describe('intent/transcript — normalisation du transcript', () => {
  it('retire les wake-words Tata et Assistant', () => {
    expect(normalizeVoiceTranscript('Tata, vendu tomates 2000')).toBe('vendu tomates 2000')
    expect(normalizeVoiceTranscript('Assistant ouvre la caisse')).toBe('ouvre la caisse')
  })

  it('normalise apostrophes typographiques et remplissage', () => {
    expect(normalizeVoiceTranscript('J\u2019ai vendu tomates')).toBe("j'ai vendu tomates")
    expect(normalizeVoiceTranscript('Eh dépensé 500')).toBe('dépensé 500')
  })
})

describe('intent/clarify — questions de clarification (fallback ML)', () => {
  it('propose un rappel ciblé pour les types connus', () => {
    const r = buildClarifyingIntent('sale', 'un truc', 0.7)
    expect(r.type).toBe('unknown')
    expect(r.confidence).toBe(0.7)
    expect(r.rawTranscript).toBe('un truc')
    expect(r.responseText).toContain('vente')
  })

  it('réponse générique pour les types sans prompt dédié', () => {
    const r = buildClarifyingIntent('stock_check', 'x', 0.5)
    expect(r.responseText).toBe("Je n'ai pas bien compris. Pouvez-vous répéter ?")
  })
})

describe('orchestrateur localIntent — façade API publique inchangée', () => {
  it('parseIntent et TATA_GOODBYE restent servis depuis la façade', () => {
    expect(parseIntent('oui').type).toBe('yes')
    expect(TATA_GOODBYE).toBe("D'accord, à bientôt et bonne journée !")
  })

  it('une vente complète traverse la façade sans régression', () => {
    const r = parseIntent('vendu 5 tomates 2000')
    expect(r.type).toBe('sale')
    expect(r.product).toBe('tomates')
    expect(r.amount).toBe(2000)
  })
})
