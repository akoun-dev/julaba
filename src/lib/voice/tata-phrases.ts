// Formulations vocales de Tata Nanti Lou — confirmations d'action (VOCAL-607).
//
// Principe conversationnel : après une action réussie (vente enregistrée,
// dépense, consultation…), Tata CONFIRME avec les détails utiles puis ATTEND
// l'instruction suivante. Elle ne conclut JAMAIS par une formule de fin
// (« bonne journée ») — celle-ci est réservée à l'intent 'end' et aux
// sorties explicites (TATA_GOODBYE, localIntent.ts).
//
// Module volontairement PUR (aucun store, aucun réseau) : les textes sont
// testés unitairement et identiques quelle que soit la modale appelante.
//
// Les montants sont écrits « 25 000 francs » : la couche voix (toSpeechText,
// tata-tts) verbalise automatiquement en « vingt-cinq mille francs CFA ».

/**
 * Confirmation vocale d'une vente enregistrée.
 *
 * Attendu terrain (VOCAL-607) :
 *  « Vente enregistrée : 2 sacs de riz pour 25 000 francs. »
 *  « C'est enregistré. » n'est plus suivi d'aucune formule de fin.
 *
 * - Produit connu + quantité > 1 → « 2 sacs de riz pour 25 000 francs »
 * - Produit connu, quantité 1   → « tomates pour 2 000 francs »
 * - Produit inconnu (« Article ») → le montant seul fait foi
 * - synced=false → note de synchronisation (audit VOCAL-604, jamais muet)
 * - stockShort   → avertissement de survente écrêtée (audit VOCAL-605)
 */
export interface SaleConfirmationInput {
  name?: string
  quantity: number
  total: number
  synced?: boolean
  stockShort?: boolean
}

export function formatSaleConfirmation(sale: SaleConfirmationInput): string {
  const amount = `${formatMontantParle(sale.total)} francs`
  const knownProduct = sale.name && sale.name !== 'Article'
  const label = knownProduct
    ? `${sale.quantity > 1 ? `${sale.quantity} ` : ''}${sale.name} pour ${amount}`
    : amount
  const notes = [
    sale.synced === false ? 'En attente de synchronisation.' : '',
    sale.stockShort ? 'Attention, stock épuisé.' : '',
  ].filter(Boolean).join(' ')
  return `Vente enregistrée : ${label}.${notes ? ` ${notes}` : ''}`
}

/**
 * Réponse vocale courte à une consultation du total du jour (« combien
 * j'ai vendu ? », « résumé », « bilan »…). Données réelles du store caisse
 * — l'appelant fournit les agrégats, ce module ne devine rien.
 */
export function buildDayTotalText(saleCount: number, total: number): string {
  if (saleCount <= 0) return 'Aucune vente enregistrée aujourd\'hui.'
  return `Ventes du jour : ${formatMontantParle(total)} francs pour ${saleCount} vente${saleCount > 1 ? 's' : ''}.`
}

// ── Refus strict stock insuffisant (STK-805, §3/§18/§19) ─────────────────
//
// « IMPOSSIBLE DE VENDRE SANS STOCK … NON NÉGOCIABLE » : la vente
// demandée au-delà du stock disponible est REFUSÉE — jamais écrêtée.
// Formulations imposées par le cahier des charges :
//   « Tu as seulement 10 kilos de tomates en stock. Je ne peux pas
//    enregistrer une vente de 15 kilos. »
//   « Tu n'as plus de stock pour ce produit… »

export interface StockRefusalInput {
  product?: string
  available: number
  requested: number
  /** Code de l'unité de base (kg, g, litre, sac…) — absent : la phrase
   * ne l'invente pas (jamais de donnée inventée). */
  unit?: string
}

/** Unité parlée : 'kg' → « kilos », singulier quand la quantité vaut 1. */
function unitParle(unit: string | undefined, quantity: number): string | null {
  if (!unit) return null
  const u = unit.trim().toLowerCase()
  const map: Record<string, [string, string]> = {
    kg: ['kilo', 'kilos'],
    g: ['gramme', 'grammes'],
    litre: ['litre', 'litres'],
    l: ['litre', 'litres'],
    ml: ['millilitre', 'millilitres'],
    sac: ['sac', 'sacs'],
    carton: ['carton', 'cartons'],
    caisse: ['caisse', 'caisses'],
    bassine: ['bassine', 'bassines'],
    panier: ['panier', 'paniers'],
    tas: ['tas', 'tas'],
    botte: ['botte', 'bottes'],
    bidon: ['bidon', 'bidons'],
    'fût': ['fût', 'fûts'],
    fut: ['fût', 'fûts'],
    seau: ['seau', 'seaux'],
    'pièce': ['pièce', 'pièces'],
    piece: ['pièce', 'pièces'],
    'unité': ['unité', 'unités'],
    unite: ['unité', 'unités'],
    lot: ['lot', 'lots'],
  }
  const entry = map[u]
  if (!entry) return u // unité inconnue : on la rend telle quelle
  return quantity === 1 ? entry[0] : entry[1]
}

