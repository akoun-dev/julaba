import { describe, it, expect } from 'vitest'
import {
  ITEMS_PER_PAGE,
  extractZones,
  filterActors,
  computeActorCounts,
  computeTotalPages,
  paginateActors,
  buildActorsCsv,
} from '@/lib/backoffice/acteurs-logic'
import { ACTOR_TYPE_LABELS, STATUS_LABELS } from '@/lib/backoffice/bo-sidebar'
import type { BoActor } from '@/lib/backoffice/bo-models'

function acteur(p: Partial<BoActor> & { id: string }): BoActor {
  return {
    actorId: 'ACT-0001',
    firstName: 'Jean',
    lastName: 'Kouassi',
    type: 'marchand',
    phone: '0708091011',
    zone: 'Adjamé',
    status: 'actif',
    createdAt: '2026-01-15T10:30:00.000Z',
    ...p,
  } as BoActor
}

describe('acteurs-logic — ITEMS_PER_PAGE', () => {
  it('fige la taille de page historique à 15', () => {
    expect(ITEMS_PER_PAGE).toBe(15)
  })
})

describe('acteurs-logic — extractZones', () => {
  it('retourne un tableau vide sans acteur', () => {
    expect(extractZones([])).toEqual([])
  })

  it('dédoublonne et trie alphabétiquement (comportement verbatim Set + sort)', () => {
    const acteurs = [
      acteur({ id: '1', zone: 'Cocody' }),
      acteur({ id: '2', zone: 'Adjamé' }),
      acteur({ id: '3', zone: 'Cocody' }),
      acteur({ id: '4', zone: 'Yopougon' }),
    ]
    expect(extractZones(acteurs)).toEqual(['Adjamé', 'Cocody', 'Yopougon'])
  })

  it('conserve les accents tels quels (tri lexicographique JS, pas localeCompare)', () => {
    // quirk verbatim : sort() nu — 'Ébindi' vient APRÈS 'Yopougon' (code units)
    const acteurs = [acteur({ id: '1', zone: 'Yopougon' }), acteur({ id: '2', zone: 'Ébindi' })]
    expect(extractZones(acteurs)).toEqual(['Yopougon', 'Ébindi'])
  })
})

