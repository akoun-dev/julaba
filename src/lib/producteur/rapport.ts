// MODE-947 (AUDIT-003 D-3) — rapport cycles & récoltes du producteur,
// côté client. Source de vérité = la réponse SERVEUR
// (/api/producteur/rapport) : ce module construit le CSV à partir de cette
// réponse (jamais de chiffre inventé localement) et produit un résumé
// parlé. Préalable B-2/B-3 : cycles et récoltes sont des données réelles
// (fins des constantes hard-codées).

import { formatFCFA } from '@/lib/utils'

export interface RapportProduitRecolte {
  nom: string
  nombreRecoltes: number
  totalKg: number
}

export interface RapportProducteurServeur {
  cycles: {
    total: number
    parStatut: Record<string, number>
    quantiteRecolteeKg: number
  }
  recoltes: {
    total: number
    parStatut: Record<string, number>
    totalKg: number
    /** Nombre de récoltes VENDUES (acheteur connu). */
    ventesRealisees: number
    /** Σ des montants de vente (FCFA) — 0 si aucune vente. */
    montantVentes: number
    parProduit: RapportProduitRecolte[]
  }
  generatedAt: string
  /** Présents quand la lecture serveur a été plafonnée. */
  borneCycles?: string
  borneRecoltes?: string
}

export interface MetaRapportProducteur {
  genereLe: string
}

/** Échappement CSV — produit/parcelle/acheteur sont des saisies libres. */
function champCsv(valeur: string | number): string {
  const s = String(valeur)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV `;` (Excel FR) avec BOM UTF-8 : sections cycles, récoltes, ventes,
 * production par produit. */
export function buildRapportProducteurCsv(
  rapport: RapportProducteurServeur,
  meta: MetaRapportProducteur
): string {
  const lignes: string[] = []
  lignes.push('Rapport cycles et récoltes — Julaba')
  lignes.push(`Généré le;${champCsv(meta.genereLe)}`)
  lignes.push('')
  lignes.push('Cycles de culture')
  lignes.push('Total;Quantité récoltée (kg)')
  lignes.push(`${rapport.cycles.total};${rapport.cycles.quantiteRecolteeKg}`)
  const statutsCycles = Object.entries(rapport.cycles.parStatut)
  if (statutsCycles.length > 0) {
    lignes.push('Statut;Nombre')
    for (const [statut, n] of statutsCycles) lignes.push(`${champCsv(statut)};${n}`)
  }
  lignes.push('')
  lignes.push('Récoltes')
  lignes.push('Total;Quantité (kg);Ventes réalisées;Montant des ventes (FCFA)')
  lignes.push(
    `${rapport.recoltes.total};${rapport.recoltes.totalKg};${rapport.recoltes.ventesRealisees};${rapport.recoltes.montantVentes}`
  )
  const statutsRecoltes = Object.entries(rapport.recoltes.parStatut)
  if (statutsRecoltes.length > 0) {
    lignes.push('Statut;Nombre')
    for (const [statut, n] of statutsRecoltes) lignes.push(`${champCsv(statut)};${n}`)
  }
  lignes.push('')
  lignes.push('Production par produit')
  lignes.push('Produit;Récoltes;Quantité (kg)')
  for (const p of rapport.recoltes.parProduit) {
    lignes.push(`${champCsv(p.nom)};${p.nombreRecoltes};${p.totalKg}`)
  }
  if (rapport.borneCycles) lignes.push(champCsv(rapport.borneCycles))
  if (rapport.borneRecoltes) lignes.push(champCsv(rapport.borneRecoltes))
  return `\uFEFF${lignes.join('\n')}`
}

/** Résumé parlé — les faits du serveur, sans embellie ni invention. */
export function resumerRapportProducteur(rapport: RapportProducteurServeur): string {
  const c = rapport.cycles
  const r = rapport.recoltes
  let phrase = `Rapport : ${c.total} cycle${c.total > 1 ? 's' : ''} de culture, ` +
    `${r.total} récolte${r.total > 1 ? 's' : ''} pour ${r.totalKg.toLocaleString('fr-FR')} kilos.`
  if (r.ventesRealisees > 0) {
    phrase += ` ${r.ventesRealisees} vente${r.ventesRealisees > 1 ? 's' : ''} réalisée${r.ventesRealisees > 1 ? 's' : ''} pour ${formatFCFA(r.montantVentes)}.`
  } else {
    phrase += ' Aucune vente enregistrée pour le moment.'
  }
  return phrase
}
