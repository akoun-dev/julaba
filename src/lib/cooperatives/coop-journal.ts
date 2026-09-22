/**
 * MODE-976 (AUDIT-007 Phase 4) — Logique PURE des journaux de l'espace
 * coopérative : filtres de trésorerie (statut + type), filtre de statut
 * des besoins et pagination « charger plus ».
 *
 * G13/G14 de l'AUDIT-007 : les listes coopératives s'affichaient ENTIÈRES,
 * sans filtre ni pagination (le journal de trésorerie crachait ses 100
 * lignes d'un coup) — la logique de fenêtrage est ici une fonction pure,
 * testable en node (pas de DOM/RTL dans ce projet), les écrans se
 * contentent de l'appeler.
 *
 * Honnêteté des données (garde-fou #1) : filtrer/paginer NE MENT PAS —
 * le total réel et le nombre restant sont renvoyés à l'écran pour être
 * AFFICHÉS (« 12 sur 34 »), jamais déguisés.
 *
 * MODE-982 (DET-COOP-011, parité julaba-app §4) — le journal gagne les
 * filtres PÉRIODE (7 j / 30 j / 3 mois) et CATÉGORIE (cotisation, vente
 * groupée…), la liste des MEMBRES gagne sa pagination dédiée (20/page).
 * Les nouveaux filtres restent OPTIONNELS dans CritèreTresorerie : les
 * appelants MODE-976 (statut × type) restent inchangés, bit pour bit.
 */

import type { BesoinCoop, MembreCoop, TransactionCoop } from '@/lib/stores/cooperative-store'

// ── Filtres du journal de trésorerie ─────────────────────────────────────

export type FiltreStatutTransaction = 'tous' | 'en_attente' | 'validee' | 'annulee'
export type FiltreTypeTransaction = 'tous' | 'entree' | 'sortie'

/** MODE-982 — fenêtre temporelle du journal. 'toutes' ne filtre pas. */
export type FiltrePeriodeTransaction = 'toutes' | '7j' | '30j' | '3mois'

/** Jours par période — 3 mois = 90 jours calendaires (pas 3 × 30 exacts
 * ni une dérive de Date.setMonth : la fenêtre doit être PRÉVISIBLE). */
export const JOURS_PAR_PERIODE: Record<Exclude<FiltrePeriodeTransaction, 'toutes'>, number> = {
  '7j': 7,
  '30j': 30,
  '3mois': 90,
}

export interface CritereTresorerie {
  statut: FiltreStatutTransaction
  type: FiltreTypeTransaction
  /** MODE-982 — 'toutes' ou absent : aucune contrainte de date. */
  periode?: FiltrePeriodeTransaction
  /** MODE-982 — id de catégorie exact ('cotisation', 'vente_groupee'…) ;
   * 'toutes' ou absent : aucune contrainte de catégorie. */
  categorie?: string
}

export function filtrerTransactions(
  transactions: TransactionCoop[],
  criteres: CritereTresorerie,
  /** Injection de l'horloge (tests) — défaut Date.now(). */
  maintenant: number = Date.now()
): TransactionCoop[] {
  const jours = criteres.periode && criteres.periode !== 'toutes'
    ? JOURS_PAR_PERIODE[criteres.periode]
    : null
  // Borne = instant du rendu − fenêtre : une écriture sans date lisible
  // (NaN) ne peut pas PROUVER qu'elle est dans la fenêtre → elle sort
  // (honnêteté : on n'affiche pas ce qu'on ne sait pas situer).
  const borne = jours !== null ? maintenant - jours * 86_400_000 : null
  return transactions.filter((tx) => {
    if (criteres.statut !== 'tous' && tx.statut !== criteres.statut) return false
    if (criteres.type !== 'tous' && tx.type !== criteres.type) return false
    if (borne !== null) {
      const t = new Date(tx.date).getTime()
      if (Number.isNaN(t) || t < borne) return false
    }
    if (criteres.categorie && criteres.categorie !== 'toutes' && tx.categorie !== criteres.categorie) return false
    return true
  })
}

