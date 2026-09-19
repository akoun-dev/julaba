/**
 * Unités commerciales du marché ivoirien (STK-806, §8-9).
 *
 * Catalogue PUR : aucune dépendance réseau, aucun store. Il alimente
 *  • la voix (STK-807 : reconnaissance « 2 sacs », « 1,5 kilo »…) via
 *    parseQuantityWithUnit / unitAliases,
 *  • l'affichage converti « Oignons — 2 sacs + 13 kilos » (§8) via
 *    formatStockDisplay,
 *  • la validation de l'API /api/marchand/stock/units.
 *
 * Règle d'or (§8) : « Ne jamais supposer qu'un sac = X kg universellement » —
 * la conversion sac→kg est configurable par produit ET par marchand
 * (table merchant_product_units). Ce module ne contient QUE le vocabulaire
 * et les maths ; aucune conversion implicite n'est jamais inventée ici.
 */

/** Famille d'unité — pilote les pluriels et la présentation. */
export type StockUnitKind = 'mass' | 'volume' | 'container' | 'count'

export interface StockUnitDef {
  /** Code canonique stocké en base (merchant_product_units.unit_code). */
  code: string
  /** Libellé français d'affichage (singulier). */
  labelFr: string
  /** Formes orales acceptées à la voix (minuscules, sans accents obligatoires). */
  aliases: string[]
  kind: StockUnitKind
}

/**
 * Catalogue CI de référence (21 unités — 17 au STK-806 + régime/sachet/
 * plateau/boîte ajoutés au STK-807 pour la voix plantain/œufs). L'ordre n'a
 * pas de sémantique d'arbitrage ; la résolution vocale (resolveSpokenUnit)
 * teste les alias du plus long au plus court pour que « kilos »
 * gagne sur « kilo » et « sachet » sur « sac » (préfixes).
 */
export const STOCK_UNITS: readonly StockUnitDef[] = [
  { code: 'kg', labelFr: 'kilo', aliases: ['kilo', 'kilos', 'kilogramme', 'kilogrammes', 'kg'], kind: 'mass' },
  { code: 'g', labelFr: 'gramme', aliases: ['gramme', 'grammes', 'g'], kind: 'mass' },
  { code: 'l', labelFr: 'litre', aliases: ['litre', 'litres', 'l'], kind: 'volume' },
  { code: 'ml', labelFr: 'millilitre', aliases: ['millilitre', 'millilitres', 'ml'], kind: 'volume' },
  { code: 'sac', labelFr: 'sac', aliases: ['sac', 'sacs'], kind: 'container' },
  { code: 'carton', labelFr: 'carton', aliases: ['carton', 'cartons'], kind: 'container' },
  { code: 'caisse', labelFr: 'caisse', aliases: ['caisse', 'caisses'], kind: 'container' },
  { code: 'bassine', labelFr: 'bassine', aliases: ['bassine', 'bassines'], kind: 'container' },
  { code: 'panier', labelFr: 'panier', aliases: ['panier', 'paniers'], kind: 'container' },
  { code: 'tas', labelFr: 'tas', aliases: ['tas'], kind: 'container' },
  { code: 'botte', labelFr: 'botte', aliases: ['botte', 'bottes'], kind: 'container' },
  { code: 'bidon', labelFr: 'bidon', aliases: ['bidon', 'bidons'], kind: 'container' },
  { code: 'fut', labelFr: 'fût', aliases: ['fut', 'futs', 'fût', 'fûts'], kind: 'container' },
  { code: 'seau', labelFr: 'seau', aliases: ['seau', 'seaux'], kind: 'container' },
  { code: 'piece', labelFr: 'pièce', aliases: ['piece', 'pieces', 'pièce', 'pièces'], kind: 'count' },
  { code: 'unite', labelFr: 'unité', aliases: ['unite', 'unites', 'unité', 'unités'], kind: 'count' },
  { code: 'lot', labelFr: 'lot', aliases: ['lot', 'lots'], kind: 'count' },
  { code: 'regime', labelFr: 'régime', aliases: ['régime', 'régimes', 'regime', 'regimes'], kind: 'count' },
  { code: 'sachet', labelFr: 'sachet', aliases: ['sachet', 'sachets'], kind: 'container' },
  { code: 'plateau', labelFr: 'plateau', aliases: ['plateau', 'plateaux'], kind: 'container' },
  { code: 'boite', labelFr: 'boîte', aliases: ['boîte', 'boîtes', 'boite', 'boites'], kind: 'container' },
] as const

/** Index code → définition. */
const UNITS_BY_CODE: ReadonlyMap<string, StockUnitDef> = new Map(
  STOCK_UNITS.map((u) => [u.code, u]),
)

/**
 * Alias oral → code canonique. Construit une seule fois : pour chaque
 * définition, chaque alias pointe vers le code. La résolution se fait
 * du plus long alias au plus court (voir resolveSpokenUnit).
 */
const ALIAS_TO_CODE: ReadonlyArray<readonly [string, string]> = STOCK_UNITS.flatMap((u) =>
  u.aliases.map((a) => [a, u.code] as const),
).sort((a, b) => b[0].length - a[0].length)

/** Code canonique d'une unité, ou null si inconnu — jamais d'invention. */
export function resolveUnitCode(spoken: string | null | undefined): string | null {
  if (!spoken) return null
  const key = spoken.trim().toLowerCase()
  if (!key) return null
  const hit = ALIAS_TO_CODE.find(([alias]) => alias === key)
  return hit ? hit[1] : null
}

export interface StockUnitConfig {
  unitCode: string
  /** Combien d'unités de base vaut 1 unité commerciale (> 0, contrainte DB). */
  conversionToBase: number
  isBase: boolean
  isDefaultSale: boolean
}

