import { describe, it, expect } from 'vitest'
import { PROVISIONAL_MARKETS, MARKET_OPTIONS, resolveMarketName, type MarketChoice } from '../markets'

// MODE-901 (§5.2) — liste provisoire des marchés. Aucune table/API « marché »
// n'existe encore en base (audit PLAN_MARKET_MODE §1.3-5) : la liste est
// assumée comme provisoire et remplacée dès qu'une source serveur apparaît.
// « Autre » permet la saisie libre, jamais bloquante.

describe('markets — liste provisoire (§5.2)', () => {
  it('propose les marchés cités par le cahier des charges', () => {
    const names = PROVISIONAL_MARKETS.map((m) => m.name)
    expect(names).toContain("Marché d'Adjamé")
    expect(names).toContain('Marché de Treichville')
    expect(names).toContain('Marché de Yopougon')
    expect(names).toContain('Marché de Cocody')
  })

  it('expose 4 options : position actuelle, marché choisi, sans position, saisie libre', () => {
    expect(MARKET_OPTIONS).toHaveLength(4)
    expect(MARKET_OPTIONS.map((o) => o.id)).toEqual(['gps', 'select', 'none', 'autre'])
  })

  it('resolveMarketName retourne le libellé du marché choisi', () => {
    const adjame = PROVISIONAL_MARKETS.find((m) => m.id === 'adjame')!
    expect(resolveMarketName(adjame.id as MarketChoice, null)).toBe("Marché d'Adjamé")
  })

  it('« Autre » exige un nom libre non vide (trim) — sinon null', () => {
    expect(resolveMarketName('autre', '  Marché de Bouaké  ')).toBe('Marché de Bouaké')
    expect(resolveMarketName('autre', '   ')).toBeNull()
    expect(resolveMarketName('autre', null)).toBeNull()
  })

  it('aucun marché connu pour les modes sans sélection', () => {
    expect(resolveMarketName(null, 'ignore')).toBeNull()
  })
})
