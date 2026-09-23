import { describe, expect, it } from 'vitest'
import { bilanEnrolement, type Dossier } from '@/lib/stores/identificateur-store'

// IDF-RAP-001 (AUDIT_MATRICE_47_CAS I-03) — bilanEnrolement est la fonction
// PURE qui alimente l'écran « Statistiques » (100 % local, offline-first) :
//   - cohorte du MOIS COURANT = soumis hors brouillons (submittedAt ?? createdAt)
//     bornée [1er du mois, 1er du mois suivant) ;
//   - taux d'acceptation arrondi à l'entier, 0 sans verdict ;
//   - parStatut / parType toutes périodes ; dernierSoumis hors brouillons.

// Base temporelle fixe : mois = septembre 2026.
const maintenant = new Date(2026, 8, 20, 10, 0, 0)
const t = (j: number, h = 12): number => new Date(2026, 8, j, h).getTime()

function makeDossier(o: Partial<Dossier> & { id: string }): Dossier {
  return {
    actorType: o.actorType ?? 'marchand',
    firstName: o.firstName ?? 'Aya',
    lastName: o.lastName ?? 'Koné',
    phone: o.phone ?? '07 00 00 00 01',
    activite: o.activite ?? 'Vente de maïs',
    zone: o.zone ?? 'Adjamé',
    status: o.status ?? 'valide',
    createdAt: o.createdAt ?? t(1),
    updatedAt: o.updatedAt ?? o.createdAt ?? t(1),
    submittedAt: o.submittedAt,
    agentId: o.agentId ?? 'ident-1',
    agentName: o.agentName ?? 'Kouassi A.',
    dossierNumber: o.dossierNumber ?? 'ID-2026-0001',
    ...o,
  }
}

describe('bilanEnrolement', () => {
  it('aucun dossier → tous les compteurs à zéro, taux 0, dernierSoumis null', () => {
    const bilan = bilanEnrolement([], maintenant)
    expect(bilan.soumisMois).toBe(0)
    expect(bilan.validesMois).toBe(0)
    expect(bilan.rejetesMois).toBe(0)
    expect(bilan.enAttenteMois).toBe(0)
    expect(bilan.tauxAcceptation).toBe(0)
    expect(bilan.parStatut).toEqual({ brouillon: 0, en_attente: 0, valide: 0, rejete: 0 })
    expect(bilan.parType).toEqual({ marchand: 0, producteur: 0, cooperative: 0 })
    expect(bilan.dernierSoumis).toBeNull()
  })

  it('compte la cohorte du mois courant (submittedAt) et exclut les brouillons', () => {
    const dossiers = [
      makeDossier({ id: 'd1', status: 'brouillon', submittedAt: t(5) }),
      makeDossier({ id: 'd2', status: 'valide', submittedAt: t(3) }),
      makeDossier({ id: 'd3', status: 'rejete', submittedAt: t(8) }),
    ]
    const bilan = bilanEnrolement(dossiers, maintenant)
    expect(bilan.soumisMois).toBe(2)
    expect(bilan.validesMois).toBe(1)
    expect(bilan.rejetesMois).toBe(1)
    expect(bilan.enAttenteMois).toBe(0)
    // Le brouillon n'est PAS compté dans la cohorte du mois, mais bien dans
    // parStatut (toutes périodes) et parType.
    expect(bilan.parStatut.brouillon).toBe(1)
    expect(bilan.parType.marchand).toBe(3)
  })

  it('bornes du mois : exclut le mois précédent, inclut le 1er du mois à 00:00', () => {
    const dossiers = [
      makeDossier({ id: 'mois-prev', status: 'valide', submittedAt: new Date(2026, 7, 31, 23, 59, 59).getTime() }),
      makeDossier({ id: 'premier-du-mois', status: 'valide', submittedAt: new Date(2026, 8, 1, 0, 0, 0).getTime() }),
      makeDossier({ id: 'fin-mois', status: 'valide', submittedAt: new Date(2026, 8, 30, 23, 59, 59).getTime() }),
    ]
    const bilan = bilanEnrolement(dossiers, maintenant)
    expect(bilan.soumisMois).toBe(2)
    expect(bilan.validesMois).toBe(2)
  })

  it('repli sur createdAt quand submittedAt absent (ancien brouillon soumis)', () => {
    const dossiers = [
      makeDossier({ id: 'd-sans-soumission', status: 'en_attente', submittedAt: undefined, createdAt: t(4) }),
      makeDossier({ id: 'd-hors-mois', status: 'en_attente', submittedAt: undefined, createdAt: new Date(2026, 4, 4).getTime() }),
    ]
    const bilan = bilanEnrolement(dossiers, maintenant)
    expect(bilan.soumisMois).toBe(1)
    expect(bilan.enAttenteMois).toBe(1)
  })

  it("taux d'acceptation : valides / verdicts arrondi, 0 quand aucun verdict", () => {
    const verdicts = [
      makeDossier({ id: 'v1', status: 'valide', submittedAt: t(1) }),
      makeDossier({ id: 'v2', status: 'valide', submittedAt: t(2) }),
      makeDossier({ id: 'r1', status: 'rejete', submittedAt: t(3) }),
    ]
    expect(bilanEnrolement(verdicts, maintenant).tauxAcceptation).toBe(67)

    const sansVerdict = [
      makeDossier({ id: 'a1', status: 'en_attente', submittedAt: t(1) }),
      makeDossier({ id: 'b1', status: 'brouillon' }),
    ]
    expect(bilanEnrolement(sansVerdict, maintenant).tauxAcceptation).toBe(0)
  })

  it('parType répartit tous les dossiers, toutes périodes', () => {
    const dossiers = [
      makeDossier({ id: 'm1', actorType: 'marchand' }),
      makeDossier({ id: 'p1', actorType: 'producteur' }),
      makeDossier({ id: 'p2', actorType: 'producteur', status: 'brouillon' }),
      makeDossier({ id: 'c1', actorType: 'cooperative' }),
    ]
    expect(bilanEnrolement(dossiers, maintenant).parType).toEqual({
      marchand: 1,
      producteur: 2,
      cooperative: 1,
    })
  })

  it('dernierSoumis : le plus récent hors brouillons', () => {
    const dossiers = [
      makeDossier({ id: 'ancien', firstName: 'Yao', lastName: 'N', status: 'valide', submittedAt: t(2) }),
      makeDossier({ id: 'brouillon-nul', firstName: 'Zoe', lastName: 'B', status: 'brouillon', submittedAt: t(9) }),
      makeDossier({ id: 'recent', firstName: 'Awa', lastName: 'C', status: 'en_attente', submittedAt: t(7) }),
    ]
    const bilan = bilanEnrolement(dossiers, maintenant)
    expect(bilan.dernierSoumis?.id).toBe('recent')
    expect(bilan.dernierSoumis?.firstName).toBe('Awa')
  })

  it('aucun dossier soumis → dernierSoumis null même avec des brouillons', () => {
    const bilan = bilanEnrolement([makeDossier({ id: 'b1', status: 'brouillon' })], maintenant)
    expect(bilan.dernierSoumis).toBeNull()
  })
})