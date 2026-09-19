// MODE-908 (§18) — types et helpers PURS des points de vente (aucune
// dépendance store/réseau) : partageables partout, testables seuls.
//
// Un point de vente = un endroit où le marchand vend (boutique, marché
// Treichville, marché Adjamé, autre emplacement). Le marchand peut TOUJOURS
// vendre : s'il n'a aucun point valide, le dégagement par défaut « Boutique »
// s'applique — activeOrDefault n'est JAMAIS null (le store crée le vrai
// point « Boutique » au premier usage).

export type SellingPointKind = 'boutique' | 'marche' | 'autre'

/** Entité locale-first d'un point de vente (décisions verrouillées MODE-908). */
export interface SellingPoint {
  /** client_id d'idempotence (UUID — unique côté serveur). */
  clientId: string
  name: string
  kind: SellingPointKind
  createdAt: number
  /** Archivage (jamais de suppression) — absent/null = point en activité. */
  archivedAt?: number | null
}

/** Étiquette portée par une vente : l'id + le NOM en snapshot (le nom du
 * point peut évoluer, la vente garde celui du moment). */
export interface ActiveSellingPoint {
  clientId: string
  name: string
}

export const DEFAULT_SELLING_POINT_NAME = 'Boutique'

/** Dégagement par défaut (liste vide ou tout archivé) — JAMAIS null : le
 * clientId n'est PAS un id réel (le store crée le vrai point au premier
 * usage) ; il ne doit jamais partir tel quel dans un payload serveur. */
export const DEFAULT_SELLING_POINT: ActiveSellingPoint = {
  clientId: 'point-boutique-defaut',
  name: DEFAULT_SELLING_POINT_NAME,
}

export function isPointArchived(point: Pick<SellingPoint, 'archivedAt'>): boolean {
  return point.archivedAt != null
}

/** Résout le point actif : l'actif s'il est valide (non archivé), sinon le
 * premier point non archivé (création la plus ancienne), sinon le défaut
 * « Boutique » — jamais null, jamais throw. */
export function activeOrDefault(
  points: SellingPoint[],
  activeClientId: string | null | undefined,
): ActiveSellingPoint {
  const available = points.filter((p) => !isPointArchived(p))
  const active = activeClientId
    ? available.find((p) => p.clientId === activeClientId)
    : undefined
  if (active) return { clientId: active.clientId, name: active.name }
  const first = [...available].sort((a, b) => a.createdAt - b.createdAt)[0]
  if (first) return { clientId: first.clientId, name: first.name }
  return DEFAULT_SELLING_POINT
}
