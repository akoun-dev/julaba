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
 */

import type { BesoinCoop, TransactionCoop } from '@/lib/stores/cooperative-store'

// ── Filtres du journal de trésorerie ─────────────────────────────────────

export type FiltreStatutTransaction = 'tous' | 'en_attente' | 'validee' | 'annulee'
export type FiltreTypeTransaction = 'tous' | 'entree' | 'sortie'

export interface CritereTresorerie {
  statut: FiltreStatutTransaction
  type: FiltreTypeTransaction
}

export function filtrerTransactions(
  transactions: TransactionCoop[],
  criteres: CritereTresorerie
): TransactionCoop[] {
  return transactions.filter((tx) => {
    if (criteres.statut !== 'tous' && tx.statut !== criteres.statut) return false
    if (criteres.type !== 'tous' && tx.type !== criteres.type) return false
    return true
  })
}

// ── Filtre des besoins (vue « tous ») ─────────────────────────────────────

export type FiltreStatutBesoin = 'tous' | BesoinCoop['statut']

export function filtrerBesoins(besoins: BesoinCoop[], statut: FiltreStatutBesoin): BesoinCoop[] {
  if (statut === 'tous') return besoins
  return besoins.filter((b) => b.statut === statut)
}

// ── Pagination « charger plus » ───────────────────────────────────────────

/** Taille de page des journaux (cibles tactiles ≥ 44 px : 15 cartes ≈
 * 3 écrans mobiles, assez pour décider sans noyer). */
export const TAILLE_PAGE = 15

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
