import { describe, expect, it } from 'vitest'

// MODE-947 (AUDIT-003 D-3) — contrat du rapport producteur côté client :
// CSV `;` avec BOM, échappement des saisies libres, sections cycles /
// récoltes / ventes / production par produit, résumé parlé honnête
// (aucune vente dite « en cours » si le serveur n'en connaît pas).

import {
  buildRapportProducteurCsv,
  resumerRapportProducteur,
  type RapportProducteurServeur,
} from '../rapport'

const RAPPORT: RapportProducteurServeur = {
  cycles: {
    total: 2,
    parStatut: { en_cours: 1, recolte: 1 },
    quantiteRecolteeKg: 120.5,
  },
  recoltes: {
    total: 3,
    parStatut: { publiee: 2, brouillon: 1 },
    totalKg: 95,
    ventesRealisees: 1,
    montantVentes: 45000,
    parProduit: [
      { nom: 'Manioc', nombreRecoltes: 2, totalKg: 80 },
      { nom: 'Igname "bashé"', nombreRecoltes: 1, totalKg: 15 },
    ],
  },
  generatedAt: '2026-09-21T18:00:00.000Z',
}

describe('buildRapportProducteurCsv (MODE-947)', () => {
  it('produit un CSV ; avec BOM, sections cycles / récoltes / production', () => {
    const csv = buildRapportProducteurCsv(RAPPORT, { genereLe: '21/09/2026 18:00' })
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('Rapport cycles et récoltes — Julaba')
    expect(csv).toContain('Cycles de culture')
    expect(csv).toContain('2;120.5')
    expect(csv).toContain('Statut;Nombre')
    expect(csv).toContain('en_cours;1')
    expect(csv).toContain('Récoltes')
    expect(csv).toContain('3;95;1;45000')
    expect(csv).toContain('Production par produit')
    expect(csv).toContain('Manioc;2;80')
  })

  it('échappe ; guillemets et retours à la ligne dans les produits', () => {
    const csv = buildRapportProducteurCsv(RAPPORT, { genereLe: '21/09/2026' })
    expect(csv).toContain('"Igname ""bashé""";1;15')
  })

  it('reporte les bornes serveur quand la lecture a été plafonnée', () => {
    const csv = buildRapportProducteurCsv(
      { ...RAPPORT, borneCycles: 'Rapport limité aux 500 cycles les plus récents.' },
      { genereLe: '21/09/2026' }
    )
    expect(csv).toContain('Rapport limité aux 500 cycles les plus récents.')
  })
})

describe('resumerRapportProducteur (MODE-947)', () => {
  it('annonce cycles, récoltes, kilos et ventes réalisées', () => {
    const phrase = resumerRapportProducteur(RAPPORT)
    expect(phrase).toContain('2 cycles')
    expect(phrase).toContain('3 récoltes')
    expect(phrase).toContain('95 kilos')
    expect(phrase).toContain('1 vente réalisée')
    expect(phrase).toMatch(/45\s000 FCFA/)
  })

  it('dit honnêtement « aucune vente » quand le serveur n\u2019en connaît pas', () => {
    const phrase = resumerRapportProducteur({
      ...RAPPORT,
      recoltes: { ...RAPPORT.recoltes, ventesRealisees: 0, montantVentes: 0 },
    })
    expect(phrase).toContain('Aucune vente enregistrée')
    expect(phrase).not.toContain('FCFA')
  })

  it('singulier quand il n\u2019y a qu\u2019un cycle et une récolte', () => {
    const phrase = resumerRapportProducteur({
      ...RAPPORT,
      cycles: { total: 1, parStatut: { en_cours: 1 }, quantiteRecolteeKg: 0 },
      recoltes: { ...RAPPORT.recoltes, total: 1 },
    })
    expect(phrase).toContain('1 cycle')
    expect(phrase).toContain('1 récolte')
  })
})
