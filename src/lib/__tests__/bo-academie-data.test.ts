import { describe, expect, it } from 'vitest'
import {
  computeGlobalStats,
  groupContentsByModule,
  mapContentItem,
  matchesActor,
  MODULES_BY_ROLE,
  type ContentItem,
} from '../bo-academie-data'

const item = (over: Partial<ContentItem>): ContentItem => ({
  id: 'x',
  title: 'T',
  category: 'Ventes',
  status: 'publie',
  views: 0,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  author: 'A',
  tab: 'tutoriels',
  sortOrder: 0,
  ...over,
})

describe('mapContentItem', () => {
  it('entrée complète mappée champ à champ', () => {
    const m = mapContentItem({
      id: 'c1', title: 'Vendre', category: 'Ventes', status: 'publie',
      viewCount: 42, createdAt: '2026-01-02', updatedAt: '2026-01-03',
      author: 'BO', type: 'faq', excerpt: 'Résumé', content: 'Corps',
      difficulty: 'avance', duration: '10 min', targetRole: 'marchand',
      mediaUrl: 'https://x.y', sortOrder: 7,
    })
    expect(m).toEqual({
      id: 'c1', title: 'Vendre', category: 'Ventes', status: 'publie',
      views: 42, createdAt: '2026-01-02', updatedAt: '2026-01-03',
      author: 'BO', tab: 'faq', excerpt: 'Résumé', content: 'Corps',
      difficulty: 'avance', duration: '10 min', targetRole: 'marchand',
      mediaUrl: 'https://x.y', sortOrder: 7,
    })
  })

  it('défauts historiques sur entrée minimale', () => {
    const m = mapContentItem({ id: 'c2', title: 'T', createdAt: 'd', updatedAt: 'd' })
    expect(m.category).toBe('')
    expect(m.status).toBe('brouillon')
    expect(m.views).toBe(0)
    expect(m.tab).toBe('articles')
    expect(m.difficulty).toBe('debutant')
    expect(m.excerpt).toBe('')
    expect(m.content).toBe('')
    expect(m.author).toBe('')
    expect(m.targetRole).toBe('')
    expect(m.mediaUrl).toBe('')
    expect(m.sortOrder).toBe(0)
  })

  it('views lit viewCount (nom serveur), jamais views', () => {
    expect(mapContentItem({ viewCount: 5 }).views).toBe(5)
    expect(mapContentItem({ views: 5 }).views).toBe(0)
  })

  it('tab lit type (nom serveur)', () => {
    expect(mapContentItem({ type: 'tutoriels' }).tab).toBe('tutoriels')
    expect(mapContentItem({ tab: 'faq' }).tab).toBe('articles')
  })
})

describe('matchesActor', () => {
  it('tous → tout passe', () => {
    expect(matchesActor(item({ targetRole: 'marchand' }), 'tous')).toBe(true)
  })

  it('rôle exact → passe', () => {
    expect(matchesActor(item({ targetRole: 'marchand' }), 'marchand')).toBe(true)
  })

  it('autre rôle → refuse', () => {
    expect(matchesActor(item({ targetRole: 'marchand' }), 'producteur')).toBe(false)
  })

  it('contenu général (targetRole vide/undefined) → passe sous chaque acteur', () => {
    expect(matchesActor(item({ targetRole: '' }), 'marchand')).toBe(true)
    expect(matchesActor(item({ targetRole: undefined }), 'cooperative')).toBe(true)
  })
})

describe('groupContentsByModule', () => {
  it('modules attendus de l\'acteur d\'abord dans l\'ordre MODULES_BY_ROLE', () => {
    const items = [
      item({ id: '1', category: 'Stock' }),
      item({ id: '2', category: 'Onboarding' }),
      item({ id: '3', category: 'Ventes' }),
    ]
    const groups = groupContentsByModule(items, 'marchand')
    expect(groups.map(([k]) => k)).toEqual(['Onboarding', 'Ventes', 'Stock'])
    expect(groups[0][1].map((i) => i.id)).toEqual(['2'])
  })

  it('catégorie hors liste après les attendues, ordre alphabétique fr', () => {
    const items = [
      item({ id: '1', category: 'Zèbre' }),
      item({ id: '2', category: 'Ventes' }),
      item({ id: '3', category: 'Abeille' }),
    ]
    const groups = groupContentsByModule(items, 'marchand')
    expect(groups.map(([k]) => k)).toEqual(['Ventes', 'Abeille', 'Zèbre'])
  })

  it('sans module en tout dernier', () => {
    const items = [
      item({ id: '1', category: '' }),
      item({ id: '2', category: 'Ventes' }),
    ]
    const groups = groupContentsByModule(items, 'marchand')
    expect(groups.map(([k]) => k)).toEqual(['Ventes', 'Sans module'])
  })

  it('acteur inconnu retombe sur MODULES_BY_ROLE.tous', () => {
    const items = [item({ id: '1', category: 'Général' })]
    const groups = groupContentsByModule(items, 'inconnu')
    expect(groups.map(([k]) => k)).toEqual(['Général'])
    expect(MODULES_BY_ROLE.tous[0]).toBe('Général')
  })

  it('les items d\'un même module sont regroupés', () => {
    const items = [
      item({ id: '1', category: 'Ventes' }),
      item({ id: '2', category: 'Ventes' }),
    ]
    const groups = groupContentsByModule(items, 'marchand')
    expect(groups).toHaveLength(1)
    expect(groups[0][1].map((i) => i.id)).toEqual(['1', '2'])
  })
})

describe('computeGlobalStats', () => {
  it('compte total, publiés, vues cumulées, tutoriels', () => {
    const contents = [
      item({ id: '1', status: 'publie', views: 10, tab: 'tutoriels' }),
      item({ id: '2', status: 'brouillon', views: 5, tab: 'tutoriels' }),
      item({ id: '3', status: 'publie', views: 1, tab: 'articles' }),
      item({ id: '4', status: 'archive', views: 0, tab: 'faq' }),
    ]
    expect(computeGlobalStats(contents)).toEqual({
      total: 4,
      published: 2,
      totalViews: 16,
      tutorials: 2,
    })
  })

  it('liste vide → zéros', () => {
    expect(computeGlobalStats([])).toEqual({ total: 0, published: 0, totalViews: 0, tutorials: 0 })
  })
})