/**
 * Refus vocal d'une vente au-delà du stock disponible (STK-805).
 * Exemples imposés :
 *   formatStockRefusal({product:'tomates', available:10, requested:15, unit:'kg'})
 *   → « Tu as seulement 10 kilos de tomates en stock. Je ne peux pas
 *      enregistrer une vente de 15 kilos. »
 *   formatStockRefusal({available:0, requested:5, unit:'kg'})
 *   → « Tu n'as plus de stock de ce produit. Je ne peux pas enregistrer
 *      une vente de 5 kilos. »
 */
export function formatStockRefusal(refusal: StockRefusalInput): string {
  const product = refusal.product?.trim() || 'ce produit'
  const requestedUnit = unitParle(refusal.unit, refusal.requested)
  const queue = requestedUnit
    ? `Je ne peux pas enregistrer une vente de ${formatMontantParle(refusal.requested)} ${requestedUnit}.`
    : `Je ne peux pas enregistrer une vente de ${formatMontantParle(refusal.requested)}.`
  if (refusal.available <= 0) {
    return `Tu n'as plus de stock de ${product}. ${queue}`
  }
  const availableUnit = unitParle(refusal.unit, refusal.available)
  const head = availableUnit
    ? `Tu as seulement ${formatMontantParle(refusal.available)} ${availableUnit} de ${product} en stock.`
    : `Tu as seulement ${formatMontantParle(refusal.available)} ${product} en stock.`
  return `${head} ${queue}`
}

/** Montant lisible « 25 000 » (séparateur de milliers = espace ordinaire —
 * l'ICU produit une espace insécable étroite U+202F selon la version :
 * normalisée pour des textes déterministes testables, toSpeechText la
 * verbalise de toute façon). */
function formatMontantParle(amount: number): string {
  return new Intl.NumberFormat('fr-FR')
    .format(Math.max(0, Math.floor(amount)))
    .replace(/[\u202F\u00A0\u2009]/g, ' ')
}

// ── Stock parlé (STK-807, §2.7) ──────────────────────────────────────────
//
// Les phrases ci-dessous sont PUR : l'appelant (voice-modal) fournit les
// données réelles (balances serveur / conversion configurée), ce module
// ne devine rien. Unités rendues via unitParle ('kg' → « kilos »).

/** Élision « de + voyelle » : « de tomates » MAIS « d'oignons » (§38). */
function deProduct(product: string): string {
  return /^[aeiouyéèêàâîôûh]/i.test(product.trim()) ? `d'${product.trim()}` : `de ${product.trim()}`
}

/** « 2 sacs », « 1 kilo », « 63 » — quantité + unité parlées. Sans unité,
 * la quantité seule (l'appelant n'invente pas d'unité). */
function quantityParle(quantity: number, unit?: string): string {
  const q = formatMontantParle(quantity)
  const u = unitParle(unit, quantity)
  return u ? `${q} ${u}` : q
}

export interface StockCheckInput {
  product: string
  /** Quantité en unité de base ; null = stock UNKNOWN (jamais compté). */
  quantityBase: number | null
  /** Code de l'unité de base — absent : la phrase ne l'invente pas. */
  unit?: string
  /** Affichage converti PRÊT (ex. « 2 sacs et 13 kilos ») — construit
   * par l'appelant avec la config §8 ; la phrase ne refait pas les maths. */
  displayConverted?: string
}

/**
 * Consultation de stock (§38) :
 *   formatStockCheckReply({product:'oignons', quantityBase:63, unit:'kg',
 *                          displayConverted:'2 sacs et 13 kilos'})
 *   → « Il te reste 63 kilos d'oignons, soit environ 2 sacs et 13 kilos. »
 *   quantityBase 0 → « Tu n'as plus d'oignons. »
 *   quantityBase null (UNKNOWN) → invitation honnête au comptage (§22).
 */
export function formatStockCheckReply(input: StockCheckInput): string {
  const product = input.product.trim() || 'ce produit'
  if (input.quantityBase === null) {
    return `Tu ne m'as jamais dit combien tu as ${deProduct(product)}. Compte ton stock d'abord, je le noterai.`
  }
  if (input.quantityBase <= 0) {
    return `Tu n'as plus ${deProduct(product)}.`
  }
  const head = `Il te reste ${quantityParle(input.quantityBase, input.unit)} ${deProduct(product)}.`
  return input.displayConverted ? `${head.replace('.', '')}, soit environ ${input.displayConverted}.` : head
}

