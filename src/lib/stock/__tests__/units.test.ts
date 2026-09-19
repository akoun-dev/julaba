import { describe, it, expect } from 'vitest'
import {
  STOCK_UNITS,
  resolveUnitCode,
  getBaseUnit,
  getDefaultSaleUnit,
  findUnit,
  toBaseQuantity,
  fromBaseQuantityExact,
  buildStockDisplayParts,
  formatStockDisplay,
  formatQuantity,
  unitLabel,
  roundQuantity,
} from '../units'

describe('STOCK_UNITS — catalogue CI (STK-806 + extension vocale STK-807)', () => {
  it('contient 21 unités, chacune avec code + libellé + alias', () => {
    expect(STOCK_UNITS).toHaveLength(21)
    for (const u of STOCK_UNITS) {
      expect(u.code.length).toBeGreaterThan(0)
      expect(u.labelFr.length).toBeGreaterThan(0)
      expect(u.aliases.length).toBeGreaterThan(0)
      expect(['mass', 'volume', 'container', 'count']).toContain(u.kind)
    }
  })

  it('couvre le vocabulaire du marché ivoirien', () => {
    const codes = STOCK_UNITS.map((u) => u.code)
    for (const expected of ['kg', 'g', 'l', 'sac', 'carton', 'caisse', 'bassine', 'panier', 'tas', 'botte', 'bidon', 'fut', 'seau', 'piece', 'unite', 'lot', 'ml', 'regime', 'sachet', 'plateau', 'boite']) {
      expect(codes).toContain(expected)
    }
  })

  it('aucun alias ne pointe vers deux codes différents', () => {
    const seen = new Map<string, string>()
    for (const u of STOCK_UNITS) {
      for (const a of u.aliases) {
        const existing = seen.get(a)
        expect(existing ?? u.code).toBe(u.code)
        seen.set(a, u.code)
      }
    }
  })

  it('chaque code est lui-même un alias (boucle resolveUnitCode(code) → code)', () => {
    for (const u of STOCK_UNITS) {
      expect(resolveUnitCode(u.code)).toBe(u.code)
    }
  })
})

describe('resolveUnitCode — résolution vocale', () => {
  it('résout les formes orales courantes', () => {
    expect(resolveUnitCode('kilo')).toBe('kg')
    expect(resolveUnitCode('kilos')).toBe('kg')
    expect(resolveUnitCode('Kilogramme')).toBe('kg')
    expect(resolveUnitCode('sacs')).toBe('sac')
    expect(resolveUnitCode('bassine')).toBe('bassine')
    expect(resolveUnitCode('pièce')).toBe('piece')
    expect(resolveUnitCode('unités')).toBe('unite')
  })

  it('résout les accents des deux façons (fût/fut)', () => {
    expect(resolveUnitCode('fût')).toBe('fut')
    expect(resolveUnitCode('fut')).toBe('fut')
    expect(resolveUnitCode('fûts')).toBe('fut')
  })

  it('renvoie null pour une unité inconnue — jamais d\'invention', () => {
    expect(resolveUnitCode('camion')).toBeNull()
    expect(resolveUnitCode('')).toBeNull()
    expect(resolveUnitCode(null)).toBeNull()
    expect(resolveUnitCode(undefined)).toBeNull()
  })
})

describe('getBaseUnit / getDefaultSaleUnit / findUnit', () => {
  const config = [
    { unitCode: 'sac', conversionToBase: 25, isBase: false, isDefaultSale: true },
    { unitCode: 'kg', conversionToBase: 1, isBase: true, isDefaultSale: false },
  ]

  it('trouve l\'unité de base (conversion 1)', () => {
    expect(getBaseUnit(config)?.unitCode).toBe('kg')
  })

  it('trouve l\'unité de vente par défaut', () => {
    expect(getDefaultSaleUnit(config)?.unitCode).toBe('sac')
  })

  it('retombe sur la base quand pas de default', () => {
    const noDefault = config.map((u) => ({ ...u, isDefaultSale: false }))
    expect(getDefaultSaleUnit(noDefault)?.unitCode).toBe('kg')
  })

  it('honnête : config vide ou absente → null (pas de fausse conversion)', () => {
    expect(getBaseUnit([])).toBeNull()
    expect(getBaseUnit(null)).toBeNull()
    expect(getBaseUnit(undefined)).toBeNull()
    expect(getDefaultSaleUnit([])).toBeNull()
    expect(findUnit(null, 'sac')).toBeNull()
    expect(findUnit(config, 'camion')).toBeNull()
  })

  it('findUnit retrouve une unité par code', () => {
    expect(findUnit(config, 'sac')?.conversionToBase).toBe(25)
  })
})

