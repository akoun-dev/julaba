import { describe, it, expect } from 'vitest'
import { parseIntent, extractQuantityWithUnit } from '../localIntent'
import { resolveSpokenQuantity, stockOperationClientId } from '../voice-stock'
import {
  formatStockCheckReply,
  formatStockWarning,
  formatLossConfirmation,
  formatAdjustConfirmation,
  formatCountReply,
  formatPurchaseConfirmation,
  formatAskQuantity,
} from '../tata-phrases'

describe('extractQuantityWithUnit (STK-807)', () => {
  it('« 2 sacs de riz » → {2, sac}', () => {
    expect(extractQuantityWithUnit('j\'ai acheté 2 sacs de riz')).toEqual({ quantity: 2, unit: 'sac' })
  })

  it('« 5 kilos de tomates » → {5, kg}', () => {
    expect(extractQuantityWithUnit('j\'ai perdu 5 kilos de tomates')).toEqual({ quantity: 5, unit: 'kg' })
  })

  it('décimales orales : « 1,5 kilo » → {1.5, kg}', () => {
    expect(extractQuantityWithUnit('1,5 kilo de piment')).toEqual({ quantity: 1.5, unit: 'kg' })
  })

  it('mots-nombres : « deux régimes de plantain » → {2, regime}', () => {
    expect(extractQuantityWithUnit('deux régimes de plantain')).toEqual({ quantity: 2, unit: 'regime' })
  })

  it('quantité nue sans unité : « 5 tomates » → {5, null}', () => {
    expect(extractQuantityWithUnit('vendu 5 tomates')).toEqual({ quantity: 5, unit: null })
  })

  it('le plus long alias gagne : « 15 sachets » → sachet (pas sac)', () => {
    expect(extractQuantityWithUnit('15 sachets de sel')).toEqual({ quantity: 15, unit: 'sachet' })
  })

  it('garde anti-préfixe : « 5 garçons » ne capte pas l\'unité g', () => {
    expect(extractQuantityWithUnit('5 garçons')).toEqual({ quantity: 5, unit: null })
  })

  it('aucune quantité → null', () => {
    expect(extractQuantityWithUnit('bonjour Tata')).toBeNull()
  })
})

describe('parseIntent — stock_loss (STK-807, §41)', () => {
  it('« j\'ai perdu 5 kilos de tomates » → perte, PAS une vente', () => {
    const intent = parseIntent('j\'ai perdu 5 kilos de tomates')
    expect(intent.type).toBe('stock_loss')
    expect(intent.product).toBe('tomates')
    expect(intent.quantity).toBe(5)
    expect(intent.unit).toBe('kg')
  })

  it('« tomates gâtées » sans quantité → demande la quantité', () => {
    const intent = parseIntent('tomates gâtées')
    expect(intent.type).toBe('stock_loss')
    expect(intent.product).toBe('tomates')
    expect(intent.responseText).toContain('combien')
  })

  it('« 3 sacs abîmés d\'oignons » → perte', () => {
    const intent = parseIntent('3 sacs abîmés d\'oignons')
    expect(intent.type).toBe('stock_loss')
    expect(intent.product).toBe('oignons')
    expect(intent.unit).toBe('sac')
  })
})

describe('parseIntent — stock_adjust (STK-807)', () => {
  it('« ajoute 20 kilos de riz » → ajout', () => {
    const intent = parseIntent('ajoute 20 kilos de riz')
    expect(intent.type).toBe('stock_adjust')
    expect(intent.product).toBe('riz')
    expect(intent.quantity).toBe(20)
    expect(intent.unit).toBe('kg')
  })

  it('« enlève 3 sachets de sel » → retrait', () => {
    const intent = parseIntent('enlève 3 sachets de sel')
    expect(intent.type).toBe('stock_adjust')
    expect(intent.unit).toBe('sachet')
    expect(intent.responseText).toContain('Retrait')
  })

  it('« ajouterait » (conjonctif) n\'est PAS un ajustement', () => {
    const intent = parseIntent('je voudrais que tu ajouterait rien')
    expect(intent.type).not.toBe('stock_adjust')
  })
})

