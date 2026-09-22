import { describe, it, expect } from 'vitest'
import {
  filtrerTransactions, filtrerBesoins, paginer, TAILLE_PAGE,
  type CritereTresorerie,
} from '../coop-journal'
import type { BesoinCoop, TransactionCoop } from '@/lib/stores/cooperative-store'

/**
 * MODE-976 (AUDIT-007 G13/G14) — logique PURE des journaux coopératifs :
 * filtres du journal de trésorerie (statut × type), filtre de statut des
 * besoins, pagination « charger plus ». Le contrat d'honnêteté : le total
 * réel et le nombre restant sont TOUJOURS visibles (l'écran les affiche),
 * la pagination ne détruit jamais de ligne.
 */

const tx = (partial: Partial<TransactionCoop> & { id: string }): TransactionCoop => ({
  type: 'entree',
  categorie: 'cotisation',
  montant: 1000,
  membreId: null,
  description: 'écriture',
  statut: 'validee',
  date: '2026-09-22T10:00:00.000Z',
  ...partial,
})

const besoin = (partial: Partial<BesoinCoop> & { id: string }): BesoinCoop => ({
  marchandId: 'm1',
  produit: 'Riz',
  categorie: null,
  quantite: 5,
  unite: 'kg',
  prixMax: null,
  priorite: 'normale',
  statut: 'en_attente',
  date: '2026-09-22T10:00:00.000Z',
  ...partial,
})

describe('coop-journal — filtrerTransactions (MODE-976)', () => {
  const journal = [
    tx({ id: 't1', statut: 'en_attente', type: 'entree' }),
    tx({ id: 't2', statut: 'validee', type: 'entree' }),
    tx({ id: 't3', statut: 'validee', type: 'sortie' }),
    tx({ id: 't4', statut: 'annulee', type: 'sortie' }),
  ]

  const cas: Array<[CritereTresorerie, string[]]> = [
    [{ statut: 'tous', type: 'tous' }, ['t1', 't2', 't3', 't4']],
    [{ statut: 'validee', type: 'tous' }, ['t2', 't3']],
    [{ statut: 'en_attente', type: 'tous' }, ['t1']],
    [{ statut: 'annulee', type: 'tous' }, ['t4']],
    [{ statut: 'tous', type: 'entree' }, ['t1', 't2']],
    [{ statut: 'tous', type: 'sortie' }, ['t3', 't4']],
    [{ statut: 'validee', type: 'entree' }, ['t2']],
    [{ statut: 'validee', type: 'sortie' }, ['t3']],
    [{ statut: 'en_attente', type: 'sortie' }, []],
  ]

  for (const [criteres, idsAttendus] of cas) {
    it(`statut=${criteres.statut} × type=${criteres.type} → [${idsAttendus.join(', ')}]`, () => {
      expect(filtrerTransactions(journal, criteres).map((t) => t.id)).toEqual(idsAttendus)
    })
  }

  it('journal vide → tableau vide (jamais de ligne inventée)', () => {
    expect(filtrerTransactions([], { statut: 'tous', type: 'tous' })).toEqual([])
  })
})

describe('coop-journal — filtrerBesoins (MODE-976)', () => {
  const liste = [
    besoin({ id: 'b1', statut: 'en_attente' }),
    besoin({ id: 'b2', statut: 'consolide' }),
    besoin({ id: 'b3', statut: 'en_cours' }),
    besoin({ id: 'b4', statut: 'livre' }),
    besoin({ id: 'b5', statut: 'en_attente' }),
  ]

  it("'tous' renvoie TOUTE la liste (référence inchangée)", () => {
    expect(filtrerBesoins(liste, 'tous')).toBe(liste)
  })

  it('filtre exact par statut (pas de sous-chaîne ni de confusion en_attente/en_cours)', () => {
    expect(filtrerBesoins(liste, 'en_attente').map((b) => b.id)).toEqual(['b1', 'b5'])
    expect(filtrerBesoins(liste, 'consolide').map((b) => b.id)).toEqual(['b2'])
    expect(filtrerBesoins(liste, 'en_cours').map((b) => b.id)).toEqual(['b3'])
    expect(filtrerBesoins(liste, 'livre').map((b) => b.id)).toEqual(['b4'])
  })

  it('statut sans correspondance → vide, sans erreur', () => {
    expect(filtrerBesoins(liste, 'livre' as const).length).toBe(1)
    expect(filtrerBesoins([], 'en_attente')).toEqual([])
  })
})

describe('coop-journal — paginer (MODE-976, « charger plus »)', () => {
  const lignes = Array.from({ length: 38 }, (_, i) => tx({ id: `t${i}` }))

  it('page 1 → TAILLE_PAGE visibles, le reste annoncé honnêtement', () => {
    const page = paginer(lignes, 1)
    expect(page.visible).toHaveLength(TAILLE_PAGE)
    expect(page.total).toBe(38)
    expect(page.restantes).toBe(38 - TAILLE_PAGE)
  })

  it('pages cumulées : page 3 → 45 demandés, 38 réels, restantes 0', () => {
    const page = paginer(lignes, 3)
    expect(page.visible).toHaveLength(38)
    expect(page.restantes).toBe(0)
  })

  it('pagination CUMULATIVE : la page 2 inclut la page 1 (comportement « charger plus »)', () => {
    const p1 = paginer(lignes, 1)
    const p2 = paginer(lignes, 2)
    // p2.visible = slice(0, 30) CONTIENT les 15 premières de p1.visible.
    expect(p2.visible).toHaveLength(2 * TAILLE_PAGE)
    expect(p1.visible.every((t) => p2.visible.includes(t))).toBe(true)
    expect(p2.restantes).toBe(38 - 2 * TAILLE_PAGE)
  })

  it('page 0 ou négative → traitée comme page 1 (pas de tableau vide surprenant)', () => {
    expect(paginer(lignes, 0).visible).toHaveLength(TAILLE_PAGE)
    expect(paginer(lignes, -2).visible).toHaveLength(TAILLE_PAGE)
  })

  it('liste courte → tout visible, restantes 0', () => {
    const courtes = lignes.slice(0, 7)
    const page = paginer(courtes, 1)
    expect(page.visible).toHaveLength(7)
    expect(page.restantes).toBe(0)
  })

  it('liste vide → visible vide, total 0', () => {
    const page = paginer<TransactionCoop>([], 1)
    expect(page.visible).toEqual([])
    expect(page.total).toBe(0)
    expect(page.restantes).toBe(0)
  })
})