/** Configuration d'unités d'un produit, telle que renvoyée par l'API. */
export type ProductUnitConfig = StockUnitConfig[]

/**
 * L'unité de base du produit (is_base, conversion 1). Si le marchand n'a
 * rien configuré, le produit n'a pas de config : le stock reste dans son
 * unité « brute » (celle de legacy_products.stock_qty) — on renvoie null
 * et l'affichage reste honnête (pas de fausse conversion).
 */
export function getBaseUnit(config: ProductUnitConfig | null | undefined): StockUnitConfig | null {
  if (!config || config.length === 0) return null
  return config.find((u) => u.isBase) ?? null
}

/** Unité de vente proposée au comptoir (is_default_sale), sinon la base. */
export function getDefaultSaleUnit(config: ProductUnitConfig | null | undefined): StockUnitConfig | null {
  if (!config || config.length === 0) return null
  return config.find((u) => u.isDefaultSale) ?? getBaseUnit(config)
}

/** Recherche d'une unité commerciale configurée par son code. */
export function findUnit(
  config: ProductUnitConfig | null | undefined,
  unitCode: string | null | undefined,
): StockUnitConfig | null {
  if (!config || !unitCode) return null
  return config.find((u) => u.unitCode === unitCode) ?? null
}

/** Quantité en unité de base → unité commerciale (multiplication). */
export function toBaseQuantity(quantity: number, unit: StockUnitConfig): number {
  return quantity * unit.conversionToBase
}

/**
 * Quantité en unité de base → unité commerciale (division). Renvoie null
 * si la conversion n'est pas exacte (le reste n'est pas représentable) —
 * l'appelant décide (voix : refus honnête ; UI : affichage mixte).
 */
export function fromBaseQuantityExact(quantityBase: number, unit: StockUnitConfig): number | null {
  if (unit.conversionToBase <= 0) return null
  const converted = quantityBase / unit.conversionToBase
  // Tolérance flottante : 2.9999999999999996 ≈ 3.
  const rounded = Math.round(converted * 1000) / 1000
  return Math.abs(converted - rounded) < 1e-9 ? rounded : null
}

/** Arrondi métier : numeric(14,3) en base, 3 décimales max. */
export function roundQuantity(q: number): number {
  return Math.round(q * 1000) / 1000
}

/**
 * Pluriel naïf du libellé : « 1 sac », « 2 sacs ». Les libellés se
 * pluriel-isent par -s sauf exception listée (pas de pluriel lexical
 * exotique dans le catalogue : sacs, kilos, bassines… sont réguliers).
 */
export function unitLabel(unitCode: string, quantity: number): string {
  const def = UNITS_BY_CODE.get(unitCode)
  const label = def ? def.labelFr : unitCode
  return quantity > 1 ? `${label}s` : label
}

export interface StockDisplayPart {
  unitCode: string
  quantity: number
}

/**
 * Affichage commercial « 2 sacs + 13 kilos » (§8) : décompose la quantité
 * de base en unités commerciales du plus grand au plus petit contenant,
 * puis le reste en unité de base.
 *
 *  • formatStockDisplay(63, [{sac ×25, base kg}]) → [{sac: 2}, {kg: 13}]
 *    → « 2 sacs + 13 kilos »
 *  • 50 → « 2 sacs » (pas de « + 0 kilo »)
 *  • 13 → « 13 kilos » (pas de « 0 sac + »)
 *  • Sans config (null/[]) → la quantité brute seule, honnête : « 63 »
 *  • Reste non entier (ex. base 13,75 kg) → la décimale est gardée sur
 *    l'unité de base (« 13,75 kilos »), jamais écrasée.
 */
export function buildStockDisplayParts(
  quantityBase: number,
  config: ProductUnitConfig | null | undefined,
  baseUnitCode?: string | null,
): StockDisplayPart[] {
  const parts: StockDisplayPart[] = []
  const containers = (config ?? [])
    .filter((u) => !u.isBase && u.conversionToBase > 1)
    .sort((a, b) => b.conversionToBase - a.conversionToBase)
  let rest = quantityBase

  for (const container of containers) {
    if (rest < container.conversionToBase) continue
    const count = Math.floor(rest / container.conversionToBase)
    rest = roundQuantity(rest - count * container.conversionToBase)
    parts.push({ unitCode: container.unitCode, quantity: count })
  }

  if (rest > 0 || parts.length === 0) {
    const baseCode = baseUnitCode ?? getBaseUnit(config)?.unitCode ?? null
    parts.push({ unitCode: baseCode ?? '', quantity: rest })
  }
  return parts
}

/**
 * Version parlée/affichée : « 2 sacs + 13 kilos ». Sans unité de base
 * connue, le reste est rendu nu (« 63 ») — jamais d'unité inventée.
 */
export function formatStockDisplay(
  quantityBase: number,
  config: ProductUnitConfig | null | undefined,
  baseUnitCode?: string | null,
): string {
  const parts = buildStockDisplayParts(quantityBase, config, baseUnitCode)
  return parts
    .map((p) => (p.unitCode ? `${formatQuantity(p.quantity)} ${unitLabel(p.unitCode, p.quantity)}` : formatQuantity(p.quantity)))
    .join(' + ')
}

/** Format quantité : entier sans décimale inutile, sinon 3 décimales max
 * avec virgule française (« 13 », « 1,5 », « 13,75 »). */
export function formatQuantity(q: number): string {
  const rounded = roundQuantity(q)
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toLocaleString('fr-FR', { maximumFractionDigits: 3 })
}
