import { describe, expect, it } from 'vitest'
import {
  SEUIL_HAUT, SEUIL_MOYEN,
  niveauPerformance,
  calculerScoreMarchand, calculerScoreCooperateur, MAX_MARCHAND, MAX_COOPERATEUR,
  type SignalMarchand, type SignalCooperateur,
} from '../scores/score-julaba'

// MODE-932 — Score JULABA (module pur). Les seuils et paliers sont le
// contrat de parité avec julaba-app (ScoreRing 71/41, membres_count +
// besoins_traites pour le coopérateur).

describe('niveauPerformance (seuils 71/41)', () => {
  it('0 et 40 → bas', () => {
    expect(niveauPerformance(0)).toBe('bas')
    expect(niveauPerformance(40)).toBe('bas')
    expect(niveauPerformance(SEUIL_MOYEN - 1)).toBe('bas')
  })

  it('41 et 70 → moyen (borne exacte incluse)', () => {
    expect(niveauPerformance(41)).toBe('moyen')
    expect(niveauPerformance(70)).toBe('moyen')
    expect(niveauPerformance(SEUIL_HAUT - 1)).toBe('moyen')
  })

  it('71 et 100 → haut (borne exacte incluse)', () => {
    expect(niveauPerformance(71)).toBe('haut')
    expect(niveauPerformance(100)).toBe('haut')
  })
})

// ── Score MARCHAND ───────────────────────────────────────────────────────

const marchandVide: SignalMarchand = {
  ventes30j: 0,
  journees30j: 0,
  cotisationValidee: false,
  apports30j: 0,
  profil: { prenom: false, nom: false, telephone: false },
}

describe('calculerScoreMarchand', () => {
  it('aucun signal → 0, niveau bas, toutes les lignes vides', () => {
    const r = calculerScoreMarchand(marchandVide)
    expect(r.score).toBe(0)
    expect(r.niveau).toBe('bas')
    expect(r.detail.every((l) => l.points === 0)).toBe(true)
    expect(r.detail.map((l) => l.cle)).toEqual(['ventes', 'journees', 'cotisation', 'apports', 'profil'])
  })

  it('tous les signaux au plafond → 100, niveau haut', () => {
    const r = calculerScoreMarchand({
      ventes30j: 15,
      journees30j: 15,
      cotisationValidee: true,
      apports30j: 3,
      profil: { prenom: true, nom: true, telephone: true },
    })
    expect(r.score).toBe(100)
    expect(r.niveau).toBe('haut')
    expect(r.detail.find((l) => l.cle === 'ventes')?.points).toBe(MAX_MARCHAND.ventes)
  })

  it('paliers ventes : 1→10, 4→10, 5→25, 14→25, 15→40', () => {
    const ventes = (n: number) =>
      calculerScoreMarchand({ ...marchandVide, ventes30j: n }).detail.find((l) => l.cle === 'ventes')!.points
    expect(ventes(1)).toBe(10)
    expect(ventes(4)).toBe(10)
    expect(ventes(5)).toBe(25)
    expect(ventes(14)).toBe(25)
    expect(ventes(15)).toBe(40)
    expect(ventes(200)).toBe(40)
  })

  it('paliers journées et apports', () => {
    const journees = (n: number) =>
      calculerScoreMarchand({ ...marchandVide, journees30j: n }).detail.find((l) => l.cle === 'journees')!.points
    expect(journees(1)).toBe(8)
    expect(journees(5)).toBe(14)
    expect(journees(15)).toBe(20)

    const apports = (n: number) =>
      calculerScoreMarchand({ ...marchandVide, apports30j: n }).detail.find((l) => l.cle === 'apports')!.points
    expect(apports(1)).toBe(5)
    expect(apports(2)).toBe(5)
    expect(apports(3)).toBe(10)
  })

  it('profil partiel : 5 points par champ renseigné', () => {
    const r = calculerScoreMarchand({
      ...marchandVide,
      profil: { prenom: true, nom: false, telephone: true },
    })
    expect(r.detail.find((l) => l.cle === 'profil')?.points).toBe(10)
    expect(r.score).toBe(10)
  })

  it('la somme du détail = score (invariant de cohérence)', () => {
    const r = calculerScoreMarchand({
      ventes30j: 7,
      journees30j: 2,
      cotisationValidee: true,
      apports30j: 1,
      profil: { prenom: true, nom: true, telephone: false },
    })
    expect(r.detail.reduce((acc, l) => acc + l.points, 0)).toBe(r.score)
    expect(r.score).toBe(25 + 8 + 15 + 5 + 10)
  })
})