describe('parseIntent — purchase (STK-807, §10)', () => {
  it('« j\'ai acheté 2 sacs d\'oignons à 12 000 le sac » → achat complet', () => {
    const intent = parseIntent('j\'ai acheté 2 sacs d\'oignons à 12000 le sac')
    expect(intent.type).toBe('purchase')
    expect(intent.product).toBe('oignons')
    expect(intent.quantity).toBe(2)
    expect(intent.unit).toBe('sac')
    expect(intent.unitPrice).toBe(12000)
    expect(intent.amount).toBe(24000)
  })

  it('« acheté du riz 500 » → achat (contrat réécrit)', () => {
    const intent = parseIntent('acheté du riz 500')
    expect(intent.type).toBe('purchase')
    expect(intent.product).toBe('riz')
  })
})

describe('parseIntent — stock_check (STK-807, §38)', () => {
  it('« il reste combien de tomates ? » → consultation de stock', () => {
    const intent = parseIntent('il reste combien de tomates ?')
    expect(intent.type).toBe('stock_check')
    expect(intent.product).toBe('tomates')
  })

  it('« combien de tomates il me reste ? » → consultation', () => {
    const intent = parseIntent('combien de tomates il me reste')
    expect(intent.type).toBe('stock_check')
    expect(intent.product).toBe('tomates')
  })

  it('« stock de riz » → consultation', () => {
    const intent = parseIntent('stock de riz')
    expect(intent.type).toBe('stock_check')
  })

  it('« ouvre mon stock » reste une NAVIGATION (pas de produit)', () => {
    const intent = parseIntent('ouvre mon stock')
    expect(intent.type).toBe('navigation')
  })

  it('« il me reste plus rien de tomates » → consultation, PAS un au revoir', () => {
    const intent = parseIntent('il me reste plus rien de tomates')
    expect(intent.type).toBe('stock_check')
    expect(intent.responseText).not.toContain('bientôt')
  })

  it('« combien pour tomates ? » demande le PRIX (pas le stock)', () => {
    const intent = parseIntent('combien pour tomates')
    expect(intent.type).not.toBe('stock_check')
  })
})

describe('parseIntent — arbitrages historiques préservés', () => {
  it('la vente « j\'ai vendu 5 kilos de tomates à 2000 francs » reste une vente', () => {
    const intent = parseIntent('j\'ai vendu 5 kilos de tomates à 2000 francs')
    expect(intent.type).toBe('sale')
    expect(intent.amount).toBe(2000)
  })

  it('« c\'est tout » reste une fin de conversation', () => {
    expect(parseIntent('c\'est tout').type).toBe('end')
  })

  it('« j\'ai fini les tomates » (stock vide dicté)… reste fin de conversation (ambiguïté assumée)', () => {
    // « j'ai fini » est un marqueur de fin AVANT tout — la marchande
    // clôture l'échange ; le stock à 0 se dit « plus de tomates ».
    expect(parseIntent('j\'ai fini').type).toBe('end')
  })
})

describe('resolveSpokenQuantity (STK-807)', () => {
  const config = [
    { unitCode: 'kg', conversionToBase: 1, isBase: true, isDefaultSale: false },
    { unitCode: 'sac', conversionToBase: 25, isBase: false, isDefaultSale: true },
  ]

  it('unité de base : « 5 kilos » → 5 kg direct', () => {
    expect(resolveSpokenQuantity(5, 'kg', config)).toEqual({ ok: true, quantityBase: 5, unitCode: 'kg' })
  })

  it('unité configurée : « 2 sacs » → 50 en base', () => {
    expect(resolveSpokenQuantity(2, 'sac', config)).toEqual({ ok: true, quantityBase: 50, unitCode: 'sac' })
  })

  it('sans unité : quantité nue = base', () => {
    expect(resolveSpokenQuantity(5, null, config)).toEqual({ ok: true, quantityBase: 5, unitCode: 'kg' })
  })

  it('HONNÊTE : unité non configurée pour ce produit → INVALID_UNIT', () => {
    const res = resolveSpokenQuantity(2, 'bassine', config)
    expect(res).toEqual({ ok: false, reason: 'INVALID_UNIT', unitCode: 'bassine' })
  })

  it('HONNÊTE sans config du tout : unité parlée → INVALID_UNIT', () => {
    expect(resolveSpokenQuantity(2, 'sac', null)).toEqual({ ok: false, reason: 'INVALID_UNIT', unitCode: 'sac' })
  })

  it('quantité invalide → INVALID_QUANTITY', () => {
    expect(resolveSpokenQuantity(0, 'kg', config)).toEqual({ ok: false, reason: 'INVALID_QUANTITY', quantity: 0 })
    expect(resolveSpokenQuantity(undefined, 'kg', config)).toEqual({ ok: false, reason: 'INVALID_QUANTITY', quantity: 0 })
  })
})