/** MODE-982 — catégories RÉELLEMENT présentes dans le journal (tri
 * alphabétique, sans doublon) : l'écran ne propose que des chips qui
 * correspondent à des données existantes — jamais un filtre décoratif
 * sans objet. */
export function categoriesJournal(transactions: TransactionCoop[]): string[] {
  const vues = new Set<string>()
  for (const tx of transactions) {
    if (tx.categorie) vues.add(tx.categorie)
  }
  return Array.from(vues).sort((a, b) => a.localeCompare(b, 'fr'))
}

// ── Filtre des besoins (vue « tous ») ─────────────────────────────────────

export type FiltreStatutBesoin = 'tous' | BesoinCoop['statut']

export function filtrerBesoins(besoins: BesoinCoop[], statut: FiltreStatutBesoin): BesoinCoop[] {
  if (statut === 'tous') return besoins
  return besoins.filter((b) => b.statut === statut)
}

// ── Filtres localisation de la liste membres (MODE-985) ─────────────────

// DET-COOP-011 tranche 2 (parité julaba-app §4) — filtres région/commune
// des membres, nourris par la commune DÉCLARÉE du marchand
// (merchants.commune_id, référentiel MODE-979). Honnêteté : un membre
// sans commune déclarée ne PROUVE son appartenance à aucune région — il
// ne passe que dans les filtres « toutes » (jamais de localisation
// devinée depuis le téléphone, le nom ou autre indice indirect).

/** Régions RÉELLEMENT présentes chez les membres déclarés (tri FR, sans
 * doublon). L'écran ne propose que des chips qui correspondent à des
 * données existantes — jamais un filtre décoratif sans objet. */
export function regionsMembres(membres: MembreCoop[]): string[] {
  const vues = new Set<string>()
  for (const m of membres) {
    if (m.commune) vues.add(m.commune.region)
  }
  return Array.from(vues).sort((a, b) => a.localeCompare(b, 'fr'))
}

/** Communes RÉELLEMENT présentes, optionnellement bornées à une région
 * (null = toutes régions). Triées par nom FR. Les doublons d'id disparaissent
 * (plusieurs membres d'une même commune = une seule chip). */
export function communesMembres(
  membres: MembreCoop[],
  region: string | null
): { id: string; nom: string; region: string }[] {
  const vues = new Map<string, { id: string; nom: string; region: string }>()
  for (const m of membres) {
    if (!m.commune) continue
    if (region && m.commune.region !== region) continue
    vues.set(m.commune.id, m.commune)
  }
  return Array.from(vues.values()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

/** Filtre localisation : région puis commune (les deux combinables).
 * null/'toutes' ne contraint pas ; un membre sans commune déclarée ne
 * passe AUCUN filtre actif (il reste visible sans filtre localisation). */
export function filtrerMembresParLocalisation(
  membres: MembreCoop[],
  region: string | null,
  communeId: string | null
): MembreCoop[] {
  return membres.filter((m) => {
    if (region && (!m.commune || m.commune.region !== region)) return false
    if (communeId && (!m.commune || m.commune.id !== communeId)) return false
    return true
  })
}

// ── Pagination « charger plus » ───────────────────────────────────────────

/** Taille de page des journaux (cibles tactiles ≥ 44 px : 15 cartes ≈
 * 3 écrans mobiles, assez pour décider sans noyer). */
export const TAILLE_PAGE = 15

/** MODE-982 (DET-COOP-011) — taille de page de la LISTE DES MEMBRES :
 * 20 cartes par vague (parité julaba-app §4 « pagination 20/page »). */
export const TAILLE_PAGE_MEMBRES = 20

export interface PageJournal<T> {
  /** Les lignes à AFFICHER pour la page courante. */
  visible: T[]
  /** Nombre de lignes masquées après la page courante (0 = tout est là). */
  restantes: number
  /** Total APRÈS filtre (le nombre honnête à afficher dans l'en-tête). */
  total: number
}

export function paginer<T>(lignes: T[], page: number, taille = TAILLE_PAGE): PageJournal<T> {
  const total = lignes.length
  const fin = Math.max(page, 1) * taille
  return {
    visible: lignes.slice(0, fin),
    restantes: Math.max(total - fin, 0),
    total,
  }
}
