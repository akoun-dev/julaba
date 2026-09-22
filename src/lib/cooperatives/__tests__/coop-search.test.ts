import { describe, it, expect } from 'vitest'

// Modules PURS de la Phase 5 (MODE-977, AUDIT-007 G4/G9) :
//  • construireIndexRecherche — l'index de la palette transversale (cmdk
//    filtre sur value ; ce module fournit les items, plafonnés par source) ;
//  • messageDecisionCoop — la grammaire de feedback des décisions offline
//    (contrat synced | queued | lost, aucune dépendance DOM).
import {
  construireIndexRecherche,
  PLAFOND_PAR_SOURCE,
  COOP_SEARCH_GROUPES,
} from '@/lib/cooperatives/coop-search'
import { messageDecisionCoop } from '@/components/cooperative/coop-ui'

const routes = [
  { id: 'coop-home', label: 'Accueil', icon: 'LayoutDashboard', description: 'Vue d\u2019ensemble' },
  { id: 'coop-membres', label: 'Membres', icon: 'Users', description: 'Adhésions' },
]
const membre = { id: 'adh-1', prenom: 'Aliou', nom: 'Diallo', statut: 'actif', role: 'membre' }

describe('coop-search — construireIndexRecherche (MODE-977, G4)', () => {
  it('construit les 4 groupes dans l\u2019ordre canonique, même vide (jamais undefined)', () => {
    const index = construireIndexRecherche({ routes: [], membres: [], stock: [], besoins: [] })
    expect(Object.keys(index)).toEqual(COOP_SEARCH_GROUPES)
    expect(index.navigation).toEqual([])
    expect(index.membres).toEqual([])
    expect(index.stock).toEqual([])
    expect(index.besoins).toEqual([])
  })

  it('navigation : chaque route produit un item navigate avec ses keywords', () => {
    const index = construireIndexRecherche({ routes, membres: [], stock: [], besoins: [] })
    expect(index.navigation).toHaveLength(2)
    expect(index.navigation[0].label).toBe('Accueil')
    expect(index.navigation[0].action).toEqual({ type: 'navigate', route: 'coop-home' })
    expect(index.navigation[1].keywords).toContain('Membres')
    expect(index.navigation[1].keywords).toContain('Adhésions')
  })

  it('membres : le nom complet concatène prénom+nom, l\u2019action ouvre la FICHE (G3)', () => {
    const index = construireIndexRecherche({ routes: [], membres: [membre], stock: [], besoins: [] })
    expect(index.membres).toHaveLength(1)
    expect(index.membres[0].label).toBe('Aliou Diallo')
    expect(index.membres[0].action).toEqual({ type: 'fiche-membre', membreId: 'adh-1' })
    expect(index.membres[0].keywords).toContain('membre')
    expect(index.membres[0].description).toContain('Membre')
  })

  it('membres : un chef de groupe est étiqueté comme tel ; un membre sans nom reste affichable', () => {
    const chef = { ...membre, role: 'president', prenom: null, nom: null }
    const index = construireIndexRecherche({ routes: [], membres: [chef], stock: [], besoins: [] })
    expect(index.membres[0].description).toContain('Chef de groupe')
    expect(index.membres[0].label).toBe('Membre')
  })

  it('stock et besoins pointent vers leurs écrans (coop-stock / coop-besoins)', () => {
    const index = construireIndexRecherche({
      routes: [],
      membres: [],
      stock: [{ id: 's1', produit: 'Riz', quantite: 12, unite: 'kg' }],
      besoins: [{ id: 'b1', produit: 'Huile', quantite: 5, unite: 'L', statut: 'en_attente' }],
    })
    expect(index.stock[0].action).toEqual({ type: 'navigate', route: 'coop-stock' })
    expect(index.stock[0].description).toBe('12 kg au pot commun')
    expect(index.besoins[0].action).toEqual({ type: 'navigate', route: 'coop-besoins' })
    expect(index.besoins[0].description).toContain('en attente')
  })

  it('plafond par source : au-delà de PLAFOND_PAR_SOURCE, les items excédentaires sont coupés (budget mobile)', () => {
    const beaucoup = Array.from({ length: PLAFOND_PAR_SOURCE + 25 }, (_, i) => ({
      id: `adh-${i}`,
      prenom: `M-${i}`,
      nom: null,
      statut: 'actif',
      role: 'membre',
    }))
    const index = construireIndexRecherche({ routes: [], membres: beaucoup, stock: [], besoins: [] })
    expect(index.membres).toHaveLength(PLAFOND_PAR_SOURCE)
    expect(beaucoup.length).toBe(PLAFOND_PAR_SOURCE + 25)
  })
})

describe('coop-ui — messageDecisionCoop (MODE-977, G9)', () => {
  it('synced : le message de succès normal', () => {
    expect(messageDecisionCoop('synced', 'Membre suspendu.')).toBe('Membre suspendu.')
  })

  it('queued : déclinaison honnête par défaut (mise en file, reconnexion)', () => {
    const message = messageDecisionCoop('queued', 'Membre suspendu.')
    expect(message).toContain('Membre suspendu')
    expect(message).toContain('file')
    expect(message).toContain('reconnexion')
  })

  it('queued : la déclinaison explicite prime (vocabulaire par écran)', () => {
    expect(
      messageDecisionCoop('queued', 'Écriture validée.', { queued: 'Hors ligne : décision appliquée localement.' }),
    ).toBe('Hors ligne : décision appliquée localement.')
  })

  it('lost : déclinaison honnête (ni envoyée ni mise en file)', () => {
    const message = messageDecisionCoop('lost', 'Demande refusée.')
    expect(message).toContain('ni envoyée')
    expect(message).toContain('Réessayez')
  })
})
