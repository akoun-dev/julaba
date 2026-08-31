'use client'

import {
  Apple, Cherry, Carrot, Wheat, Fish, Drumstick, Egg,
  Droplets, Package, Leaf, Cherry as CherryIcon,
  CircleDot, Bean, Citrus, Banana,
  type LucideIcon,
} from 'lucide-react'

/**
 * Maps product names (French) to Lucide icons — replaces the emoji-based
 * getProductEmoji() functions scattered across marchand screens, enforcing
 * the project's Lucide-only rule (no emojis in UI, per AGENTS.md).
 *
 * Falls back to Package for unknown products.
 */
const PRODUCT_ICON_MAP: Record<string, LucideIcon> = {
  // Légumes
  'Tomates': Apple,
  'Tomates (caisse)': Apple,
  'Oignons': CircleDot,
  'Oignons (sac 50kg)': CircleDot,
  'Piments': Cherry,
  'Aubergines': Cherry,
  'Gombos': Leaf,
  'Carottes': Carrot,
  'Concombres': Carrot,
  'Salade': Leaf,
  'Ail': CircleDot,
  'Pommes de terre': CircleDot,
  'Ignames': CircleDot,
  'Ignames (tas)': CircleDot,

  // Fruits
  'Bananes': Banana,
  'Avocats': Apple,
  'Oranges': Citrus,
  'Mangues': Apple,
  'Ananas': Citrus,

  // Céréales & tubercules
  'Riz': Wheat,
  'Riz 25kg long grain': Wheat,
  'Manioc': Wheat,

  // Protéines
  'Poisson fumé': Fish,
  'Poisson fumé (carton)': Fish,
  'Poulet': Drumstick,
  'Poulets vivants (lot 10)': Drumstick,
  'Œufs': Egg,
  'Arachides': Bean,
  'Arachides (sac 25kg)': Bean,

  // Ingrédients
  'Huile de palme': Droplets,
  'Huile de palme 5L': Droplets,
  'Sel': CircleDot,
}

const DEFAULT_ICON = Package

export function getProductIcon(name: string): LucideIcon {
  return PRODUCT_ICON_MAP[name] ?? DEFAULT_ICON
}

/**
 * Pre-built component instances keyed by product name — avoids creating
 * component references during render (react-hooks/static-components).
 * The map is built once at module load; product names are bounded and
 * stable, so the memory cost is negligible.
 */
const ICON_COMPONENTS: Record<string, React.FC<{ className?: string }>> = Object.fromEntries(
  Object.entries(PRODUCT_ICON_MAP).map(([name, Icon]) => [name, (props) => <Icon {...props} />]),
)
const DefaultIconComponent: React.FC<{ className?: string }> = (props) => <Package {...props} />

export function ProductIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_COMPONENTS[name] ?? DefaultIconComponent
  return <Icon className={className} />
}