// ── Score COOPÉRATEUR ────────────────────────────────────────────────────

const cooperateurVide: SignalCooperateur = {
  membresActifs: 0,
  besoinsTraites: 0,
  cotisationsValidees: 0,
  mouvementsPotCommun30j: 0,
}

describe('calculerScoreCooperateur', () => {
  it('aucun signal → 0, niveau bas', () => {
    const r = calculerScoreCooperateur(cooperateurVide)
    expect(r.score).toBe(0)
    expect(r.niveau).toBe('bas')
  })

  it('tous les signaux au plafond → 100, niveau haut', () => {
    const r = calculerScoreCooperateur({
      membresActifs: 6,
      besoinsTraites: 6,
      cotisationsValidees: 1,
      mouvementsPotCommun30j: 4,
    })
    expect(r.score).toBe(100)
    expect(r.niveau).toBe('haut')
  })

  it('membres actifs (membres_count) : 1→15, 3→25, 6→40', () => {
    const membres = (n: number) =>
      calculerScoreCooperateur({ ...cooperateurVide, membresActifs: n }).detail.find((l) => l.cle === 'membres')!.points
    expect(membres(0)).toBe(0)
    expect(membres(1)).toBe(15)
    expect(membres(2)).toBe(15)
    expect(membres(3)).toBe(25)
    expect(membres(5)).toBe(25)
    expect(membres(6)).toBe(40)
    expect(membres(40)).toBe(40)
  })

  it('besoins traités (besoins_traites) : 1→10, 3→20, 6→30', () => {
    const besoins = (n: number) =>
      calculerScoreCooperateur({ ...cooperateurVide, besoinsTraites: n }).detail.find((l) => l.cle === 'besoins')!.points
    expect(besoins(0)).toBe(0)
    expect(besoins(1)).toBe(10)
    expect(besoins(2)).toBe(10)
    expect(besoins(3)).toBe(20)
    expect(besoins(5)).toBe(20)
    expect(besoins(6)).toBe(30)
  })

  it('cotisations validées : binaire 0 ou 15', () => {
    const cot = (n: number) =>
      calculerScoreCooperateur({ ...cooperateurVide, cotisationsValidees: n }).detail.find((l) => l.cle === 'cotisations')!.points
    expect(cot(0)).toBe(0)
    expect(cot(1)).toBe(15)
    expect(cot(12)).toBe(15)
  })

  it('pot commun : 1→8, 3→8, 4→15', () => {
    const pot = (n: number) =>
      calculerScoreCooperateur({ ...cooperateurVide, mouvementsPotCommun30j: n }).detail.find((l) => l.cle === 'pot_commun')!.points
    expect(pot(1)).toBe(8)
    expect(pot(3)).toBe(8)
    expect(pot(4)).toBe(15)
  })

  it('la somme du détail = score (invariant de cohérence)', () => {
    const r = calculerScoreCooperateur({
      membresActifs: 4,
      besoinsTraites: 2,
      cotisationsValidees: 3,
      mouvementsPotCommun30j: 0,
    })
    expect(r.detail.reduce((acc, l) => acc + l.points, 0)).toBe(r.score)
    expect(r.score).toBe(25 + 10 + 15 + 0)
    expect(r.niveau).toBe('moyen')
  })
})
