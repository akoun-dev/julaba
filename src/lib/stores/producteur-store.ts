import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { queuePendingSync } from '@/lib/offline-db'
import { useAppStore } from '@/lib/stores/app-store'

function getProducteurId(): string {
  return useAppStore.getState().merchantId || 'producteur-1'
}

/**
 * Tries the real write first so an online producteur's data reaches the
 * server right away instead of waiting for the next network-transition
 * flush; only queues for later if that attempt fails (offline, flaky
 * network, server error). Mirrors the pattern already used for marchand
 * (caisse-screen.tsx) and identificateur (identificateur-sync.ts) — same
 * request the fetch attempted is what a later flush replays, so both paths
 * always agree on shape.
 *
 * 'lost' means neither the live request nor the local offline queue
 * actually persisted the write anywhere — callers must not treat this the
 * same as 'queued' (see queuePendingSync's QueueResult).
 */
async function syncOrQueue(
  entity: string,
  url: string,
  method: 'POST' | 'PATCH',
  payload: Record<string, unknown>
): Promise<'synced' | 'queued' | 'lost'> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Erreur ${res.status}`)
    return 'synced'
  } catch {
    const queued = await queuePendingSync(entity, payload)
    return queued.ok ? 'queued' : 'lost'
  }
}

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
  photos: string[]
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

export interface JournalEntry {
  id: string
  date: string
  texte: string
  photoUrl?: string
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
  journal: JournalEntry[]
}

export interface CycleTermine {
  id: string
  produit: string
  periode: string
  quantiteRecolteeKg: number
}

export interface Reputation {
  note: number
  avisCount: number
  qualite: number
  ponctualite: number
  communication: number
  badge: string
  classement: string
}

interface ProducteurState {
  recoltes: Recolte[]
  commandes: CommandeProducteur[]
  stock: StockProducteur[]
  cycleEnCours: CycleCulture | null
  cyclesTermines: CycleTermine[]
  reputation: Reputation
  // Set when a write above was neither confirmed by the server nor safely
  // queued for later — the local optimistic update above still stands, but
  // this tells the UI it may not actually be recorded, per the audit
  // finding this fixes (a lost write used to be indistinguishable from a
  // queued one everywhere in this store).
  syncError: string | null
  clearSyncError: () => void

  addRecolte: (recolte: Omit<Recolte, 'id' | 'statut'> & { statut?: RecolteStatut }) => string
  publierRecolte: (id: string) => void
  updateRecolte: (id: string, updates: Partial<Recolte>) => void

  repondreCommande: (id: string, accepter: boolean) => void
  confirmerLivraison: (id: string) => void

  addJournalEntry: (texte: string, photoUrl?: string) => void

  loadFromServer: () => Promise<void>

  getKpis: () => { recolteMoisKg: number; venduFcfa: number; stockDisponibleKg: number; commandesEnAttente: number }
}

export const useProducteurStore = create<ProducteurState>()(
  persist(
    (set, get) => {
      // Every write below is fire-and-forget (the local optimistic update
      // already happened synchronously) — this is the one place that turns
      // a genuinely lost write ('lost': neither synced nor queued) into
      // something the UI can see, instead of it vanishing silently.
      const reportIfLost = (pending: Promise<'synced' | 'queued' | 'lost'>) => {
        pending.then((result) => {
          if (result === 'lost') set({ syncError: "Une modification n'a pas pu être enregistrée. Vérifiez votre connexion." })
        })
      }
      return {
      recoltes: [
        {
          id: 'r1',
          produit: 'Manioc',
          quantiteKg: 500,
          qualite: 'standard',
          dateRecolte: '2026-08-25',
          parcelle: 'Champ Nord',
          prixSouhaiteParKg: 300,
          photos: [],
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
          photos: [],
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
          photos: [],
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
        journal: [
          { id: 'j1', date: '2026-06-01', texte: 'Semis manioc (variété Bocou)' },
          { id: 'j2', date: '2026-06-15', texte: 'Premier sarclage' },
          { id: 'j3', date: '2026-07-10', texte: 'Traitement insecticide' },
          { id: 'j4', date: '2026-08-20', texte: 'Deuxième sarclage' },
        ],
      },
      cyclesTermines: [
        { id: 'ct1', produit: 'Igname', periode: 'Janv - Mai 2026', quantiteRecolteeKg: 2500 },
        { id: 'ct2', produit: 'Manioc', periode: 'Oct - Déc 2025', quantiteRecolteeKg: 3000 },
        { id: 'ct3', produit: 'Piment', periode: 'Juin - Août 2025', quantiteRecolteeKg: 150 },
      ],
      syncError: null,
      clearSyncError: () => set({ syncError: null }),

      reputation: {
        note: 4.8,
        avisCount: 127,
        qualite: 4.9,
        ponctualite: 4.7,
        communication: 4.8,
        badge: 'Producteur de confiance',
        classement: 'Top 5% région Lagunes',
      },

      addRecolte: (recolte) => {
        const id = `r-${Date.now()}`
        const newRecolte = { ...recolte, id, statut: recolte.statut ?? 'brouillon' }
        set((s) => ({
          recoltes: [newRecolte, ...s.recoltes],
        }))
        // Fire-and-forget: the id is returned synchronously (callers use it
        // to navigate immediately), the network attempt/queue-fallback runs
        // in the background exactly like the rest of this store's actions.
        reportIfLost(syncOrQueue('recolte-create', '/api/producteur/recoltes', 'POST', {
          id,
          producteurId: getProducteurId(),
          produit: newRecolte.produit,
          quantiteKg: newRecolte.quantiteKg,
          qualite: newRecolte.qualite,
          dateRecolte: newRecolte.dateRecolte,
          parcelle: newRecolte.parcelle,
          prixSouhaiteParKg: newRecolte.prixSouhaiteParKg,
          photos: newRecolte.photos,
          statut: newRecolte.statut,
        }))
        return id
      },
      publierRecolte: (id) => {
        set((s) => ({
          recoltes: s.recoltes.map((r) => (r.id === id ? { ...r, statut: 'publiee' } : r)),
        }))
        reportIfLost(syncOrQueue('recolte-update', '/api/producteur/recoltes', 'PATCH', { id, statut: 'publiee' }))
      },
      updateRecolte: (id, updates) => {
        set((s) => ({
          recoltes: s.recoltes.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        }))
        reportIfLost(syncOrQueue('recolte-update', '/api/producteur/recoltes', 'PATCH', { id, ...updates }))
      },

      repondreCommande: (id, accepter) => {
        const statut = accepter ? 'en_cours' : 'refusee'
        set((s) => ({
          commandes: s.commandes.map((c) =>
            c.id === id ? { ...c, statut } : c
          ),
        }))
        reportIfLost(syncOrQueue('commande-update', '/api/producteur/commandes', 'PATCH', { id, statut }))
      },
      confirmerLivraison: (id) => {
        set((s) => ({
          commandes: s.commandes.map((c) => (c.id === id ? { ...c, statut: 'livree' } : c)),
        }))
        reportIfLost(syncOrQueue('commande-update', '/api/producteur/commandes', 'PATCH', { id, statut: 'livree' }))
      },

      addJournalEntry: (texte, photoUrl) => {
        const cycleId = get().cycleEnCours?.id
        if (!cycleId) return
        const entry: JournalEntry = { id: `j-${Date.now()}`, date: new Date().toISOString().slice(0, 10), texte, photoUrl }
        set((s) => {
          if (!s.cycleEnCours) return s
          return { cycleEnCours: { ...s.cycleEnCours, journal: [entry, ...s.cycleEnCours.journal] } }
        })
        reportIfLost(syncOrQueue('journal', '/api/producteur/journal', 'POST', {
          id: entry.id,
          producteurId: getProducteurId(),
          cycleId,
          date: entry.date,
          texte: entry.texte,
          photoUrl: entry.photoUrl ?? null,
        }))
      },

      // Every write action above now reaches the server, but until this the
      // store never read anything back — récoltes/commandes/journal stayed
      // whatever the seeded demo data or last local write left them at,
      // forever, even after a real sync succeeded. Replaces local state with
      // the server's own copy; a real producteur with nothing recorded yet
      // legitimately sees empty lists instead of the r1/r2/r3 demo rows.
      loadFromServer: async () => {
        const producteurId = getProducteurId()
        try {
          const [recoltesRes, commandesRes] = await Promise.all([
            fetch(`/api/producteur/recoltes?producteurId=${producteurId}`),
            fetch(`/api/producteur/commandes?producteurId=${producteurId}`),
          ])
          if (recoltesRes.ok) {
            const { recoltes } = await recoltesRes.json()
            set({
              recoltes: (recoltes as Array<Record<string, unknown>>).map((r) => ({
                id: r.id as string,
                produit: r.produit as string,
                quantiteKg: r.quantiteKg as number,
                qualite: r.qualite as RecolteQualite,
                dateRecolte: (r.dateRecolte as string).slice(0, 10),
                parcelle: r.parcelle as string,
                prixSouhaiteParKg: r.prixSouhaiteParKg as number,
                photos: JSON.parse((r.photos as string) || '[]'),
                statut: r.statut as RecolteStatut,
                acheteur: (r.acheteur as string | null) ?? undefined,
                montantVente: (r.montantVente as number | null) ?? undefined,
                notes: (r.notes as string | null) ?? undefined,
              })),
            })
          }
          if (commandesRes.ok) {
            const { commandes } = await commandesRes.json()
            set({
              commandes: (commandes as Array<Record<string, unknown>>).map((c) => ({
                id: c.id as string,
                reference: c.reference as string,
                acheteurNom: c.acheteurNom as string,
                produit: c.produit as string,
                quantiteKg: c.quantiteKg as number,
                montant: c.montant as number,
                dateLivraisonSouhaitee: (c.dateLivraisonSouhaitee as string).slice(0, 10),
                statut: c.statut as CommandeStatut,
                urgent: c.urgent as boolean,
                transporteur: (c.transporteur as string | null) ?? undefined,
              })),
            })
          }

          const cycleId = get().cycleEnCours?.id
          if (cycleId) {
            const journalRes = await fetch(`/api/producteur/journal?producteurId=${producteurId}&cycleId=${cycleId}`)
            if (journalRes.ok) {
              const { entries } = await journalRes.json()
              const journal: JournalEntry[] = (entries as Array<Record<string, unknown>>).map((e) => ({
                id: e.id as string,
                date: (e.date as string).slice(0, 10),
                texte: e.texte as string,
                photoUrl: (e.photoUrl as string | null) ?? undefined,
              }))
              set((s) => (s.cycleEnCours ? { cycleEnCours: { ...s.cycleEnCours, journal } } : s))
            }
          }
        } catch {
          // Offline or server error — keep whatever's already shown locally.
        }
      },

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
      }
    },
    {
       name: 'julaba-producteur-store',
       // Harvests, orders and journals are server-owned business data.
       partialize: () => ({}),
    }
  )
)

export const PRIX_MARCHE_REFERENCE: Record<string, { prixFcfaKg: number; tendance: 'hausse' | 'baisse' | 'stable'; variationPct: number }> = {
  Manioc: { prixFcfaKg: 280, tendance: 'hausse', variationPct: 12 },
  Igname: { prixFcfaKg: 750, tendance: 'baisse', variationPct: -5 },
  Piment: { prixFcfaKg: 2500, tendance: 'hausse', variationPct: 20 },
  Oignon: { prixFcfaKg: 450, tendance: 'stable', variationPct: 0 },
}
