import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type RecolteQualite = 'premium' | 'standard' | 'secondaire'
export type RecolteStatut = 'brouillon' | 'publiee' | 'vendue'

export interface Recolte {
  id: string
  produit: string
  quantiteKg: number
  qualite: RecolteQualite
  dateRecolte: string
  parcelle: string
  prixSouhaiteParKg: number
  photoUrl?: string
  statut: RecolteStatut
  acheteur?: string
  montantVente?: number
  notes?: string
}

export type CommandeStatut = 'a_traiter' | 'en_cours' | 'livree' | 'refusee'

export interface CommandeProducteur {
  id: string
  reference: string
  acheteurNom: string
  produit: string
  quantiteKg: number
  montant: number
  dateLivraisonSouhaitee: string
  statut: CommandeStatut
  urgent: boolean
  transporteur?: string
}

export interface StockProducteur {
  produit: string
  quantiteKg: number
  etat: 'bon' | 'a_surveiller' | 'bas'
  prochaineRecolte?: string
}

export interface CycleCulture {
  id: string
  produit: string
  parcelle: string
  dateSemis: string
  dateRecoltePrevue: string
  joursEcoules: number
  joursTotal: number
  phase: string
}

interface ProducteurState {
  recoltes: Recolte[]
  commandes: CommandeProducteur[]
  stock: StockProducteur[]
  cycleEnCours: CycleCulture | null

  addRecolte: (recolte: Omit<Recolte, 'id' | 'statut'> & { statut?: RecolteStatut }) => string
  publierRecolte: (id: string) => void
  updateRecolte: (id: string, updates: Partial<Recolte>) => void

  repondreCommande: (id: string, accepter: boolean) => void
  confirmerLivraison: (id: string) => void

  getKpis: () => { recolteMoisKg: number; venduFcfa: number; stockDisponibleKg: number; commandesEnAttente: number }
}

export const useProducteurStore = create<ProducteurState>()(
  persist(
    (set, get) => ({
      recoltes: [
        {
          id: 'r1',
          produit: 'Manioc',
          quantiteKg: 500,
          qualite: 'standard',
          dateRecolte: '2026-08-25',
          parcelle: 'Champ Nord',
          prixSouhaiteParKg: 300,
          statut: 'publiee',
        },
        {
          id: 'r2',
          produit: 'Igname',
          quantiteKg: 200,
          qualite: 'premium',
          dateRecolte: '2026-08-22',
          parcelle: 'Champ Sud',
          prixSouhaiteParKg: 800,
          statut: 'brouillon',
        },
        {
          id: 'r3',
          produit: 'Piment',
          quantiteKg: 50,
          qualite: 'standard',
          dateRecolte: '2026-08-20',
          parcelle: 'Champ Nord',
          prixSouhaiteParKg: 500,
          statut: 'vendue',
          acheteur: 'Coopérative Adjamé Nord',
          montantVente: 25000,
        },
      ],
      commandes: [
        {
          id: 'c1',
          reference: 'CMD-2026-0456',
          acheteurNom: 'Coopérative Adjamé Nord',
          produit: 'Manioc',
          quantiteKg: 500,
          montant: 150000,
          dateLivraisonSouhaitee: '2026-08-28',
          statut: 'a_traiter',
          urgent: true,
        },
        {
          id: 'c2',
          reference: 'CMD-2026-0455',
          acheteurNom: 'Maman Awa (Marchande)',
          produit: 'Igname',
          quantiteKg: 50,
          montant: 40000,
          dateLivraisonSouhaitee: '2026-08-30',
          statut: 'a_traiter',
          urgent: false,
        },
        {
          id: 'c3',
          reference: 'CMD-2026-0450',
          acheteurNom: 'Coopérative Bouaké',
          produit: 'Manioc',
          quantiteKg: 1000,
          montant: 280000,
          dateLivraisonSouhaitee: '2026-08-26',
          statut: 'en_cours',
          urgent: false,
          transporteur: 'Jean K.',
        },
      ],
      stock: [
        { produit: 'Manioc', quantiteKg: 1800, etat: 'bon', prochaineRecolte: '2026-09-15' },
        { produit: 'Igname', quantiteKg: 450, etat: 'a_surveiller', prochaineRecolte: '2026-09-20' },
        { produit: 'Piment', quantiteKg: 30, etat: 'bas' },
      ],
      cycleEnCours: {
        id: 'cyc1',
        produit: 'Manioc',
        parcelle: 'Champ Nord',
        dateSemis: '2026-06-01',
        dateRecoltePrevue: '2026-09-15',
        joursEcoules: 90,
        joursTotal: 120,
        phase: 'Grossissement des racines',
      },

      addRecolte: (recolte) => {
        const id = `r-${Date.now()}`
        set((s) => ({
          recoltes: [{ ...recolte, id, statut: recolte.statut ?? 'brouillon' }, ...s.recoltes],
        }))
        return id
      },
      publierRecolte: (id) =>
        set((s) => ({
          recoltes: s.recoltes.map((r) => (r.id === id ? { ...r, statut: 'publiee' } : r)),
        })),
      updateRecolte: (id, updates) =>
        set((s) => ({
          recoltes: s.recoltes.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        })),

      repondreCommande: (id, accepter) =>
        set((s) => ({
          commandes: s.commandes.map((c) =>
            c.id === id ? { ...c, statut: accepter ? 'en_cours' : 'refusee' } : c
          ),
        })),
      confirmerLivraison: (id) =>
        set((s) => ({
          commandes: s.commandes.map((c) => (c.id === id ? { ...c, statut: 'livree' } : c)),
        })),

      getKpis: () => {
        const { recoltes, stock, commandes } = get()
        const currentMonth = new Date().toISOString().slice(0, 7)
        const recolteMoisKg = recoltes
          .filter((r) => r.dateRecolte.startsWith(currentMonth))
          .reduce((sum, r) => sum + r.quantiteKg, 0)
        const venduFcfa = recoltes
          .filter((r) => r.statut === 'vendue')
          .reduce((sum, r) => sum + (r.montantVente ?? 0), 0)
        const stockDisponibleKg = stock.reduce((sum, s) => sum + s.quantiteKg, 0)
        const commandesEnAttente = commandes.filter((c) => c.statut === 'a_traiter').length
        return { recolteMoisKg, venduFcfa, stockDisponibleKg, commandesEnAttente }
      },
    }),
    {
      name: 'julaba-producteur-store',
    }
  )
)

export const PRIX_MARCHE_REFERENCE: Record<string, { prixFcfaKg: number; tendance: 'hausse' | 'baisse' | 'stable' }> = {
  Manioc: { prixFcfaKg: 280, tendance: 'hausse' },
  Igname: { prixFcfaKg: 750, tendance: 'baisse' },
  Piment: { prixFcfaKg: 2500, tendance: 'hausse' },
  Oignon: { prixFcfaKg: 450, tendance: 'stable' },
}
