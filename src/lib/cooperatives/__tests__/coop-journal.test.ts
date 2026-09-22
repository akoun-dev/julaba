import { describe, it, expect } from 'vitest'
import {
  filtrerTransactions, filtrerBesoins, paginer, TAILLE_PAGE, TAILLE_PAGE_MEMBRES,
  categoriesJournal,
  type CritereTresorerie,
} from '../coop-journal'
import type { BesoinCoop, TransactionCoop } from '@/lib/stores/cooperative-store'

/**
 * MODE-976 (AUDIT-007 G13/G14) — logique PURE des journaux coopératifs :
 * filtres du journal de trésorerie (statut × type), filtre de statut des
 * besoins, pagination « charger plus ». Le contrat d'honnêteté : le total
 * réel et le nombre restant sont TOUJOURS visibles (l'écran les affiche),
 * la pagination ne détruit jamais de ligne.
 *
 * MODE-982 (DET-COOP-011) — les filtres PÉRIODE (7 j / 30 j / 3 mois) et
 * CATÉGORIE rejoignent le journal (optionnels — contrat MODE-976 intact),
 * la liste des membres gagne sa page de 20.
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

describe('coop-journal — filtrerTransactions période × catégorie (MODE-982)', () => {
  // Horloge INJECTÉE : le contrat ne dépend jamais de l'heure du test.
  const MAINTENANT = Date.parse('2026-09-23T12:00:00.000Z')
  const jour = (offsetJours: number): string =>
    new Date(MAINTENANT - offsetJours * 86_400_000).toISOString()

  const journal = [
    tx({ id: 'aujourdhui', date: jour(0), categorie: 'cotisation' }),
    tx({ id: 'j6', date: jour(6), categorie: 'vente_groupee' }),
    tx({ id: 'j8', date: jour(8), categorie: 'cotisation' }),
    tx({ id: 'j29', date: jour(29), categorie: 'frais' }),
    tx({ id: 'j31', date: jour(31), categorie: 'cotisation' }),
    tx({ id: 'j89', date: jour(89), categorie: 'commission' }),
    tx({ id: 'j91', date: jour(91), categorie: 'cotisation' }),
  ]

  it("'toutes' (défaut) ne filtre RIEN — contrat MODE-976 inchangé", () => {
    expect(filtrerTransactions(journal, { statut: 'tous', type: 'tous' }, MAINTENANT)).toHaveLength(7)
    expect(filtrerTransactions(journal, { statut: 'tous', type: 'tous', periode: 'toutes', categorie: 'toutes' }, MAINTENANT)).toHaveLength(7)
  })

  it('7 j : bornes inclusives à J-6, exclusive au-delà', () => {
    const ids = filtrerTransactions(journal, { statut: 'tous', type: 'tous', periode: '7j' }, MAINTENANT).map((t) => t.id)
    expect(ids).toEqual(['aujourdhui', 'j6'])
  })

  it('30 j : J-29 dedans, J-31 dehors', () => {
    const ids = filtrerTransactions(journal, { statut: 'tous', type: 'tous', periode: '30j' }, MAINTENANT).map((t) => t.id)
    expect(ids).toEqual(['aujourdhui', 'j6', 'j8', 'j29'])
  })

  it('3 mois = 90 jours : J-89 dedans, J-91 dehors', () => {
    const ids = filtrerTransactions(journal, { statut: 'tous', type: 'tous', periode: '3mois' }, MAINTENANT).map((t) => t.id)
    expect(ids).toEqual(['aujourdhui', 'j6', 'j8', 'j29', 'j31', 'j89'])
  })

  it('catégorie exacte (jamais une sous-chaîne)', () => {
    const ids = filtrerTransactions(journal, { statut: 'tous', type: 'tous', categorie: 'cotisation' }, MAINTENANT).map((t) => t.id)
    expect(ids).toEqual(['aujourdhui', 'j8', 'j31', 'j91'])
  })

  it('catégorie × période se COMBINENT (et avec statut × type)', () => {
    const ids = filtrerTransactions(
      journal,
      { statut: 'validee', type: 'tous', periode: '30j', categorie: 'cotisation' },
      MAINTENANT
    ).map((t) => t.id)
    expect(ids).toEqual(['aujourdhui', 'j8'])
  })

  it('date illisible → sort d\u2019une fenêtre (non situable = non affirmée), reste dans \'toutes\'', () => {
    const avecIllisible = [tx({ id: 'casse', date: 'pas-une-date' }), ...journal]
    expect(filtrerTransactions(avecIllisible, { statut: 'tous', type: 'tous', periode: '7j' }, MAINTENANT).map((t) => t.id))
      .toEqual(['aujourdhui', 'j6'])
    expect(filtrerTransactions(avecIllisible, { statut: 'tous', type: 'tous' }, MAINTENANT)).toHaveLength(8)
  })

  it('aucune écriture dans la fenêtre → tableau vide honnête', () => {
    expect(filtrerTransactions(journal, { statut: 'tous', type: 'tous', periode: '7j' }, MAINTENANT + 400 * 86_400_000)).toEqual([])
  })
})

describe('coop-journal — categoriesJournal (MODE-982)', () => {
  it('distinct + tri alphabétique français, jamais de catégorie vide', () => {
    const liste = [
      tx({ id: 't1', categorie: 'cotisation' }),
      tx({ id: 't2', categorie: 'vente_groupee' }),
      tx({ id: 't3', categorie: 'cotisation' }),
      tx({ id: 't4', categorie: '' }),
    ]
    expect(categoriesJournal(liste)).toEqual(['cotisation', 'vente_groupee'])
  })

  it('journal vide ou tout-null → tableau vide (l\u2019écran cachera la rangée)', () => {
    expect(categoriesJournal([])).toEqual([])
    expect(categoriesJournal([tx({ id: 't1', categorie: '' })])).toEqual([])
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

describe('coop-journal — pagination des MEMBRES, page de 20 (MODE-982)', () => {
  // Réutilise paginer() avec la taille dédiée : la liste des membres
  // (julaba-app §4) pagine par 20, PAS par 15 comme les journaux.
  const membres = Array.from({ length: 47 }, (_, i) => ({ id: `m${i}` }))

  it('TAILLE_PAGE_MEMBRES = 20 (parité julaba-app)', () => {
    expect(TAILLE_PAGE_MEMBRES).toBe(20)
  })

  it('page 1 → 20 visibles, 27 restants annoncés', () => {
    const page = paginer(membres, 1, TAILLE_PAGE_MEMBRES)
    expect(page.visible).toHaveLength(20)
    expect(page.total).toBe(47)
    expect(page.restantes).toBe(27)
  })

  it('pages cumulées : 20 + 20 + 7 = 47, restantes 0', () => {
    const p3 = paginer(membres, 3, TAILLE_PAGE_MEMBRES)
    expect(p3.visible).toHaveLength(47)
    expect(p3.restantes).toBe(0)
  })
})
