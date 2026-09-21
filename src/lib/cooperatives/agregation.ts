/**
 * Agrégation des besoins par produit::unité (MODE-921 §6) — module PUR,
 * testable sans base. Port d'entrée : la liste brute des besoins d'une
 * coopérative ; sortie : un groupe par couple produit+unité, avec la
 * quantité totale à acheter, le nombre de membres concernés et la priorité
 * la plus élevée du groupe (une seule ligne « urgente » rend le groupe
 * urgent — c'est la sémantique de l'achat groupé).
 */

export type BesoinStatut = 'en_attente' | 'consolide' | 'en_cours' | 'livre'
export type BesoinPriorite = 'normale' | 'urgente'

export interface BesoinBrut {
  id: string
  produit: string
  categorie: string | null
  quantite: number
  unite: string
  prixMax: number | null
  priorite: BesoinPriorite
  statut: BesoinStatut
  marchandId: string
  date: string
}

export interface BesoinGroupe {
  cle: string
  produit: string
  categorie: string | null
  unite: string
  quantiteTotale: number
  nbMembres: number
  priorite: BesoinPriorite
  prixMax: number | null
  nbBesoins: number
}

/** Normalise la clé de groupement : un même produit annoncé avec des
 * casses différentes (Igname / igname) doit tomber dans le même groupe —
 * l'achat groupé est un regroupement physique, pas typographique. */
export function cleGroupe(produit: string, unite: string): string {
  const p = produit.trim().toLowerCase()
  const u = unite.trim().toLowerCase()
  return `${p}::${u}`
}

/** Agrège les besoins EN ATTENTE (et seulement eux) par produit::unité.
 * Tri de sortie : urgents d'abord, puis par quantité décroissante. */
export function agregerBesoins(besoins: BesoinBrut[]): BesoinGroupe[] {
  const map = new Map<string, BesoinGroupe>()
  for (const b of besoins) {
    if (b.statut !== 'en_attente') continue
    const cle = cleGroupe(b.produit, b.unite)
    const existant = map.get(cle)
    if (!existant) {
      map.set(cle, {
        cle,
        produit: b.produit.trim(),
        categorie: b.categorie,
        unite: b.unite,
        quantiteTotale: b.quantite,
        nbMembres: 1,
        priorite: b.priorite,
        prixMax: b.prixMax,
        nbBesoins: 1,
      })
      continue
    }
    existant.quantiteTotale += b.quantite
    existant.nbBesoins += 1
    existant.nbMembres += 1
    if (b.priorite === 'urgente') existant.priorite = 'urgente'
    // Prix max du groupe : le plus contraint (le plus bas) reste affiché
    // comme référence d'achat — sinon le plus haut renseigné.
    if (b.prixMax != null) {
      existant.prixMax =
        existant.prixMax == null ? b.prixMax : Math.min(existant.prixMax, b.prixMax)
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.priorite !== b.priorite) return a.priorite === 'urgente' ? -1 : 1
    return b.quantiteTotale - a.quantiteTotale
  })
}
