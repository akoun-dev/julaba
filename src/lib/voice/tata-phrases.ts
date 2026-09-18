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
