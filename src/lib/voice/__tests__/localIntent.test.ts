import { describe, it, expect } from 'vitest'
import {
  parseIntent,
  parseFrenchNumber,
  extractAmount,
  extractProduct,
  extractQuantity,
  parseVoicePin,
  formatFCFA,
  searchProducts,
  getAllProducts,
  buildClarifyingIntent,
} from '../localIntent'

describe('parseFrenchNumber', () => {
  it('parses direct digits', () => {
    expect(parseFrenchNumber('2000')).toBe(2000)
    expect(parseFrenchNumber('42')).toBe(42)
  })

  it('parses "f" suffix amounts', () => {
    expect(parseFrenchNumber('2000f')).toBe(2000)
    expect(parseFrenchNumber('100 f')).toBe(100)
    expect(parseFrenchNumber('500francs')).toBe(500)
  })

  it('parses "mille" patterns', () => {
    expect(parseFrenchNumber('mille cinq')).toBe(1005) // literal: 1000 + 5
    expect(parseFrenchNumber('deux mille')).toBe(2000)
    expect(parseFrenchNumber('mille')).toBe(1000)
  })

  it('parses simple word numbers', () => {
    expect(parseFrenchNumber('cinq')).toBe(5)
    expect(parseFrenchNumber('vingt')).toBe(20)
  })

  it('returns null for unparseable text', () => {
    expect(parseFrenchNumber('bonjour')).toBeNull()
  })
})

describe('extractAmount', () => {
  it('extracts "X francs" / "X FCFA"', () => {
    expect(extractAmount('2000 francs')).toBe(2000)
    expect(extractAmount('500 FCFA')).toBe(500)
  })

  it('extracts "Xf" abbreviations', () => {
    expect(extractAmount('2000f')).toBe(2000)
  })

  it('extracts word-based amounts', () => {
    expect(extractAmount('deux mille')).toBe(2000)
  })

  it('extracts standalone digits at end', () => {
    expect(extractAmount('tomates 2000')).toBe(2000)
  })

  it('returns null when no amount found', () => {
    expect(extractAmount('bonjour')).toBeNull()
  })
})

describe('extractProduct', () => {
  it('finds canonical product names', () => {
    expect(extractProduct('tomates')).toBe('tomates')
    expect(extractProduct('oignons')).toBe('oignons')
    expect(extractProduct('piments')).toBe('piments')
  })

  it('finds product aliases', () => {
    expect(extractProduct('plantain')).toBe('bananes')
    expect(extractProduct('couscous')).toBe('manioc')
    expect(extractProduct('tilapia')).toBe('poisson')
    expect(extractProduct('cacahuète')).toBe('arachides')
    expect(extractProduct('patate')).toBe('pomme de terre')
  })

  it('is case-insensitive', () => {
    expect(extractProduct('Tomates')).toBe('tomates')
    expect(extractProduct('TOMATES')).toBe('tomates')
  })

  it('returns null for unknown products', () => {
    expect(extractProduct('voiture')).toBeNull()
  })
})

describe('extractQuantity', () => {
  it('extracts "X unités"', () => {
    expect(extractQuantity('5 kilos')).toBe(5)
    expect(extractQuantity('3 sacs')).toBe(3)
    expect(extractQuantity('10 pièces')).toBe(10)
  })

  it('extracts "X à Y" format', () => {
    expect(extractQuantity('5 à 10')).toBe(5)
  })

  it('returns null when no quantity found', () => {
    expect(extractQuantity('tomates')).toBeNull()
  })
})

describe('parseVoicePin', () => {
  it('parses 4 spoken French digits', () => {
    expect(parseVoicePin('un deux trois quatre')).toEqual([1, 2, 3, 4])
  })

  it('parses 4 numeric digits', () => {
    expect(parseVoicePin('1 2 3 4')).toEqual([1, 2, 3, 4])
  })

  it('parses mixed spoken/numeric', () => {
    expect(parseVoicePin('un 2 trois 4')).toEqual([1, 2, 3, 4])
  })

  it('returns null for non-4-digit input', () => {
    expect(parseVoicePin('un deux trois')).toBeNull()
    expect(parseVoicePin('un deux trois quatre cinq')).toBeNull()
  })
})

