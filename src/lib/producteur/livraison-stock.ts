/**
 * MODE-935 (audit #003, I-01/P1-1) — sortie de stock à la livraison.
 *
 * Décision produit (ADR, tranchée dans le sens documenté par la route
 * /api/producteur/stock depuis MODE-931) : le stock du producteur est
 * DÉRIVÉ des récoltes statut='disponible' (une seule source de vérité)
 * et la transition « récolte → mise en stock » est un PATCH serveur
 * gardé (brouillon|publiee → disponible). À la LIVRAISON d'une commande
 * (statut 'livree'), les récoltes disponibles du même produit sont
 * marquées 'vendue' en FIFO — l'unité de vérité du KPI « vendu » reste
 * la récolte, jamais de double comptage.
 *
 * Ce module est PUR et testé : la route n'applique que son verdict.
 */

export interface RecolteStockLite {
  id: string
  produit: string
  quantiteKg: number
  statut: string
}

export interface CommandeLivree {
  quantiteKg: number
  montant: number
  acheteurNom?: string
}

export interface AffectationVente {
  /** Récolte marquée 'vendue'. */
  id: string
  /** Part du montant de la commande affectée à cette récolte (FCFA entier). */
  montantVente: number
  /** Acheteur réel de la commande (reporté sur la récolte vendue). */
  acheteur: string
}

export interface ResultatLivraison {
  /** Récoltes à marquer 'vendue' (FIFO, commandes couvrantes uniquement). */
  vendues: AffectationVente[]
  /** Quantité (kg) restée sans récolte disponible à marquer. */
  quantiteNonCouverte: number
}

/**
 * Consomme les récoltes 'disponible' d'un produit en FIFO (les plus
 * anciennes d'abord, cf. l'ordre date_recolte asc de la route) jusqu'à
 * couvrir la quantité livrée. Une récolte n'est marquée 'vendue' que si
 * la commande la couvre ENTIÈREMENT — jamais de vente partielle
 * inventée : une récolte partiellement couverte reste 'disponible'.
 *
 * Le montant de la commande est réparti au prorata des quantités
 * réellement vendues (arithmétique sur un montant réel, aucun montant
 * fabriqué) ; le reste de la division est porté par la DERNIÈRE récolte
 * pour que la somme des parts égale exactement le montant de la commande.
 * Si la commande ne couvre aucune récolte complète, rien n'est marqué —
 * la vente restera visible par la commande elle-même.
 */
export function affecterVenteAuxRecoltes(
  recoltesDisponibles: RecolteStockLite[],
  commande: CommandeLivree
): ResultatLivraison {
  const vendues: AffectationVente[] = []
  const quantiteCommande = Number(commande.quantiteKg) || 0
  if (quantiteCommande <= 0) {
    return { vendues, quantiteNonCouverte: 0 }
  }

  let restant = quantiteCommande
  let cumulCouvert = 0
  for (const recolte of recoltesDisponibles) {
    if (recolte.statut !== 'disponible') continue
    if (restant <= 0) break
    const quantite = Number(recolte.quantiteKg) || 0
    if (quantite <= 0) continue
    if (quantite > restant) break // couverture partielle → la récolte reste disponible
    cumulCouvert += quantite
    restant -= quantite
    vendues.push({ id: recolte.id, montantVente: 0, acheteur: '' })
  }

  const quantiteNonCouverte = Math.max(0, quantiteCommande - cumulCouvert)

  // L'acheteur réel de la commande est reporté sur chaque récolte vendue,
  // quel que soit le montant (une vente à 0 FCFA reste une vente réelle).
  for (const affectation of vendues) {
    affectation.acheteur = commande.acheteurNom ?? ''
  }

  // Répartition du montant au prorata des quantités vendues ; le reste
  // de l'arrondi FCFA est porté par la dernière récolte (somme exacte).
  const montant = Math.round(Number(commande.montant) || 0)
  if (vendues.length > 0 && cumulCouvert > 0 && montant > 0) {
    let dejaAffecte = 0
    vendues.forEach((affectation, index) => {
      if (index === vendues.length - 1) {
        affectation.montantVente = Math.max(0, montant - dejaAffecte)
      } else {
        const recolte = recoltesDisponibles.find((r) => r.id === affectation.id)
        const quantite = Number(recolte?.quantiteKg) || 0
        const part = Math.round((montant * quantite) / cumulCouvert)
        affectation.montantVente = part
        dejaAffecte += part
      }
    })
  }

  return { vendues, quantiteNonCouverte }
}
