import { describe, expect, it } from 'vitest'

// Lexique ivoirien VERSIONNÉ (MODE-955) — ce module est la source de
// vérité des données produits/nombres consommées par localIntent. On
// verrouille ici : l'intégrité (aucun alias en doublon — un doublon est
// un bug SILENCIEUX de routage produit), la recherche, et les entrées
// nouchi/marché CI ajoutées en v1.1.0.

import {
  findLexiqueProduct,
  lexiqueCoverage,
  LEXIQUE_VERSION,
  NUMBER_WORDS,
  PRODUCT_VOCAB,
} from '../lexique-ivoirien'
import { parseIntent } from '../localIntent'

describe('lexique ivoirien versionné (MODE-955)', () => {
  it('porte une version et une couverture cohérente (diagnostics honnêtes)', () => {
    expect(LEXIQUE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    const coverage = lexiqueCoverage()
    expect(coverage.version).toBe(LEXIQUE_VERSION)
    expect(coverage.productCount).toBe(Object.keys(PRODUCT_VOCAB).length)
    const aliasTotal = Object.values(PRODUCT_VOCAB).reduce((acc, a) => acc + a.length, 0)
    expect(coverage.aliasCount).toBe(aliasTotal)
    expect(coverage.productCount).toBeGreaterThanOrEqual(31) // 28 historiques + attiéké/gari/haricots
  })

  it('AUCUN alias en doublon entre deux produits (routage silencieux interdit)', () => {
    const seen = new Map<string, string>()
    const duplicates: string[] = []
    for (const [canonical, aliases] of Object.entries(PRODUCT_VOCAB)) {
      for (const alias of aliases) {
        const key = alias.toLowerCase()
        const owner = seen.get(key)
        if (owner && owner !== canonical) {
          duplicates.push(`« ${alias} » revendiqué par ${owner} ET ${canonical}`)
        } else {
          seen.set(key, canonical)
        }
      }
    }
    expect(duplicates).toEqual([])
  })

  it('chaque canonique figure dans ses propres alias (l’entrée se trouve elle-même)', () => {
    for (const [canonical, aliases] of Object.entries(PRODUCT_VOCAB)) {
      expect(
        aliases.some((a) => a.toLowerCase() === canonical.toLowerCase()),
        `canonique « ${canonical} » absent de ses alias`,
      ).toBe(true)
    }
  })

  it('findLexiqueProduct : alias exact, casse ignorée, null hors lexique', () => {
    expect(findLexiqueProduct('tomates')).toEqual({ canonical: 'tomates', matchedAlias: 'tomates' })
    expect(findLexiqueProduct('  TOM ')).toEqual({ canonical: 'tomates', matchedAlias: 'tom' })
    expect(findLexiqueProduct('voiture')).toBeNull()
    expect(findLexiqueProduct('   ')).toBeNull()
  })

  it('les nouveaux produits du marché CI (v1.1.0) sont reconnus par le parseur vocal', () => {
    expect(parseIntent('attieke 500f').product).toBe('attiéké')
    expect(parseIntent('vendu 2 gari 1000').product).toBe('gari')
    expect(parseIntent('haricot 300f').product).toBe('haricots')
  })

  it('les verrouillages historiques restent intacts après extraction (couscous → manioc, usage CI)', () => {
    expect(parseIntent('couscous 500f').product).toBe('manioc')
    expect(parseIntent('tomates 5000f').product).toBe('tomates')
  })

  it('NUMBER_WORDS couvre les quantités orales de base', () => {
    expect(NUMBER_WORDS['deux']).toBe(2)
    expect(NUMBER_WORDS['mille']).toBe(1000)
    expect(NUMBER_WORDS['seize']).toBe(16)
  })
})
