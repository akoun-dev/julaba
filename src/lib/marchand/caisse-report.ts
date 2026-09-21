// MODE-945 (AUDIT-003 D-1) — rapport de session de marché, côté client.
// Source de vérité = la réponse SERVEUR (/api/marchand/caisse-report) :
// ce module construit le CSV à partir de cette réponse (jamais de chiffre
// inventé localement) et produit un résumé parlé HONNÊTE — l'écart entre
// l'appareil et le serveur (ventes offline pas encore parties, ou ventes
// d'un autre appareil) est DIT, jamais masqué ni recalculé.

import { formatFCFA } from '@/lib/utils'

export interface RapportPointServeur {
  pointId: string | null
  nom: string
  ventes: number
  total: number
}

export interface RapportProduitServeur {
  nom: string
  quantite: number
  total: number
}

export interface RapportSessionServeur {
  sessionId: string
  generatedAt: string
  totaux: {
    ventes: number
    totalMontant: number
    totalRecu: number
    ventesVocales: number
  }
  parPoint: RapportPointServeur[]
  topProduits: RapportProduitServeur[]
  /** Présent quand la session dépasse le plafond de lecture serveur. */
  borne?: string
}

export interface MetaRapport {
  /** Horodatage lisible du rapport (généré côté client au téléchargement). */
  genereLe: string
  /** Caisse réellement comptée à la clôture (MODE-902), si disponible. */
  caisseComptee?: number
  /** Ventes du jour connues de l'APPAREIL (pour l'écart honnête). */
  ventesAppareil?: number
  /** Dépenses du jour connues de l'APPAREIL (sans session_id serveur). */
  depensesAppareil?: number
}

/** Échappement CSV — un nom de produit/point est une saisie libre : `;`,
 * guillemets et retours à la ligne ne doivent jamais casser la colonne. */
function champCsv(valeur: string | number): string {
  const s = String(valeur)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV `;` (Excel FR) avec BOM UTF-8 pour les accents, sections : totaux
 * serveur, éventuels totaux appareil (étiquetés comme tels), par point de
 * vente, top produits. */
export function buildCaisseReportCsv(
  rapport: RapportSessionServeur,
  meta: MetaRapport
): string {
  const lignes: string[] = []
  lignes.push('Rapport de session de marché — Julaba')
  lignes.push(`Session;${champCsv(rapport.sessionId)}`)
  lignes.push(`Généré le;${champCsv(meta.genereLe)}`)
  lignes.push('')
  lignes.push('Totaux serveur')
  lignes.push('Ventes;Total (FCFA);Reçu (FCFA);Ventes vocales')
  lignes.push(
    `${rapport.totaux.ventes};${rapport.totaux.totalMontant};${rapport.totaux.totalRecu};${rapport.totaux.ventesVocales}`
  )
  if (meta.ventesAppareil !== undefined) {
    lignes.push(`Ventes appareil (peut inclure des ventes non synchronisées);${meta.ventesAppareil}`)
  }
  if (meta.depensesAppareil !== undefined) {
    lignes.push('Dépenses appareil (aucune session_id serveur);' + String(meta.depensesAppareil))
  }
  if (meta.caisseComptee !== undefined) {
    lignes.push(`Caisse comptée à la clôture;${meta.caisseComptee}`)
  }
  lignes.push('')
  lignes.push('Par point de vente')
  lignes.push('Point;Ventes;Total (FCFA)')
  for (const p of rapport.parPoint) {
    lignes.push(`${champCsv(p.nom)};${p.ventes};${p.total}`)
  }
  lignes.push('')
  lignes.push('Top produits')
  lignes.push('Produit;Quantité;Total (FCFA)')
  for (const p of rapport.topProduits) {
    lignes.push(`${champCsv(p.nom)};${p.quantite};${p.total}`)
  }
  if (rapport.borne) lignes.push(champCsv(rapport.borne))
  // BOM UTF-8 : Excel affiche les accents sans manipulation.
  return `\uFEFF${lignes.join('\n')}`
}

export interface ResumeRapport {
  phrase: string
  /** Ventes connues de l'appareil mais absentes du serveur (file offline). */
  ecartServeurManque: number
  /** Ventes connues du serveur mais absentes de l'appareil (autre appareil). */
  ecartServeurPlus: number
}

/** Résumé parlé du rapport — l'écart appareil ↔ serveur est dit telle une
 * information, jamais présenté comme une erreur ni recalculé. Seules les
 * ventes de l'appareil sont nécessaires (pas les métadonnées du CSV). */
export function resumerRapport(
  rapport: RapportSessionServeur,
  meta: { ventesAppareil?: number }
): ResumeRapport {
  const ventesAppareil = meta.ventesAppareil ?? rapport.totaux.ventes
  const ecartServeurManque = Math.max(0, ventesAppareil - rapport.totaux.ventes)
  const ecartServeurPlus = Math.max(0, rapport.totaux.ventes - ventesAppareil)
  let phrase = `Rapport serveur : ${rapport.totaux.ventes} ventes pour ${formatFCFA(rapport.totaux.totalMontant)}.`
  if (ecartServeurManque > 0) {
    phrase += ` ${ecartServeurManque} vente${ecartServeurManque > 1 ? 's' : ''} de cet appareil attendent d'être envoyées au serveur.`
  } else if (ecartServeurPlus > 0) {
    phrase += ` Le serveur connaît ${ecartServeurPlus} vente${ecartServeurPlus > 1 ? 's' : ''} de plus (autre appareil).`
  }
  return { phrase, ecartServeurManque, ecartServeurPlus }
}
