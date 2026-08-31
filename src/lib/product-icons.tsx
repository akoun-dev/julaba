import {
  Cherry, Sprout, Flame, Grape, Bean, Banana, ShoppingBasket, Wheat, GlassWater,
  Fish, Drumstick, Egg, Apple, Citrus, Cookie, Popcorn, Carrot, Salad, Leaf,
  Nut, CupSoda, Sandwich, Milk, Croissant, Package, type LucideIcon,
} from 'lucide-react'

/**
 * Central product→icon mapping, replacing the raw food emoji that used to be
 * scattered (and, in caisse/stock/ventes-screen.tsx, byte-for-byte
 * duplicated) across the marchand module — emoji render inconsistently
 * across devices and are invisible to screen readers, both real problems
 * for this app's icons-as-recognition-aid use case (see rule/no-emoji-in-ui
 * in .agents/skills/product-design/references/rules.md). Lucide has no
 * exact icon for every West African market product, so several entries
 * below are a best-effort semantic stand-in rather than a literal depiction
 * — the adjacent product name label is always the real information carrier.
 */
const PRODUCT_ICON_MAP: Record<string, LucideIcon> = {
  'tomates': Cherry,
  'oignons': Sprout,
  'piments': Flame,
  'aubergines': Grape,
  'gombos': Bean,
  'bananes': Banana,
  'ignames': ShoppingBasket,
  'riz': Wheat,
  'huile de palme': GlassWater,
  'poisson fumé': Fish,
  'poulet': Drumstick,
  'œufs': Egg,
  'avocats': Apple,
  'oranges': Citrus,
  'mangues': Cookie,
  'ananas': Popcorn,
  'carottes': Carrot,
  'concombres': Salad,
  'salade': Leaf,
  'ail': Nut,
  'sel': CupSoda,
  'arachides': Sandwich,
  'manioc': Milk,
  'pommes de terre': Croissant,
}

/** Looks up by exact name first, then by substring (handles "Tomates (caisse)", "Riz 25kg long grain", etc.). Falls back to a generic package icon. */
export function getProductIcon(name: string): LucideIcon {
  const key = name.trim().toLowerCase()
  if (PRODUCT_ICON_MAP[key]) return PRODUCT_ICON_MAP[key]
  const match = Object.keys(PRODUCT_ICON_MAP).find((k) => key.includes(k))
  return match ? PRODUCT_ICON_MAP[match] : Package
}

/**
 * Fixed pool for VisualCodeGrid — unlike getProductIcon above, every entry
 * here must stay visually distinct from every other: this is a
 * memorable-picture PIN, so two cells reading as the same icon would be a
 * real usability (and arguably security) defect, not just a cosmetic one.
 */
export const VISUAL_CODE_ICON_POOL = [
  { id: 'tomate', icon: Cherry, label: 'Tomate' },
  { id: 'oignon', icon: Sprout, label: 'Oignon' },
  { id: 'piment', icon: Flame, label: 'Piment' },
  { id: 'aubergine', icon: Grape, label: 'Aubergine' },
  { id: 'gombo', icon: Bean, label: 'Gombo' },
  { id: 'carotte', icon: Carrot, label: 'Carotte' },
  { id: 'salade', icon: Leaf, label: 'Salade' },
  { id: 'ignam', icon: ShoppingBasket, label: 'Ignam' },
  { id: 'banane', icon: Banana, label: 'Banane' },
  { id: 'avocat', icon: Apple, label: 'Avocat' },
  { id: 'mais', icon: Popcorn, label: 'Maïs' },
  { id: 'riz', icon: Wheat, label: 'Riz' },
  { id: 'oeuf', icon: Egg, label: 'Œuf' },
  { id: 'arachide', icon: Sandwich, label: 'Arachide' },
  { id: 'poisson', icon: Fish, label: 'Poisson' },
  { id: 'poulet', icon: Drumstick, label: 'Poulet' },
] as const