describe('conversions base ↔ commerciale', () => {
  const sac = { unitCode: 'sac', conversionToBase: 25, isBase: false, isDefaultSale: false }

  it('toBaseQuantity multiplie (3 sacs de 25 kg = 75 kg)', () => {
    expect(toBaseQuantity(3, sac)).toBe(75)
  })

  it('fromBaseQuantityExact divise et renvoie null si non exact', () => {
    expect(fromBaseQuantityExact(75, sac)).toBe(3)
    expect(fromBaseQuantityExact(50, sac)).toBe(2)
    // 10/3 = 3,333… — le reste n'est pas représentable, on refuse.
    expect(fromBaseQuantityExact(10, { ...sac, conversionToBase: 3 })).toBeNull()
  })

  it('protection flottante : 2,999… ≈ 3', () => {
    expect(fromBaseQuantityExact(74.99999999999999, sac)).toBe(3)
  })

  it('conversion ≤ 0 → null (donnée corrompue jamais crue)', () => {
    expect(fromBaseQuantityExact(10, { ...sac, conversionToBase: 0 })).toBeNull()
  })
})

describe('buildStockDisplayParts — « 2 sacs + 13 kilos » (§8)', () => {
  const config = [
    { unitCode: 'kg', conversionToBase: 1, isBase: true, isDefaultSale: false },
    { unitCode: 'sac', conversionToBase: 25, isBase: false, isDefaultSale: true },
  ]

  it('décompose 63 kg = 2 sacs + 13 kilos', () => {
    expect(buildStockDisplayParts(63, config, 'kg')).toEqual([
      { unitCode: 'sac', quantity: 2 },
      { unitCode: 'kg', quantity: 13 },
    ])
  })

  it('50 kg pile = 2 sacs, pas de « + 0 kilo »', () => {
    expect(buildStockDisplayParts(50, config, 'kg')).toEqual([{ unitCode: 'sac', quantity: 2 }])
  })

  it('13 kg < 1 sac = 13 kilos, pas de « 0 sac + »', () => {
    expect(buildStockDisplayParts(13, config, 'kg')).toEqual([{ unitCode: 'kg', quantity: 13 }])
  })

  it('0 = 0 dans l\'unité de base (jamais vide)', () => {
    expect(buildStockDisplayParts(0, config, 'kg')).toEqual([{ unitCode: 'kg', quantity: 0 }])
  })

  it('décimales conservées sur le reste (13,75 kg)', () => {
    expect(buildStockDisplayParts(63.75, config, 'kg')).toEqual([
      { unitCode: 'sac', quantity: 2 },
      { unitCode: 'kg', quantity: 13.75 },
    ])
  })

  it('plusieurs contenants : 1 bidon de 20 + 1 seau de 10 + 3 kg', () => {
    const riche = [
      { unitCode: 'kg', conversionToBase: 1, isBase: true, isDefaultSale: false },
      { unitCode: 'bidon', conversionToBase: 20, isBase: false, isDefaultSale: false },
      { unitCode: 'seau', conversionToBase: 10, isBase: false, isDefaultSale: false },
    ]
    expect(buildStockDisplayParts(33, riche, 'kg')).toEqual([
      { unitCode: 'bidon', quantity: 1 },
      { unitCode: 'seau', quantity: 1 },
      { unitCode: 'kg', quantity: 3 },
    ])
  })

  it('honnête sans config : la quantité brute seule', () => {
    expect(buildStockDisplayParts(63, null, 'kg')).toEqual([{ unitCode: 'kg', quantity: 63 }])
    expect(buildStockDisplayParts(63, [], null)).toEqual([{ unitCode: '', quantity: 63 }])
  })
})

describe('formatStockDisplay', () => {
  const config = [
    { unitCode: 'kg', conversionToBase: 1, isBase: true, isDefaultSale: false },
    { unitCode: 'sac', conversionToBase: 25, isBase: false, isDefaultSale: true },
  ]

  it('« 2 sacs + 13 kilos »', () => {
    expect(formatStockDisplay(63, config, 'kg')).toBe('2 sacs + 13 kilos')
  })

  it('singulier : « 1 sac »', () => {
    expect(formatStockDisplay(25, config, 'kg')).toBe('1 sac')
  })

  it('sans config ni base connue : « 63 » (jamais d\'unité inventée)', () => {
    expect(formatStockDisplay(63, null)).toBe('63')
    expect(formatStockDisplay(63, [])).toBe('63')
  })

  it('décimales françaises : « 1,5 kilos »', () => {
    expect(formatStockDisplay(1.5, config, 'kg')).toBe('1,5 kilos')
  })
})

describe('formatQuantity / unitLabel / roundQuantity', () => {
  it('formatQuantity : entier propre, virgule française, 3 décimales max', () => {
    expect(formatQuantity(13)).toBe('13')
    expect(formatQuantity(1.5)).toBe('1,5')
    expect(formatQuantity(13.75)).toBe('13,75')
    expect(formatQuantity(0.123456)).toBe('0,123')
  })

  it('unitLabel pluriel régulier', () => {
    expect(unitLabel('sac', 1)).toBe('sac')
    expect(unitLabel('sac', 2)).toBe('sacs')
    expect(unitLabel('kg', 13)).toBe('kilos')
  })

  it('roundQuantity aligne sur numeric(14,3)', () => {
    expect(roundQuantity(0.123456)).toBe(0.123)
    expect(roundQuantity(2.9999999999)).toBe(3)
  })
})
