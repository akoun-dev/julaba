/**
 * MODE-901 (§5.2) — marchés et modes d'emplacement du Mode Marché.
 *
 * Aucune table/API « marché » n'existe encore en base (audit
 * PLAN_MARKET_MODE §1.3-5) : cette liste est PROVISOIRE et assumée comme
 * telle. Dès qu'une source serveur (table `markets` ou API dédiée) sera
 * disponible, c'est ICI qu'elle se branchera — les écrans ne doivent
 * jamais lire cette liste directement pour un usage serveur.
 *
 * Règle no-emoji du dépôt : les libellés sont du texte simple.
 */

export type MarketChoice =
  | 'adjame'
  | 'treichville'
  | 'yopougon'
  | 'cocody'
  | 'autre'
  | (string & {})

export interface ProvisionalMarket {
  id: MarketChoice
  name: string
}

export const PROVISIONAL_MARKETS: ProvisionalMarket[] = [
  { id: 'adjame', name: "Marché d'Adjamé" },
  { id: 'treichville', name: 'Marché de Treichville' },
  { id: 'yopougon', name: 'Marché de Yopougon' },
  { id: 'cocody', name: 'Marché de Cocody' },
]

/** Options de configuration de l'emplacement (§5.2), « autre » = saisie libre. */
export const MARKET_OPTIONS: { id: 'gps' | 'select' | 'none' | 'autre'; label: string; hint: string }[] = [
  { id: 'gps', label: 'Utiliser ma position actuelle', hint: 'Jùlaba associera vos opérations à l\'endroit où vous travaillez' },
  { id: 'select', label: 'Choisir un marché', hint: 'Sélectionnez votre marché dans la liste' },
  { id: 'none', label: 'Ne pas enregistrer la position', hint: 'Le Mode Marché fonctionne sans aucune position' },
  { id: 'autre', label: 'Autre marché', hint: 'Saisissez le nom de votre marché' },
]

/**
 * Résout le nom de marché à enregistrer : libellé de la liste pour un choix
 * connu, nom libre trimmé pour « autre » (obligatoire, sinon null), null
 * quand aucun marché n'est choisi.
 */
export function resolveMarketName(choice: MarketChoice | null, customName: string | null): string | null {
  if (choice == null) return null
  if (choice === 'autre') {
    const trimmed = customName?.trim() ?? ''
    return trimmed.length > 0 ? trimmed : null
  }
  return PROVISIONAL_MARKETS.find((m) => m.id === choice)?.name ?? null
}