describe('acteurs-logic — filterActors', () => {
  const acteurs = [
    acteur({ id: '1', actorId: 'ACT-0001', firstName: 'Awa', lastName: 'Traoré', type: 'marchand', status: 'actif', zone: 'Adjamé', phone: '0708091011' }),
    acteur({ id: '2', actorId: 'ACT-0002', firstName: 'Koffi', lastName: 'Mensah', type: 'producteur', status: 'suspendu', zone: 'Cocody', phone: '0605040302' }),
    acteur({ id: '3', actorId: 'ACT-0003', firstName: 'Fatou', lastName: 'Diallo', type: 'cooperatif', status: 'en_attente', zone: 'Adjamé', phone: '0102030405' }),
  ]

  it('filtres « tous » + recherche vide : tout passe', () => {
    expect(filterActors(acteurs, { searchQuery: '', typeFilter: 'tous', statusFilter: 'tous', zoneFilter: 'tous' })).toHaveLength(3)
  })

  it('recherche insensible à la casse sur prénom, nom, ID acteur et zone', () => {
    const f = (q: string) => filterActors(acteurs, { searchQuery: q, typeFilter: 'tous', statusFilter: 'tous', zoneFilter: 'tous' })
    expect(f('awa')).toHaveLength(1)
    expect(f('TRAORÉ'.toLowerCase())).toHaveLength(1)
    expect(f('act-0002')).toHaveLength(1)
    expect(f('cocody')).toHaveLength(1)
    expect(f('inexistant')).toEqual([])
  })

  it('quirk historique : la recherche sur le téléphone n\'est PAS lowercasée', () => {
    const cible = acteur({ id: '9', firstName: 'Abdou', lastName: 'Sow', phone: 'AB-12' })
    const tous = [cible]
    // le prénom matche en lowercasé…
    expect(filterActors(tous, { searchQuery: 'abdou', typeFilter: 'tous', statusFilter: 'tous', zoneFilter: 'tous' })).toHaveLength(1)
    // …mais « AB-12 » (lowercasé en « ab-12 ») ne matche JAMAIS le phone « AB-12 »
    expect(filterActors(tous, { searchQuery: 'AB-12', typeFilter: 'tous', statusFilter: 'tous', zoneFilter: 'tous' })).toEqual([])
    // un phone en minuscules, lui, reste trouvable
    expect(filterActors([{ ...cible, phone: 'ab-12' }], { searchQuery: 'AB-12', typeFilter: 'tous', statusFilter: 'tous', zoneFilter: 'tous' })).toHaveLength(1)
  })

  it('typeFilter ne garde que le type demandé ; « tous » bypass', () => {
    const f = (t: 'tous' | 'marchand' | 'producteur' | 'cooperatif') =>
      filterActors(acteurs, { searchQuery: '', typeFilter: t, statusFilter: 'tous', zoneFilter: 'tous' })
    expect(f('marchand').map((a) => a.id)).toEqual(['1'])
    expect(f('producteur').map((a) => a.id)).toEqual(['2'])
    expect(f('cooperatif').map((a) => a.id)).toEqual(['3'])
    expect(f('tous')).toHaveLength(3)
  })

  it('statusFilter ne garde que le statut demandé ; « tous » bypass', () => {
    const f = (s: 'tous' | 'actif' | 'suspendu' | 'en_attente' | 'rejete') =>
      filterActors(acteurs, { searchQuery: '', typeFilter: 'tous', statusFilter: s, zoneFilter: 'tous' })
    expect(f('actif').map((a) => a.id)).toEqual(['1'])
    expect(f('suspendu').map((a) => a.id)).toEqual(['2'])
    expect(f('en_attente').map((a) => a.id)).toEqual(['3'])
    expect(f('rejete')).toEqual([])
  })

  it('zoneFilter est exact (pas de sous-chaîne) ; « tous » bypass', () => {
    const f = (z: string) => filterActors(acteurs, { searchQuery: '', typeFilter: 'tous', statusFilter: 'tous', zoneFilter: z })
    expect(f('Adjamé').map((a) => a.id)).toEqual(['1', '3'])
    expect(f('djam')).toEqual([])
  })

  it('les critères se combinent en ET (recherche ∧ type ∧ statut ∧ zone)', () => {
    const r = filterActors(acteurs, { searchQuery: 'a', typeFilter: 'marchand', statusFilter: 'actif', zoneFilter: 'Adjamé' })
    expect(r.map((a) => a.id)).toEqual(['1'])
    const aucun = filterActors(acteurs, { searchQuery: '', typeFilter: 'marchand', statusFilter: 'suspendu', zoneFilter: 'Adjamé' })
    expect(aucun).toEqual([])
  })
})

describe('acteurs-logic — computeActorCounts', () => {
  it('compte les 3 types ; les types inconnus comptent dans total seul', () => {
    const acteurs = [
      acteur({ id: '1', type: 'marchand' }),
      acteur({ id: '2', type: 'marchand' }),
      acteur({ id: '3', type: 'producteur' }),
      acteur({ id: '4', type: 'cooperatif' }),
      acteur({ id: '5', type: 'fournisseur' as BoActor['type'] }),
    ]
    expect(computeActorCounts(acteurs)).toEqual({ total: 5, marchands: 2, producteurs: 1, cooperatives: 1 })
  })

  it('sans acteur : tout à zéro', () => {
    expect(computeActorCounts([])).toEqual({ total: 0, marchands: 0, producteurs: 0, cooperatives: 0 })
  })
})

