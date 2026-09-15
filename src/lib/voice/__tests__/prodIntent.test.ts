import { describe, expect, it } from 'vitest'
import { parseProdIntent } from '../prodIntent'

describe('producteur voice intent', () => {
  it('keeps harvest screen requests as navigation', () => {
    expect(parseProdIntent('Mes récoltes')).toMatchObject({ type: 'navigation', targetRoute: 'prod-recoltes' })
    expect(parseProdIntent('Ouvre mes récoltes')).toMatchObject({ type: 'navigation', targetRoute: 'prod-recoltes' })
    expect(parseProdIntent('Montre-moi mon stock')).toMatchObject({ type: 'navigation', targetRoute: 'prod-stock' })
  })

  it('keeps harvest declarations in the confirmation flow', () => {
    expect(parseProdIntent("J'ai récolté 100 kilos de manioc")).toMatchObject({
      type: 'declare-recolte',
      targetRoute: 'prod-recoltes',
      recolte: { produit: 'Manioc', quantiteKg: 100 },
    })
    expect(parseProdIntent('J’ai récolté 50 kg de piment')).toMatchObject({
      type: 'declare-recolte',
      recolte: { produit: 'Piment', quantiteKg: 50 },
    })
  })
})
