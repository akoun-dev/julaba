import { describe, expect, it } from 'vitest'

// MODE-945 (AUDIT-003 D-1) — contrat du rapport de session de marché côté
// client : CSV `;` (Excel FR) avec BOM UTF-8, champs libres correctement
// échappés (un nom de produit/point ne doit jamais casser une colonne),
// totaux appareil étiquetés comme tels, résumé parlé honnête (écart
// appareil ↔ serveur dit, jamais recalculé ni masqué).

import {
  buildCaisseReportCsv,
  resumerRapport,
  type RapportSessionServeur,
} from '../caisse-report'

const RAPPORT: RapportSessionServeur = {
  sessionId: 'session-1234-abcd',
  generatedAt: '2026-09-21T18:00:00.000Z',
  totaux: { ventes: 3, totalMontant: 3500, totalRecu: 4000, ventesVocales: 1 },
  parPoint: [
    { pointId: 'pt-1', nom: 'Marché de Cocody', ventes: 2, total: 2500 },
    { pointId: null, nom: 'Point non précisé', ventes: 1, total: 1000 },
  ],
  topProduits: [
    { nom: 'Riz; local', quantite: 3, total: 2250 },
    { nom: 'Huile "rouge"', quantite: 1, total: 2000 },
  ],
}

describe('buildCaisseReportCsv (MODE-945)', () => {
  it('produit un CSV ; avec BOM UTF-8, sections et totaux serveur', () => {
    const csv = buildCaisseReportCsv(RAPPORT, { genereLe: '21/09/2026 18:00' })
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('Rapport de session de marché — Julaba')
    expect(csv).toContain('Session;session-1234-abcd')
    expect(csv).toContain('Totaux serveur')
    expect(csv).toContain('3;3500;4000;1')
    expect(csv).toContain('Par point de vente')
    expect(csv).toContain('Marché de Cocody;2;2500')
    expect(csv).toContain('Point non précisé;1;1000')
    expect(csv).toContain('Top produits')
  })

  it('échappe ; guillemets et retours à la ligne dans les champs libres', () => {
    const csv = buildCaisseReportCsv(RAPPORT, { genereLe: '21/09/2026' })
    expect(csv).toContain('"Riz; local";3;2250')
    expect(csv).toContain('"Huile ""rouge""";1;2000')
  })

  it('étiquette les totaux appareil comme tels et ajoute la caisse comptée', () => {
    const csv = buildCaisseReportCsv(RAPPORT, {
      genereLe: '21/09/2026',
      ventesAppareil: 4,
      depensesAppareil: 500,
      caisseComptee: 3000,
    })
    expect(csv).toContain('Ventes appareil (peut inclure des ventes non synchronisées);4')
    expect(csv).toContain('Dépenses appareil (aucune session_id serveur);500')
    expect(csv).toContain('Caisse comptée à la clôture;3000')
  })

  it('omet les lignes appareil quand aucune meta n\u2019est fournie', () => {
    const csv = buildCaisseReportCsv(RAPPORT, { genereLe: '21/09/2026' })
    expect(csv).not.toContain('Ventes appareil')
    expect(csv).not.toContain('Dépenses appareil')
    expect(csv).not.toContain('Caisse comptée')
  })

  it('reporte la borne serveur quand la lecture a été plafonnée', () => {
    const csv = buildCaisseReportCsv(
      { ...RAPPORT, borne: 'Rapport limité aux 1000 ventes les plus récentes de la session.' },
      { genereLe: '21/09/2026' }
    )
    expect(csv).toContain('Rapport limité aux 1000 ventes les plus récentes de la session.')
  })
})

describe('resumerRapport (MODE-945)', () => {
  it('annonce les faits serveur sans écart quand tout est synchronisé', () => {
    const r = resumerRapport(RAPPORT, { ventesAppareil: 3 })
    expect(r.phrase).toContain('3 ventes')
    expect(r.phrase).toMatch(/3\s+500 FCFA/)
    expect(r.ecartServeurManque).toBe(0)
    expect(r.ecartServeurPlus).toBe(0)
  })

  it('dit combien de ventes appareil attendent de partir (offline)', () => {
    const r = resumerRapport(RAPPORT, { ventesAppareil: 5 })
    expect(r.ecartServeurManque).toBe(2)
    expect(r.phrase).toContain('2 ventes de cet appareil attendent')
  })

  it('dit quand le serveur connaît plus de ventes que l\u2019appareil', () => {
    const r = resumerRapport(RAPPORT, { ventesAppareil: 2 })
    expect(r.ecartServeurPlus).toBe(1)
    expect(r.phrase).toContain('1 vente de plus')
  })

  it('sans ventesAppareil, ne fabrique aucun écart', () => {
    const r = resumerRapport(RAPPORT, {})
    expect(r.ecartServeurManque).toBe(0)
    expect(r.ecartServeurPlus).toBe(0)
  })

  // MODE-984 (AUDIT-008) — un rapport PARTIEL est annoncé immédiatement :
  // borne de lecture et produits indisponibles arrivent dans la PHRASE.

  it('annonce la borne de lecture quand le rapport est tronqué', () => {
    const r = resumerRapport(
      { ...RAPPORT, borne: 'Rapport limité aux 1000 ventes les plus récentes de la session.' },
      {}
    )
    expect(r.phrase).toContain('Rapport limité aux 1000 ventes')
  })

  it('annonce le détail produits indisponible quand la lecture des items a échoué', () => {
    const r = resumerRapport({ ...RAPPORT, produitsIndisponibles: true }, {})
    expect(r.phrase).toContain('Le détail des produits est indisponible')
  })

  it('CSV : signale le détail produits indisponible dans la section top produits', () => {
    const csv = buildCaisseReportCsv({ ...RAPPORT, produitsIndisponibles: true }, { genereLe: '2026-09-23' })
    expect(csv).toContain('Détail des produits indisponible')
  })
})