describe('acteurs-logic — computeTotalPages', () => {
  it('au moins une page, même sans résultat (Math.max(1, …) verbatim)', () => {
    expect(computeTotalPages(0)).toBe(1)
  })

  it('bornes exactes : 15 -> 1 page, 16 -> 2, 31 -> 3', () => {
    expect(computeTotalPages(1)).toBe(1)
    expect(computeTotalPages(15)).toBe(1)
    expect(computeTotalPages(16)).toBe(2)
    expect(computeTotalPages(31)).toBe(3)
  })
})

describe('acteurs-logic — paginateActors', () => {
  const acteurs = Array.from({ length: 18 }, (_, i) => acteur({ id: String(i + 1) }))

  it('page 1 : les 15 premiers', () => {
    expect(paginateActors(acteurs, 1)).toHaveLength(15)
    expect(paginateActors(acteurs, 1)[0].id).toBe('1')
  })

  it('page 2 : le reste (3 acteurs)', () => {
    const page2 = paginateActors(acteurs, 2)
    expect(page2).toHaveLength(3)
    expect(page2[0].id).toBe('16')
  })

  it('page au-delà de la fin : tableau vide (comportement slice verbatim)', () => {
    expect(paginateActors(acteurs, 99)).toEqual([])
  })
})

describe('acteurs-logic — buildActorsCsv', () => {
  it('en-têtes littéraux historiques (11 colonnes, séparateur « ; »)', () => {
    const csv = buildActorsCsv([])
    expect(csv).toBe(
      'ID Acteur;Prénom;Nom;Type;Téléphone;Zone;Statut;Identificateur;Validé par;Date validation;Date création'
    )
  })

  it('ligne complète : labels acteur/statut réels + dates fr-FR', () => {
    const a = acteur({
      id: 'u1',
      actorId: 'ACT-0042',
      firstName: 'Awa',
      lastName: 'Traoré',
      type: 'marchand',
      phone: '0708091011',
      zone: 'Adjamé',
      status: 'actif',
      identificateurName: 'Ida Ndiaye',
      validatedBy: 'BO-1',
      validatedAt: '2026-02-01T09:00:00.000Z',
      createdAt: '2026-01-15T10:30:00.000Z',
    })
    const lignes = buildActorsCsv([a]).split('\n')
    expect(lignes).toHaveLength(2)
    expect(lignes[1]).toBe(
      `ACT-0042;Awa;Traoré;${ACTOR_TYPE_LABELS['marchand']};0708091011;Adjamé;${STATUS_LABELS['actif']};` +
      `Ida Ndiaye;BO-1;${new Date('2026-02-01T09:00:00.000Z').toLocaleDateString('fr-FR')};` +
      `${new Date('2026-01-15T10:30:00.000Z').toLocaleDateString('fr-FR')}`
    )
    expect(ACTOR_TYPE_LABELS['marchand']).toBe('Marchand(e)')
    expect(STATUS_LABELS['actif']).toBe('Actif')
  })

  it('champs optionnels absents : chaînes vides ; validatedAt absent : colonne vide', () => {
    const a = acteur({ id: 'u2' })
    const lignes = buildActorsCsv([a]).split('\n')
    expect(lignes[1].split(';')).toEqual([
      'ACT-0001',
      'Jean',
      'Kouassi',
      'Marchand(e)',
      '0708091011',
      'Adjamé',
      'Actif',
      '',
      '',
      '',
      new Date('2026-01-15T10:30:00.000Z').toLocaleDateString('fr-FR'),
    ])
  })

  it('plusieurs acteurs : une ligne par acteur, ordre conservé', () => {
    const csv = buildActorsCsv([acteur({ id: '1' }), acteur({ id: '2', actorId: 'ACT-0002' })])
    expect(csv.split('\n')).toHaveLength(3)
    expect(csv.split('\n')[2].startsWith('ACT-0002;')).toBe(true)
  })
})
