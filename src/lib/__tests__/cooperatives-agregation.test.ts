import { describe, it, expect } from 'vitest'
import { agregerBesoins, cleGroupe, type BesoinBrut } from '@/lib/cooperatives/agregation'

// Invariants du module PUR d'agrégation des besoins (MODE-921 §6) —
// l'achat groupé regroupe par produit+unité PHYSIQUE, jamais typographique.

const besoin = (sur: Partial<BesoinBrut>): BesoinBrut => ({
  id: sur.id ?? 'b1',
  produit: sur.produit ?? 'Igname',
  categorie: sur.categorie ?? null,
  quantite: sur.quantite ?? 10,
  unite: sur.unite ?? 'kg',
  prixMax: sur.prixMax ?? null,
  priorite: sur.priorite ?? 'normale',
  statut: sur.statut ?? 'en_attente',
  marchandId: sur.marchandId ?? 'm1',
  date: sur.date ?? '2026-09-20T00:00:00Z',
})

describe('cleGroupe — normalisation physique du groupement', () => {
  it('regroupe les casses différentes du même produit', () => {
    expect(cleGroupe('Igname', 'kg')).toBe(cleGroupe('igname', 'KG'))
  })

  it('sépare les unités différentes (kg vs sac ne s\u2019achètent pas pareil)', () => {
    expect(cleGroupe('igname', 'kg')).not.toBe(cleGroupe('igname', 'sac'))
  })
})

describe('agregerBesoins — invariants de l\u2019achat groupé', () => {
  it('somme les quantités par produit::unité et compte les membres', () => {
    const groupes = agregerBesoins([
      besoin({ id: 'b1', marchandId: 'm1', quantite: 10 }),
      besoin({ id: 'b2', marchandId: 'm2', quantite: 15 }),
    ])
    expect(groupes).toHaveLength(1)
    expect(groupes[0].quantiteTotale).toBe(25)
    expect(groupes[0].nbBesoins).toBe(2)
    expect(groupes[0].nbMembres).toBe(2)
    expect(groupes[0].produit).toBe('Igname')
  })

  it('ignore les besoins non en_attente (consolidé = déjà traité)', () => {
    const groupes = agregerBesoins([
      besoin({ id: 'b1', statut: 'en_attente', quantite: 10 }),
      besoin({ id: 'b2', statut: 'consolide', quantite: 99 }),
    ])
    expect(groupes).toHaveLength(1)
    expect(groupes[0].quantiteTotale).toBe(10)
  })

  it('une seule ligne urgente rend le groupe entier urgent', () => {
    const groupes = agregerBesoins([
      besoin({ id: 'b1', priorite: 'normale' }),
      besoin({ id: 'b2', priorite: 'urgente' }),
    ])
    expect(groupes[0].priorite).toBe('urgente')
  })

  it('trie les groupes : urgents d\u2019abord, puis quantité décroissante', () => {
    const groupes = agregerBesoins([
      besoin({ id: 'b1', produit: 'Riz', quantite: 100, priorite: 'normale' }),
      besoin({ id: 'b2', produit: 'Huile', quantite: 2, priorite: 'urgente' }),
      besoin({ id: 'b3', produit: 'Sel', quantite: 50, priorite: 'normale' }),
    ])
    expect(groupes.map((g) => g.produit)).toEqual(['Huile', 'Riz', 'Sel'])
  })

  it('le prix max du groupe est le plus contraint (le plus bas)', () => {
    const groupes = agregerBesoins([
      besoin({ id: 'b1', prixMax: 500 }),
      besoin({ id: 'b2', prixMax: 300 }),
      besoin({ id: 'b3', prixMax: null }),
    ])
    expect(groupes[0].prixMax).toBe(300)
  })

  it('retourne un tableau vide sans besoin en attente (pas de groupe fantôme)', () => {
    expect(agregerBesoins([besoin({ statut: 'livre' })])).toEqual([])
  })
it('DET-COOP-005 (MODE-951) : nbMembres compte les marchands DISTINCTS, nbBesoins les besoins', () => {
    const groupes = agregerBesoins([
      besoin({ id: 'b1', marchandId: 'm1', produit: 'Riz', quantite: 10 }),
      besoin({ id: 'b2', marchandId: 'm1', produit: 'riz', quantite: 20 }),
      besoin({ id: 'b3', marchandId: 'm2', produit: 'Riz', quantite: 5 }),
    ])
    expect(groupes).toHaveLength(1)
    expect(groupes[0].nbBesoins).toBe(3)
    expect(groupes[0].nbMembres).toBe(2)
    expect(groupes[0].quantiteTotale).toBe(35)
  })
})