/**
 * Avertissement stock faible NON bloquant (§39) : dit APRÈS une vente
 * réussie qui rapproche du seuil — jamais une punition, un coup d'œil.
 */
export function formatStockWarning(input: { product: string; quantityBase: number; unit?: string }): string {
  return `Attention, il ne te reste que ${quantityParle(input.quantityBase, input.unit)} ${deProduct(input.product || 'ce produit')}.`
}

/**
 * Confirmation de perte enregistrée (§41) : la perte est un mouvement
 * LOSS — honnête et sans jugement.
 */
export function formatLossConfirmation(input: { product?: string; quantityBase?: number; unit?: string }): string {
  const product = input.product?.trim() || ''
  if (input.quantityBase === undefined) {
    return product ? `Perte enregistrée ${deProduct(product)}.` : 'Perte enregistrée.'
  }
  const productPart = product ? ` ${deProduct(product)}` : ''
  return `Perte enregistrée : ${quantityParle(input.quantityBase, input.unit)}${productPart}.`
}

/**
 * Confirmation d'ajustement manuel (delta ± : « +20 kilos », « −3 sachets »).
 */
export function formatAdjustConfirmation(input: { product?: string; deltaBase: number; unit?: string }): string {
  const sign = input.deltaBase > 0 ? '+' : '−'
  const qty = `${sign}${formatMontantParle(Math.abs(input.deltaBase))}`
  const u = unitParle(input.unit, Math.abs(input.deltaBase))
  const product = input.product?.trim() || ''
  return `Ajustement enregistré : ${qty}${u ? ` ${u}` : ''}${product ? ` sur ${product}` : ''}.`
}

/**
 * Réponse de comptage réel (§22) : « j'ai compté, il reste 30 » →
 * « Stock compté : 30 kilos de riz (avant : 25). » — le delta est calculé
 * par la RPC, l'appelant fournit avant/après réels.
 */
export function formatCountReply(input: { product: string; before: number; after: number; unit?: string }): string {
  const product = input.product.trim() || 'ce produit'
  if (input.before === input.after) {
    return `Stock compté : ${quantityParle(input.after, input.unit)} ${deProduct(product)} — rien à corriger.`
  }
  return `Stock compté : ${quantityParle(input.after, input.unit)} ${deProduct(product)} (avant : ${quantityParle(input.before, input.unit)}).`
}

/**
 * Confirmation de réception d'achat (§10) : « Achat enregistré : 2 sacs
 * d'oignons pour 24 000 francs. » Montant absent (achat sans facture
 * dictée) → la phrase ne l'invente pas.
 */
export function formatPurchaseConfirmation(input: {
  product: string
  quantityBase?: number
  unit?: string
  total?: number
  synced?: boolean
}): string {
  const product = input.product.trim() || 'marchandise'
  const qty = input.quantityBase !== undefined && input.quantityBase > 0
    ? `${quantityParle(input.quantityBase, input.unit)} `
    : ''
  const total = input.total !== undefined && input.total > 0
    ? ` pour ${formatMontantParle(input.total)} francs`
    : ''
  const note = input.synced === false ? ' En attente de synchronisation.' : ''
  return `Achat enregistré : ${qty}${deProduct(product)}${total}.${note}`
}

/**
 * Question de relance quand le montant est dicté sans quantité (§12) :
 * « Tu as vendu combien de kilos de tomates ? » — l'unité parlée est celle
 * du produit (config §8) ; sans config, la question reste générique.
 */
export function formatAskQuantity(input: { product: string; unit?: string }): string {
  const product = input.product.trim() || 'ce produit'
  const u = unitParle(input.unit, 2)
  return u
    ? `Tu en as vendu combien, en ${u}${product ? `, ${deProduct(product)}` : ''} ?`
    : `Tu as vendu combien ${deProduct(product)} ?`
}

/**
 * Confirmation de production propre enregistrée (STK-809, §2.7) :
 * œufs, attiéké, transformation — mouvement PRODUCTION, pas un achat.
 */
export function formatProductionConfirmation(input: { product?: string; quantityBase: number; unit?: string }): string {
  const product = input.product?.trim() || ''
  const productPart = product ? ` ${deProduct(product)}` : ''
  return `Production enregistrée : ${quantityParle(input.quantityBase, input.unit)}${productPart}.`
}
