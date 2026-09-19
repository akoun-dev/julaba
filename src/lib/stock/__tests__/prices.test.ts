import { describe, it, expect } from 'vitest'
import {
  PRICE_LEVELS,
  resolveCurrentPrice,
  resolvePriceAt,
  computeMargin,
} from '../prices'
import { parseIntent } from '@/lib/voice/localIntent'
import { formatMarginReply } from '@/lib/voice/tata-phrases'

const H = (iso: string) => iso // lisibilité

describe('prices — prix multi-niveaux à validité temporelle (STK-810, §29)', () => {
  const entries = [
    { priceType: 'RETAIL', amountCfa: 500, validFrom: H('2026-09-01T00:00:00Z'), validTo: H('2026-09-10T00:00:00Z') },
    { priceType: 'RETAIL', amountCfa: 600, validFrom: H('2026-09-10T00:00:00Z'), validTo: null },
    { priceType: 'PURCHASE', amountCfa: 350, validFrom: H('2026-09-05T00:00:00Z'), validTo: null },
    { priceType: 'WHOLESALE', amountCfa: 280, validFrom: H('2026-09-05T00:00:00Z'), validTo: null },
  ]

  it('le prix COURANT = ligne ouverte la plus récente (500 fermée → 600)', () => {
    const current = resolveCurrentPrice(entries, 'RETAIL')
    expect(current?.amountCfa).toBe(600)
  })

  it('prix à un instant passé : la validité temporelle fait foi', () => {
    const before = resolvePriceAt(entries, 'RETAIL', new Date('2026-09-05T00:00:00Z'))
    expect(before?.amountCfa).toBe(500)
    const after = resolvePriceAt(entries, 'RETAIL', new Date('2026-09-15T00:00:00Z'))
    expect(after?.amountCfa).toBe(600)
  })

  it('niveau absent → null (jamais de prix inventé)', () => {
    expect(resolveCurrentPrice(entries, 'SEMI_WHOLESALE')).toBeNull()
    expect(resolvePriceAt(entries, 'SEMI_WHOLESALE', new Date())).toBeNull()
  })

  it('4 niveaux exposés : PURCHASE / RETAIL / SEMI_WHOLESALE / WHOLESALE', () => {
    expect(PRICE_LEVELS).toEqual(['PURCHASE', 'RETAIL', 'SEMI_WHOLESALE', 'WHOLESALE'])
  })

  it('historique conservé : deux lignes ouvertes successives triées', () => {
    const multi = [
      { priceType: 'RETAIL', amountCfa: 400, validFrom: H('2026-08-01T00:00:00Z'), validTo: null },
      { priceType: 'RETAIL', amountCfa: 600, validFrom: H('2026-09-10T00:00:00Z'), validTo: null },
    ]
    expect(resolveCurrentPrice(multi, 'RETAIL')?.amountCfa).toBe(600)
  })
})

describe('computeMargin — honnêteté et perte visible (STK-810)', () => {
  it('marge positive : FCFA + % arrondi au dixième', () => {
    expect(computeMargin(600, 350)).toEqual({ marginCfa: 250, marginPct: 41.7, isLoss: false })
  })

  it('coût inconnu → null (une marge inventée est un mensonge)', () => {
    expect(computeMargin(600, null)).toBeNull()
    expect(computeMargin(600, undefined)).toBeNull()
    expect(computeMargin(600, 0)).toBeNull()
  })

  it('PERTE : marge négative affichée telle quelle, jamais cachée', () => {
    const m = computeMargin(300, 350)
    expect(m).toEqual({ marginCfa: -50, marginPct: -16.7, isLoss: true })
  })

  it('prix nul (don gratuit) : marge = −coût, pct 0 honnête', () => {
    expect(computeMargin(0, 350)).toEqual({ marginCfa: -350, marginPct: 0, isLoss: true })
  })
})

describe('parseIntent — margin_check vocal (STK-810)', () => {
  it('« marge du riz ? » → margin_check', () => {
    const intent = parseIntent('marge du riz')
    expect(intent.type).toBe('margin_check')
    expect(intent.product).toBe('riz')
  })

  it('« combien je gagne sur les tomates ? » → margin_check', () => {
    const intent = parseIntent('combien je gagne sur les tomates')
    expect(intent.type).toBe('margin_check')
    expect(intent.product).toBe('tomates')
  })

  it('« stock de tomates » reste un stock_check (pas une marge)', () => {
    expect(parseIntent('stock de tomates').type).toBe('stock_check')
  })

  it('« marge » sans produit → pas de margin_check (jamais de cible inventée)', () => {
    expect(parseIntent('montre ma marge').type).not.toBe('margin_check')
  })
})

describe('formatMarginReply — les trois vérités (STK-810)', () => {
  it('marge positive : « Sur le riz, vous gagnez 250 francs par kilo (41,7 %). »', () => {
    expect(formatMarginReply({
      product: 'riz',
      margin: { marginCfa: 250, marginPct: 41.7, isLoss: false },
      unit: 'kg',
    })).toBe('Sur le riz, vous gagnez 250 francs par kilo (41,7 %).')
  })

  it('PERTE dite telle quelle : « Attention, sur le riz vous perdez 100 francs par kilo. »', () => {
    expect(formatMarginReply({
      product: 'riz',
      margin: { marginCfa: -100, marginPct: -25, isLoss: true },
      unit: 'kg',
    })).toBe('Attention, sur le riz vous perdez 100 francs par kilo.')
  })

  it('coût inconnu : « Je ne sais pas combien tu as acheté le riz. »', () => {
    const text = formatMarginReply({ product: 'riz', margin: null })
    expect(text).toContain('Je ne sais pas')
    expect(text).toContain('riz')
  })

  it('JAMAIS de formule de fin dans une réponse de marge', () => {
    const text = formatMarginReply({
      product: 'riz',
      margin: { marginCfa: 250, marginPct: 41.7, isLoss: false },
    })
    expect(text).not.toContain('bientôt')
    expect(text).not.toContain('journée')
  })
})
