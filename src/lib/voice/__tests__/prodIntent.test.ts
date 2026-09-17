import { describe, expect, it } from 'vitest'
import { parseProdIntent } from '../prodIntent'

describe('producteur voice intent — navigation', () => {
  it('keeps harvest screen requests as navigation', () => {
    expect(parseProdIntent('Mes récoltes')).toMatchObject({ type: 'navigation', targetRoute: 'prod-recoltes' })
    expect(parseProdIntent('Ouvre mes récoltes')).toMatchObject({ type: 'navigation', targetRoute: 'prod-recoltes' })
    expect(parseProdIntent('Montre-moi mon stock')).toMatchObject({ type: 'navigation', targetRoute: 'prod-stock' })
  })

  it('maps every producteur route', () => {
    expect(parseProdIntent('accueil')).toMatchObject({ targetRoute: 'prod-home' })
    expect(parseProdIntent('commandes')).toMatchObject({ targetRoute: 'prod-commandes' })
    expect(parseProdIntent('stock')).toMatchObject({ targetRoute: 'prod-stock' })
    expect(parseProdIntent('cycles')).toMatchObject({ targetRoute: 'prod-cycles' })
    expect(parseProdIntent('profil')).toMatchObject({ targetRoute: 'prod-profil' })
    expect(parseProdIntent('récoltes')).toMatchObject({ targetRoute: 'prod-recoltes' })
  })

  it('understands nouchi and accent-free variants', () => {
    expect(parseProdIntent('akèy')).toMatchObject({ targetRoute: 'prod-home' })
    expect(parseProdIntent('akey')).toMatchObject({ targetRoute: 'prod-home' })
    expect(parseProdIntent('rekòlt')).toMatchObject({ targetRoute: 'prod-recoltes' })
    expect(parseProdIntent('recoltes')).toMatchObject({ targetRoute: 'prod-recoltes' })
    expect(parseProdIntent('komand')).toMatchObject({ targetRoute: 'prod-commandes' })
    expect(parseProdIntent('korè')).toMatchObject({ targetRoute: 'prod-stock' })
    expect(parseProdIntent('kanp')).toMatchObject({ targetRoute: 'prod-cycles' })
    expect(parseProdIntent('fèm')).toMatchObject({ targetRoute: 'prod-profil' })
  })

  it('prefers the longest keyword ("mes récoltes" over "récoltes")', () => {
    const result = parseProdIntent('mes récoltes')
    expect(result).toMatchObject({ type: 'navigation', targetRoute: 'prod-recoltes' })
    expect(result.responseText).toBe("J'ouvre vos récoltes.")
  })

  it('sends "retour" and "revenir" back to prod-home', () => {
    expect(parseProdIntent('retour')).toMatchObject({ targetRoute: 'prod-home' })
    expect(parseProdIntent('revenir')).toMatchObject({ targetRoute: 'prod-home' })
  })

  it('answers with the matching spoken phrase per route', () => {
    expect(parseProdIntent('mon stock').responseText).toBe("J'ouvre votre stock.")
    expect(parseProdIntent('mes commandes').responseText).toBe("J'ouvre vos commandes.")
    expect(parseProdIntent('mes cycles').responseText).toBe("J'ouvre vos cycles de production.")
  })
})

describe('producteur voice intent — déclaration de récolte', () => {
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

  it('accepts all four cultures, including plural and accent-free forms', () => {
    expect(parseProdIntent("j'ai récolté 10 kilos d'ignames")).toMatchObject({
      type: 'declare-recolte',
      recolte: { produit: 'Igname', quantiteKg: 10 },
    })
    expect(parseProdIntent("j'ai recolte 5 kilos d'oignon")).toMatchObject({
      type: 'declare-recolte',
      recolte: { produit: 'Oignon', quantiteKg: 5 },
    })
    expect(parseProdIntent("j'ai récolté 3 kilos de pèment")).toMatchObject({
      type: 'declare-recolte',
      recolte: { produit: 'Piment', quantiteKg: 3 },
    })
  })

  it('defaults quality to standard and reads it back in the response', () => {
    const result = parseProdIntent("j'ai récolté 100 kilos de manioc")
    expect(result.recolte?.qualite).toBe('standard')
    expect(result.responseText).toContain('qualité standard')
    expect(result.responseText).toContain('C\'est bien ça ?')
  })

  it('extracts spoken qualities (premium, secondaire, variantes)', () => {
    expect(parseProdIntent("j'ai récolté 100 kilos de manioc qualité premium")).toMatchObject({
      recolte: { qualite: 'premium' },
    })
    expect(parseProdIntent("j'ai récolté 100 kilos de manioc première qualité")).toMatchObject({
      recolte: { qualite: 'premium' },
    })
    expect(parseProdIntent("j'ai récolté 100 kilos de manioc excellent")).toMatchObject({
      recolte: { qualite: 'premium' },
    })
    expect(parseProdIntent("j'ai récolté 100 kilos de manioc deuxième qualité")).toMatchObject({
      recolte: { qualite: 'secondaire' },
    })
    expect(parseProdIntent("j'ai récolté 100 kilos de manioc qualité moyenne")).toMatchObject({
      recolte: { qualite: 'secondaire' },
    })
  })

  it('accepts French number words for quantities', () => {
    expect(parseProdIntent("j'ai récolté deux kilos de manioc")).toMatchObject({
      recolte: { quantiteKg: 2 },
    })
    expect(parseProdIntent("j'ai récolté vingt kilos de manioc")).toMatchObject({
      recolte: { quantiteKg: 20 },
    })
  })

  it('routes a declaration to the récoltes screen and asks for confirmation', () => {
    const result = parseProdIntent("j'ai récolté 40 kilos de manioc")
    expect(result.type).toBe('declare-recolte')
    expect(result.targetRoute).toBe('prod-recoltes')
  })
})

describe('producteur voice intent — conflits navigation / déclaration', () => {
  it('never reads a bare "récoltes" as a declaration', () => {
    expect(parseProdIntent('récoltes')).toMatchObject({ type: 'navigation', targetRoute: 'prod-recoltes' })
  })

  it('prefers declaration when the verb "récolté" is present, even with route words', () => {
    const result = parseProdIntent("j'ai récolté 100 kilos de manioc, ouvre mes récoltes")
    expect(result.type).toBe('declare-recolte')
  })

  it('treats "récolte de manioc" (with the preposition) as a declaration trigger', () => {
    expect(parseProdIntent('récolte de manioc 20 kilos')).toMatchObject({
      type: 'declare-recolte',
      recolte: { produit: 'Manioc', quantiteKg: 20 },
    })
  })
})

describe('producteur voice intent — relances ciblées', () => {
  it('asks for the missing product when the crop is unknown', () => {
    const result = parseProdIntent("j'ai récolté 100 kilos de chou")
    expect(result.type).toBe('unknown')
    expect(result.targetRoute).toBeNull()
    expect(result.responseText).toContain('Quel produit avez-vous récolté')
    expect(result.responseText).toContain('manioc')
  })

  it('asks for the missing quantity when only the crop was heard', () => {
    const result = parseProdIntent("j'ai récolté du manioc")
    expect(result.type).toBe('unknown')
    expect(result.targetRoute).toBeNull()
    expect(result.responseText).toContain('Quelle quantité')
  })

  it('offers reformulation examples when nothing is understood', () => {
    const result = parseProdIntent('météo demain')
    expect(result.type).toBe('unknown')
    expect(result.targetRoute).toBeNull()
    expect(result.responseText).toContain("j'ai récolté")
  })
})
