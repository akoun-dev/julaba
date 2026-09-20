import { describe, it, expect } from 'vitest'
import { affecterVenteAuxRecoltes, type RecolteStockLite } from '../producteur/livraison-stock'

// MODE-935 (audit #003, I-01/P1-1) — sortie de stock FIFO à la livraison
// d'une commande : module PUR, la route n'applique que son verdict.

const recolte = (id: string, quantiteKg: number, statut = 'disponible'): RecolteStockLite => ({
  id,
  produit: 'Maïs',
  quantiteKg,
  statut,
})

describe('affecterVenteAuxRecoltes — FIFO à la livraison (I-01)', () => {
  it('commande couvrant exactement une récolte → elle devient vendue, montant intégral', () => {
    const { vendues, quantiteNonCouverte } = affecterVenteAuxRecoltes(
      [recolte('r1', 100)],
      { quantiteKg: 100, montant: 35000, acheteurNom: 'Awa' }
    )
    expect(quantiteNonCouverte).toBe(0)
    expect(vendues).toEqual([{ id: 'r1', montantVente: 35000, acheteur: 'Awa' }])
  })

  it('FIFO : les récoltes les plus anciennes (en tête) sortent en premier', () => {
    const { vendues } = affecterVenteAuxRecoltes(
      [recolte('r1', 50), recolte('r2', 50)],
      { quantiteKg: 60, montant: 12000, acheteurNom: 'Awa' }
    )
    // 60 kg = 50 (r1, entière) + 10 sur r2 (partielle) → seule r1 est vendue.
    expect(vendues.map((v) => v.id)).toEqual(['r1'])
  })

  it('récolte partiellement couverte reste disponible — JAMAIS de vente partielle inventée', () => {
    const { vendues, quantiteNonCouverte } = affecterVenteAuxRecoltes(
      [recolte('r1', 200)],
      { quantiteKg: 50, montant: 10000, acheteurNom: 'Awa' }
    )
    expect(vendues).toEqual([])
    expect(quantiteNonCouverte).toBe(50)
  })

  it('montant réparti au prorata, somme EXACTE (le reste porté par la dernière)', () => {
    const { vendues } = affecterVenteAuxRecoltes(
      [recolte('r1', 30), recolte('r2', 30), recolte('r3', 40)],
      { quantiteKg: 100, montant: 10000, acheteurNom: 'Awa' }
    )
    expect(vendues.map((v) => v.id)).toEqual(['r1', 'r2', 'r3'])
    const somme = vendues.reduce((s, v) => s + v.montantVente, 0)
    expect(somme).toBe(10000)
    expect(vendues[0].montantVente).toBe(3000)
    expect(vendues[1].montantVente).toBe(3000)
    expect(vendues[2].montantVente).toBe(4000) // 30+30+40 kg → 3000+3000+4000
  })

  it('prorata avec arrondi non trivial : la somme reste exacte', () => {
    const { vendues } = affecterVenteAuxRecoltes(
      [recolte('r1', 1), recolte('r2', 1), recolte('r3', 1)],
      { quantiteKg: 3, montant: 1000, acheteurNom: 'Awa' }
    )
    const somme = vendues.reduce((s, v) => s + v.montantVente, 0)
    expect(somme).toBe(1000)
  })

  it('quantité livrée nulle (commande sans quantité) → rien n’est marqué', () => {
    const { vendues, quantiteNonCouverte } = affecterVenteAuxRecoltes(
      [recolte('r1', 100)],
      { quantiteKg: 0, montant: 5000, acheteurNom: 'Awa' }
    )
    expect(vendues).toEqual([])
    expect(quantiteNonCouverte).toBe(0)
  })

  it('stock vide ou déjà vendu → rien n’est inventé', () => {
    const { vendues } = affecterVenteAuxRecoltes(
      [recolte('r1', 100, 'vendue'), recolte('r2', 100, 'brouillon')],
      { quantiteKg: 100, montant: 5000, acheteurNom: 'Awa' }
    )
    expect(vendues).toEqual([])
  })

  it('aucun montant (0 FCFA) → statuts posés mais aucun montant fabriqué', () => {
    const { vendues } = affecterVenteAuxRecoltes(
      [recolte('r1', 100)],
      { quantiteKg: 100, montant: 0, acheteurNom: 'Awa' }
    )
    expect(vendues).toEqual([{ id: 'r1', montantVente: 0, acheteur: 'Awa' }])
  })
})