describe('parseIntent - yes/no/cancel', () => {
  it('recognizes "oui"', () => {
    const intent = parseIntent('oui')
    expect(intent.type).toBe('yes')
    expect(intent.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('recognizes "c\'est ça"', () => {
    const intent = parseIntent("c'est ça")
    expect(intent.type).toBe('yes')
  })

  it('recognizes "non"', () => {
    const intent = parseIntent('non')
    expect(intent.type).toBe('no')
  })

  it('recognizes cancel', () => {
    const intent = parseIntent('arrête')
    expect(intent.type).toBe('cancel')
  })
})

describe('parseIntent - navigation', () => {
  it('navigates to stock', () => {
    const intent = parseIntent('ouvre mon stock')
    expect(intent.type).toBe('navigation')
    expect(intent.targetRoute).toBe('stock')
    expect(intent.responseText).toBeTruthy()
  })

  it('navigates to caisse', () => {
    const intent = parseIntent('ma caisse')
    expect(intent.type).toBe('navigation')
    expect(intent.targetRoute).toBe('caisse')
  })

  it('navigates to depenses', () => {
    const intent = parseIntent('mes dépenses')
    expect(intent.type).toBe('navigation')
    expect(intent.targetRoute).toBe('depenses')
  })

  it('navigates to ventes', () => {
    const intent = parseIntent('mes ventes')
    expect(intent.type).toBe('navigation')
    expect(intent.targetRoute).toBe('ventes')
  })

  it('navigates to profil', () => {
    const intent = parseIntent('profil')
    expect(intent.type).toBe('navigation')
    expect(intent.targetRoute).toBe('profil')
  })
})

describe('parseIntent - sale', () => {
  it('detects a sale with product and amount', () => {
    const intent = parseIntent('vendu 5 kilos de tomates à 2000 francs')
    expect(intent.type).toBe('sale')
    expect(intent.product).toBe('tomates')
    expect(intent.amount).toBe(2000)
  })

  it('detects a sale with word amounts', () => {
    const intent = parseIntent('j\'ai vendu des oignons deux mille')
    expect(intent.type).toBe('sale')
    expect(intent.product).toBe('oignons')
  })

  it('returns sale with amount and product', () => {
    const intent = parseIntent('tomates 5000f')
    expect(intent.type).toBe('sale')
    expect(intent.product).toBe('tomates')
    expect(intent.amount).toBe(5000)
  })
})

describe('parseIntent - expense', () => {
  it('detects an expense', () => {
    const intent = parseIntent('j\'ai dépensé 1000 francs transport')
    expect(intent.type).toBe('expense')
    expect(intent.amount).toBe(1000)
    expect(intent.category).toBe('transport')
  })

  it('detects expense with "acheté"', () => {
    const intent = parseIntent('acheté du riz 500')
    expect(intent.type).toBe('expense')
  })
})

describe('parseIntent - restock', () => {
  it('detects a restock', () => {
    const intent = parseIntent('reçu 10 kilos de tomates')
    expect(intent.type).toBe('restock')
    expect(intent.product).toBe('tomates')
    expect(intent.quantity).toBe(10)
  })
})

describe('parseIntent - consultation', () => {
  it('detects consultation', () => {
    const intent = parseIntent('combien j\'ai vendu')
    expect(intent.type).toBe('consultation')
  })

  it('detects "bilan"', () => {
    const intent = parseIntent('bilan')
    expect(intent.type).toBe('consultation')
  })
})

describe('parseIntent - credit_block', () => {
  it('blocks credit requests', () => {
    const intent = parseIntent('je veux acheter à crédit')
    expect(intent.type).toBe('credit_block')
  })
})

describe('parseIntent - unknown', () => {
  it('returns unknown for gibberish', () => {
    const intent = parseIntent('blabbla truc machin')
    expect(intent.type).toBe('unknown')
    expect(intent.confidence).toBeLessThan(0.5)
  })
})

describe('parseIntent - product without amount', () => {
  it('asks for price when product is mentioned alone', () => {
    const intent = parseIntent('tomates')
    expect(intent.type).toBe('unknown')
    expect(intent.product).toBe('tomates')
    expect(intent.responseText).toContain('tomates')
  })
})

describe('buildClarifyingIntent', () => {
  it('builds sale clarifying intent', () => {
    const intent = buildClarifyingIntent('sale', 'truc', 0.6)
    expect(intent.type).toBe('unknown')
    expect(intent.responseText).toContain('vente')
  })

  it('builds expense clarifying intent', () => {
    const intent = buildClarifyingIntent('expense', 'truc', 0.6)
    expect(intent.responseText).toContain('dépense')
  })

  it('builds navigation clarifying intent', () => {
    const intent = buildClarifyingIntent('navigation', 'truc', 0.6)
    expect(intent.responseText).toContain('aller')
  })
})

describe('formatFCFA', () => {
  it('formats number with FCFA', () => {
    const result = formatFCFA(2000)
    expect(result).toMatch(/^2[\s\u00a0\u202f]+000 FCFA$/)
    const result2 = formatFCFA(1500000)
    expect(result2).toMatch(/^1[\s\u00a0\u202f]+500[\s\u00a0\u202f]+000 FCFA$/)
  })
})

describe('searchProducts', () => {
  it('finds products by alias', () => {
    const results = searchProducts('tomate')
    expect(results).toContain('tomates')
  })

  it('finds products by canonical name', () => {
    const results = searchProducts('riz')
    expect(results).toContain('riz')
  })

  it('returns empty for no match', () => {
    expect(searchProducts('voiture')).toEqual([])
  })
})

describe('getAllProducts', () => {
  it('returns all canonical product names', () => {
    const products = getAllProducts()
    expect(products.length).toBeGreaterThanOrEqual(20)
    expect(products).toContain('tomates')
    expect(products).toContain('oignons')
    expect(products).toContain('riz')
  })
})
