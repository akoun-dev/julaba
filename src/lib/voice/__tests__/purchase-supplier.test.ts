import { describe, it, expect } from 'vitest'
import { parseIntent } from '../localIntent'
import { buildStockPurchasePayload } from '../voice-stock'
import { formatPurchaseConfirmation } from '../tata-phrases'

// MODE-907 (§15) — capture du fournisseur dicté « chez <nom> » dans le flux
// d'achat vocal. Contrat : la queue « chez … » (1 à 3 mots, fin de phrase,
// casse libre) part dans `supplier`, le reste de la phrase est parsé EXACTEMENT
// comme avant (non-régression : les phrases sans « chez » ne changent pas).

describe('parseIntent — achat avec fournisseur « chez X » (MODE-907)', () => {
  it('phrase du cahier : « j\'ai acheté 20 kilos de tomates à 15 000 francs chez Koné »', () => {
    const intent = parseIntent('j\'ai acheté 20 kilos de tomates à 15 000 francs chez Koné')
    expect(intent.type).toBe('purchase')
    expect(intent.product).toBe('tomates')
    expect(intent.quantity).toBe(20)
    expect(intent.unit).toBe('kg')
    expect(intent.amount).toBe(15000)
    expect(intent.supplier).toBe('Koné')
  })

  it('nom composé de 2 mots : « … chez Adjoua Koné »', () => {
    const intent = parseIntent('j\'ai acheté 2 sacs d\'oignons à 12000 le sac chez Adjoua Koné')
    expect(intent.type).toBe('purchase')
    expect(intent.product).toBe('oignons')
    expect(intent.unitPrice).toBe(12000)
    expect(intent.amount).toBe(24000)
    expect(intent.supplier).toBe('Adjoua Koné')
  })

  it('nom de 3 mots, casse libre et ponctuation finale : « … chez Ahou Fatou Bamba. »', () => {
    const intent = parseIntent('acheté du riz 500 chez Ahou Fatou Bamba.')
    expect(intent.type).toBe('purchase')
    expect(intent.supplier).toBe('Ahou Fatou Bamba')
    expect(intent.amount).toBe(500)
  })

  it('casse du nom conservée : « … chez KONE » → "KONE"', () => {
    const intent = parseIntent('j\'ai acheté du manioc chez KONE')
    expect(intent.type).toBe('purchase')
    expect(intent.supplier).toBe('KONE')
  })

  it('plus de 3 mots après « chez » : pas de capture (honnête)', () => {
    const intent = parseIntent('j\'ai acheté du riz chez le gros vendeur du marché')
    expect(intent.type).toBe('purchase')
    expect(intent.supplier).toBeUndefined()
  })

  it('« chez » en milieu de phrase (pas en fin) : pas de capture', () => {
    const intent = parseIntent('j\'ai acheté du riz chez Koné et du maïs')
    expect(intent.type).toBe('purchase')
    expect(intent.supplier).toBeUndefined()
  })

  it('sans « chez » : phrase strictement inchangée (montant 15000)', () => {
    const intent = parseIntent('j\'ai acheté 20 kilos de tomates à 15000 francs')
    expect(intent.type).toBe('purchase')
    expect(intent.product).toBe('tomates')
    expect(intent.quantity).toBe(20)
    expect(intent.unit).toBe('kg')
    expect(intent.amount).toBe(15000)
    expect(intent.unitPrice).toBe(15000)
    expect(intent.supplier).toBeUndefined()
  })

  it('sans « chez » : prix unitaire « le sac » inchangé (24 000)', () => {
    const intent = parseIntent('j\'ai acheté 2 sacs d\'oignons à 12000 le sac')
    expect(intent.type).toBe('purchase')
    expect(intent.unitPrice).toBe(12000)
    expect(intent.amount).toBe(24000)
    expect(intent.supplier).toBeUndefined()
  })

  it('la vente et la production ne capturent jamais de fournisseur', () => {
    const sale = parseIntent('j\'ai vendu 5 kilos de tomates à 2000 francs chez Adjoua')
    expect(sale.type).toBe('sale')
    const prod = parseIntent('j\'ai produit 50 oeufs chez moi')
    expect(prod.type).toBe('stock_production')
  })
})

describe('buildStockPurchasePayload — fournisseur dans le payload (MODE-907)', () => {
  const base = {
    merchantId: 'm1',
    productId: 'p1',
    productName: 'tomates',
    quantityBase: 20,
    intent: { quantity: 20, unit: 'kg', amount: 15000, supplier: 'Koné', rawTranscript: 'j\'ai acheté 20 kilos de tomates à 15 000 francs chez Koné' },
  }

  it('avec fournisseur : supplierClientId + supplierName dans le payload', () => {
    const { payload } = buildStockPurchasePayload({
      ...base,
      supplierClientId: 'partner-1737-abc123',
    })
    expect(payload.supplierClientId).toBe('partner-1737-abc123')
    expect(payload.supplierName).toBe('Koné')
    expect(payload.amountPaid).toBe(15000)
  })

  it('intent sans fournisseur, client_id fourni : supplierName absent', () => {
    const { payload } = buildStockPurchasePayload({
      ...base,
      intent: { quantity: 20, unit: 'kg', amount: 15000, rawTranscript: 'j\'ai acheté 20 kilos de tomates' },
      supplierClientId: 'partner-1737-abc123',
    })
    expect(payload.supplierClientId).toBe('partner-1737-abc123')
    expect('supplierName' in payload).toBe(false)
  })

  it('sans fournisseur : les clés restent absentes (payload historique)', () => {
    const { payload } = buildStockPurchasePayload({
      ...base,
      intent: { quantity: 20, unit: 'kg', amount: 15000, rawTranscript: 'j\'ai acheté 20 kilos de tomates' },
    })
    expect(payload.supplierClientId).toBeUndefined()
    expect(payload.supplierName).toBeUndefined()
    expect('supplierClientId' in payload).toBe(false)
    expect('supplierName' in payload).toBe(false)
  })

  it('le chemin serveur et la file offline restent inchangés', () => {
    const { apiPath, offlineEntity } = buildStockPurchasePayload({
      ...base,
      supplierClientId: 'partner-1737-abc123',
    })
    expect(apiPath).toBe('/api/marchand/purchases')
    expect(offlineEntity).toBe('stock-purchase')
  })
})

describe('formatPurchaseConfirmation — clause fournisseur (MODE-907)', () => {
  it('fournisseur capté : « Achat enregistré : 20 kilos de tomates pour 15 000 francs, chez Koné. »', () => {
    const text = formatPurchaseConfirmation({
      product: 'tomates',
      quantityBase: 20,
      unit: 'kg',
      total: 15000,
      supplier: 'Koné',
    })
    expect(text).toBe('Achat enregistré : 20 kilos de tomates pour 15 000 francs, chez Koné.')
  })

  it('sans fournisseur : phrase existante strictement inchangée', () => {
    expect(formatPurchaseConfirmation({ product: 'oignons', quantityBase: 50, unit: 'kg', total: 24000 }))
      .toBe('Achat enregistré : 50 kilos d\'oignons pour 24 000 francs.')
  })
})
