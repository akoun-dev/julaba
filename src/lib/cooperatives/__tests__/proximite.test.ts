import { describe, expect, it } from 'vitest'
import {
  distanceKm,
  trancheProximite,
  trierRecoltesParProximite,
  TRANCHES_PROXIMITE,
  type Coords,
  type TrancheProximite,
} from '../proximite'

// MODE-979 (DET-COOP-008) — Haversine pur : les valeurs de référence
// viennent du référentiel `communes` (migration 20260922100000). Les
// bornes des assertions tolèrent l'arrondi au km et la précision ~1 km
// des centres de commune — jamais l'ordre de grandeur.

const PLATEAU: Coords = { lat: 5.3261, lng: -4.0206 } // Abidjan
const GRAND_BASSAM: Coords = { lat: 5.2, lng: -3.7383 } // ~34 km du Plateau
const YAMOUSSOUKRO: Coords = { lat: 6.8276, lng: -5.2893 } // ~218 km du Plateau
const KORHOGO: Coords = { lat: 9.4508, lng: -5.6272 } // ~460 km du Plateau

describe('distanceKm (Haversine, MODE-979)', () => {
  it('distance d’un point à lui-même = 0', () => {
    expect(distanceKm(PLATEAU, PLATEAU)).toBe(0)
  })

  it('Abidjan ↔ Grand-Bassam ≈ 34 km (même corridor côtier)', () => {
    const d = distanceKm(PLATEAU, GRAND_BASSAM)
    expect(d).toBeGreaterThanOrEqual(30)
    expect(d).toBeLessThanOrEqual(38)
  })

  it('Abidjan ↔ Yamoussoukro ≈ 218 km (centre du pays)', () => {
    const d = distanceKm(PLATEAU, YAMOUSSOUKRO)
    expect(d).toBeGreaterThanOrEqual(210)
    expect(d).toBeLessThanOrEqual(226)
  })

  it('Abidjan ↔ Korhogo ≈ 492 km (nord)', () => {
    const d = distanceKm(PLATEAU, KORHOGO)
    expect(d).toBeGreaterThanOrEqual(485)
    expect(d).toBeLessThanOrEqual(500)
  })

  it('symétrie : a→b = b→a (arrondi près)', () => {
    expect(distanceKm(PLATEAU, YAMOUSSOUKRO)).toBe(distanceKm(YAMOUSSOUKRO, PLATEAU))
  })
})

describe('trancheProximite (MODE-979)', () => {
  it('null pour une distance nulle (coords absentes — tranche jamais devinée)', () => {
    expect(trancheProximite(null)).toBeNull()
  })

  it('borne à 25 km : proche', () => {
    expect(trancheProximite(0)).toBe('proche')
    expect(trancheProximite(25)).toBe('proche')
  })

  it('borne à 100 km : moyenne', () => {
    expect(trancheProximite(26)).toBe('moyenne')
    expect(trancheProximite(100)).toBe('moyenne')
  })

  it('au-delà : loin', () => {
    expect(trancheProximite(101)).toBe('loin')
    expect(trancheProximite(1000)).toBe('loin')
  })

  it('les tranches sont ordonnées et exhaustives', () => {
    expect(TRANCHES_PROXIMITE.map((t) => t.cle)).toEqual(['proche', 'moyenne', 'loin'])
  })
})

describe('trierRecoltesParProximite (MODE-979)', () => {
  const recolte = (id: string, date: string, commune: Coords | null, extra = {}) => ({
    id,
    dateRecolte: date,
    distanceKm: null as number | null,
    tranche: null as TrancheProximite | null,
    commune,
    ...extra,
  })

  it('tri par distance croissante depuis la coopérative', () => {
    const tri = trierRecoltesParProximite(
      [
        recolte('koro', '2026-09-01', KORHOGO),
        recolte('bassam', '2026-09-10', GRAND_BASSAM),
        recolte('yamo', '2026-09-05', YAMOUSSOUKRO),
      ],
      PLATEAU,
    )
    expect(tri.map((r) => r.id)).toEqual(['bassam', 'yamo', 'koro'])
    expect(tri[0].distanceKm).toBeGreaterThanOrEqual(30)
    expect(tri[0].distanceKm).toBeLessThanOrEqual(38)
    expect(tri[0].tranche).toBe('moyenne') // ~34 km du Plateau
    expect(tri[1].tranche).toBe('loin') // ~218 km
  })

  it('ex æquo de distance : la plus récente d’abord', () => {
    const m1: Coords = { lat: 5.2, lng: -3.7383 }
    const m2: Coords = { lat: 5.2, lng: -3.7384 }
    const tri = trierRecoltesParProximite(
      [
        recolte('ancienne', '2026-08-01', m2),
        recolte('recente', '2026-09-15', m1),
      ],
      PLATEAU,
    )
    expect(tri.map((r) => r.id)).toEqual(['recente', 'ancienne'])
  })

  it('coopérative sans commune : tri par date seule, distance null partout (jamais approximée)', () => {
    const tri = trierRecoltesParProximite(
      [
        recolte('b', '2026-09-01', GRAND_BASSAM),
        recolte('a', '2026-09-20', KORHOGO),
      ],
      null,
    )
    expect(tri.map((r) => r.id)).toEqual(['a', 'b'])
    expect(tri.every((r) => r.distanceKm === null && r.tranche === null)).toBe(true)
  })

  it('récolte sans commune producteur : fin de liste, distance null — jamais de calcul depuis (0,0)', () => {
    const tri = trierRecoltesParProximite(
      [
        recolte('sans-commune', '2026-09-30', null),
        recolte('koro', '2026-09-01', KORHOGO),
      ],
      PLATEAU,
    )
    expect(tri.map((r) => r.id)).toEqual(['koro', 'sans-commune'])
    expect(tri[1].distanceKm).toBeNull()
    expect(tri[1].tranche).toBeNull()
  })

  it('le tri est PUR : la liste en entrée n’est pas mutée', () => {
    const entree = [recolte('koro', '2026-09-01', KORHOGO), recolte('bassam', '2026-09-10', GRAND_BASSAM)]
    const copie = JSON.parse(JSON.stringify(entree))
    trierRecoltesParProximite(entree, PLATEAU)
    expect(entree).toEqual(copie)
  })
})