describe('stockOperationClientId (STK-807/808)', () => {
  it('format lisible « <kind>-<ts>-<rand> » et unique', () => {
    const a = stockOperationClientId('perte')
    const b = stockOperationClientId('perte')
    expect(a).toMatch(/^perte-\d+-[a-z0-9]+$/)
    expect(a).not.toBe(b)
  })
})

describe('phrases Tata stock (STK-807)', () => {
  it('check §38 avec conversion : « Il te reste 63 kilos d\'oignons, soit environ 2 sacs et 13 kilos. »', () => {
    const text = formatStockCheckReply({
      product: 'oignons', quantityBase: 63, unit: 'kg',
      displayConverted: '2 sacs et 13 kilos',
    })
    expect(text).toBe('Il te reste 63 kilos d\'oignons, soit environ 2 sacs et 13 kilos.')
  })

  it('check élision : « d\'oignons » mais « de tomates »', () => {
    expect(formatStockCheckReply({ product: 'tomates', quantityBase: 10, unit: 'kg' }))
      .toBe('Il te reste 10 kilos de tomates.')
    expect(formatStockCheckReply({ product: 'oignons', quantityBase: 63, unit: 'kg' }))
      .toBe('Il te reste 63 kilos d\'oignons.')
  })

  it('check stock vide et UNKNOWN honnête', () => {
    expect(formatStockCheckReply({ product: 'oignons', quantityBase: 0, unit: 'kg' }))
      .toBe('Tu n\'as plus d\'oignons.')
    expect(formatStockCheckReply({ product: 'riz', quantityBase: null, unit: 'kg' }))
      .toContain('Compte ton stock')
  })

  it('warning §39 non bloquant', () => {
    expect(formatStockWarning({ product: 'tomates', quantityBase: 4, unit: 'kg' }))
      .toBe('Attention, il ne te reste que 4 kilos de tomates.')
  })

  it('perte §41 enregistrée', () => {
    expect(formatLossConfirmation({ product: 'tomates', quantityBase: 5, unit: 'kg' }))
      .toBe('Perte enregistrée : 5 kilos de tomates.')
  })

  it('ajustement ±', () => {
    expect(formatAdjustConfirmation({ product: 'riz', deltaBase: 20, unit: 'kg' }))
      .toBe('Ajustement enregistré : +20 kilos sur riz.')
    expect(formatAdjustConfirmation({ product: 'riz', deltaBase: -3, unit: 'sac' }))
      .toBe('Ajustement enregistré : −3 sacs sur riz.')
  })

  it('comptage §22 avant/après', () => {
    expect(formatCountReply({ product: 'riz', before: 25, after: 30, unit: 'kg' }))
      .toBe('Stock compté : 30 kilos de riz (avant : 25 kilos).')
    expect(formatCountReply({ product: 'riz', before: 30, after: 30, unit: 'kg' }))
      .toContain('rien à corriger')
  })

  it('achat §10 enregistré', () => {
    expect(formatPurchaseConfirmation({ product: 'oignons', quantityBase: 50, unit: 'kg', total: 24000 }))
      .toBe('Achat enregistré : 50 kilos d\'oignons pour 24 000 francs.')
    expect(formatPurchaseConfirmation({ product: 'riz', synced: false }))
      .toContain('En attente de synchronisation.')
  })

  it('question §12 montant-sans-quantité', () => {
    expect(formatAskQuantity({ product: 'tomates', unit: 'kg' }))
      .toBe('Tu en as vendu combien, en kilos, de tomates ?')
    expect(formatAskQuantity({ product: 'tomates' }))
      .toBe('Tu as vendu combien de tomates ?')
  })

  it('JAMAIS de formule de fin dans les confirmations stock', () => {
    const texts = [
      formatLossConfirmation({ product: 'tomates', quantityBase: 5, unit: 'kg' }),
      formatAdjustConfirmation({ product: 'riz', deltaBase: 20, unit: 'kg' }),
      formatCountReply({ product: 'riz', before: 25, after: 30, unit: 'kg' }),
      formatPurchaseConfirmation({ product: 'oignons', quantityBase: 50, unit: 'kg', total: 24000 }),
    ]
    for (const t of texts) {
      expect(t).not.toContain('bientôt')
      expect(t).not.toContain('journée')
    }
  })
})
