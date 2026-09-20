import { describe, it, expect } from 'vitest'
import {
  transitionRecolteValide,
  transitionCommandeValide,
  RECOLTE_STATUTS,
  COMMANDE_STATUTS,
} from '../producteur/statuts'

// MODE-935 (audit #003, I-12) — machine à états des statuts producteur.
// Le CHECK SQL verrouille l'UNION ; ces tests verrouillent les
// TRANSITIONS (et l'idempotence des rejeux offline).

describe('statuts récolte — transitions (I-12)', () => {
  it("l'union est bornée aux 4 statuts de l'UI", () => {
    expect(RECOLTE_STATUTS).toEqual(['brouillon', 'publiee', 'disponible', 'vendue'])
  })

  it('brouillon → publiee (publier) et brouillon → disponible (mettre en stock)', () => {
    expect(transitionRecolteValide('brouillon', 'publiee')).toBe(true)
    expect(transitionRecolteValide('brouillon', 'disponible')).toBe(true)
  })

  it('publiee → disponible (mise en stock depuis le marché) et → vendue', () => {
    expect(transitionRecolteValide('publiee', 'disponible')).toBe(true)
    expect(transitionRecolteValide('publiee', 'vendue')).toBe(true)
  })

  it('disponible → vendue seulement — jamais de retour en arrière', () => {
    expect(transitionRecolteValide('disponible', 'vendue')).toBe(true)
    expect(transitionRecolteValide('disponible', 'publiee')).toBe(false)
    expect(transitionRecolteValide('disponible', 'brouillon')).toBe(false)
  })

  it('vendue est TERMINAL : un rejeu ou une resoumission ne ressuscite rien', () => {
    expect(transitionRecolteValide('vendue', 'brouillon')).toBe(false)
    expect(transitionRecolteValide('vendue', 'publiee')).toBe(false)
    expect(transitionRecolteValide('vendue', 'disponible')).toBe(false)
  })

  it("rejeu idempotent : le MÊME statut est toujours valide (le flush ne boucle pas)", () => {
    for (const statut of RECOLTE_STATUTS) {
      expect(transitionRecolteValide(statut, statut)).toBe(true)
    }
  })

  it('valeur inconnue (hors union) → refusée', () => {
    expect(transitionRecolteValide('brouillon', 'archivee')).toBe(false)
    expect(transitionRecolteValide('statut-fantome', 'vendue')).toBe(false)
  })
})

describe('statuts commande — transitions (I-12)', () => {
  it("l'union couvre les statuts seed/backoffice/UI", () => {
    expect(COMMANDE_STATUTS).toEqual([
      'a_traiter', 'en_attente', 'confirmee', 'en_cours', 'livree', 'refusee',
    ])
  })

  it('toute commande ouverte peut être acceptée (en_cours) ou refusée', () => {
    for (const ouvert of ['a_traiter', 'en_attente', 'confirmee'] as const) {
      expect(transitionCommandeValide(ouvert, 'en_cours')).toBe(true)
      expect(transitionCommandeValide(ouvert, 'refusee')).toBe(true)
    }
  })

  it('en_cours → livree déclenche la sortie de stock ; refusee est terminal', () => {
    expect(transitionCommandeValide('en_cours', 'livree')).toBe(true)
    expect(transitionCommandeValide('a_traiter', 'livree')).toBe(false) // il faut accepter avant de livrer
    expect(transitionCommandeValide('livree', 'en_cours')).toBe(false)
    expect(transitionCommandeValide('refusee', 'en_cours')).toBe(false)
  })

  it("rejeu idempotent du même statut", () => {
    for (const statut of COMMANDE_STATUTS) {
      expect(transitionCommandeValide(statut, statut)).toBe(true)
    }
  })
})
