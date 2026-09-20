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
// 'disponible' : statut posé par le seed / le serveur pour les récoltes en
// stock — il était absent de cette union et son badge disparaissait à l'écran.
export type RecolteStatut = 'brouillon' | 'publiee' | 'vendue' | 'disponible'

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

// 'en_attente' et 'confirmee' sont les statuts réellement posés par le seed
// et le backoffice — ils étaient hors union, d'où des filtres vides et des
// badges silencieusement absents côté UI.
export type CommandeStatut = 'a_traiter' | 'en_attente' | 'confirmee' | 'en_cours' | 'livree' | 'refusee'

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
  syncNotice: string | null
  pendingOperations: Record<string, boolean>
  isLoading: boolean
  hasLoaded: boolean
  loadError: string | null
  lastSyncedAt: string | null
  clearSyncError: () => void
  clearSyncNotice: () => void

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
      const reportOperation = (key: string, pending: Promise<'synced' | 'queued' | 'lost'>) => {
        set((state) => ({ pendingOperations: { ...state.pendingOperations, [key]: true }, syncError: null }))
        pending.then((result) => {
          set((state) => {
            const pendingOperations = { ...state.pendingOperations }
            delete pendingOperations[key]
            return {
              pendingOperations,
              syncError: result === 'lost'
                ? "Une modification n'a pas pu être enregistrée. Vérifiez votre connexion."
                : state.syncError,
              syncNotice: result === 'queued'
                ? 'Modification enregistrée sur cet appareil. Elle sera synchronisée dès que la connexion revient.'
                : result === 'synced'
                  ? 'Modification synchronisée.'
                  : state.syncNotice,
            }
          })
        }).catch(() => {
          set((state) => {
            const pendingOperations = { ...state.pendingOperations }
            delete pendingOperations[key]
            return { pendingOperations, syncError: "Une modification n'a pas pu être enregistrée. Vérifiez votre connexion." }
          })
        })
      }
      return {
      recoltes: [],
      commandes: [],
      stock: [],
      cycleEnCours: null,
      cyclesTermines: [],
      isLoading: false,
      hasLoaded: false,
      loadError: null,
      lastSyncedAt: null,
      syncError: null,
      syncNotice: null,
      pendingOperations: {},
      clearSyncError: () => set({ syncError: null }),
      clearSyncNotice: () => set({ syncNotice: null }),

      reputation: {
        note: 0,
        avisCount: 0,
        qualite: 0,
        ponctualite: 0,
        communication: 0,
        badge: 'Pas encore évalué',
        classement: 'Classement indisponible',
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
        reportOperation(`recolte:${id}`, syncOrQueue('recolte-create', '/api/producteur/recoltes', 'POST', {
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
        reportOperation(`recolte:${id}`, syncOrQueue('recolte-update', '/api/producteur/recoltes', 'PATCH', { id, statut: 'publiee' }))
      },
      updateRecolte: (id, updates) => {
        set((s) => ({
          recoltes: s.recoltes.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        }))
        reportOperation(`recolte:${id}`, syncOrQueue('recolte-update', '/api/producteur/recoltes', 'PATCH', { id, ...updates }))
      },

      repondreCommande: (id, accepter) => {
        const statut = accepter ? 'en_cours' : 'refusee'
        set((s) => ({
          commandes: s.commandes.map((c) =>
            c.id === id ? { ...c, statut } : c
          ),
        }))
        reportOperation(`commande:${id}`, syncOrQueue('commande-update', '/api/producteur/commandes', 'PATCH', { id, statut }))
      },
      confirmerLivraison: (id) => {
        set((s) => ({
          commandes: s.commandes.map((c) => (c.id === id ? { ...c, statut: 'livree' } : c)),
        }))
        reportOperation(`commande:${id}`, syncOrQueue('commande-update', '/api/producteur/commandes', 'PATCH', { id, statut: 'livree' }))
      },

      addJournalEntry: (texte, photoUrl) => {
        const cycleId = get().cycleEnCours?.id
        if (!cycleId) return
        const entry: JournalEntry = { id: `j-${Date.now()}`, date: new Date().toISOString().slice(0, 10), texte, photoUrl }
        set((s) => {
          if (!s.cycleEnCours) return s
          return { cycleEnCours: { ...s.cycleEnCours, journal: [entry, ...s.cycleEnCours.journal] } }
        })
        reportOperation(`journal:${entry.id}`, syncOrQueue('journal', '/api/producteur/journal', 'POST', {
          id: entry.id,
          producteurId: getProducteurId(),
          cycleId,
          date: entry.date,
          texte: entry.texte,
          photoUrl: entry.photoUrl ?? null,
        }))
      },

      // Replace local projections with the server's own copy after load; a
      // producteur with nothing recorded yet legitimately sees empty lists.
      //
      // NB : les routes GET renvoient les lignes Supabase brutes (snake_case,
      // select('*')) — le mapping lit donc les deux conventions, sinon
      // r.dateRecolte est undefined; errors stay visible rather than making
      // local data look like a confirmed server snapshot.
      loadFromServer: async () => {
        const producteurId = getProducteurId()
        set({ isLoading: true, loadError: null })
        const toStr = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback)
        const toNum = (v: unknown, fallback = 0) => (typeof v === 'number' ? v : fallback)
        const parsePhotos = (v: unknown): string[] => {
          if (Array.isArray(v)) return v as string[]
          if (typeof v === 'string' && v) {
            try {
              const parsed = JSON.parse(v)
              return Array.isArray(parsed) ? parsed : []
            } catch {
              return []
            }
          }
          return []
        }
        try {
          const [recoltesRes, commandesRes] = await Promise.all([
            fetch(`/api/producteur/recoltes?producteurId=${producteurId}`),
            fetch(`/api/producteur/commandes?producteurId=${producteurId}`),
          ])
          if (!recoltesRes.ok || !commandesRes.ok) {
            throw new Error('Les données producteur sont indisponibles.')
          }
          if (recoltesRes.ok) {
            const { recoltes } = await recoltesRes.json()
            set({
              recoltes: (recoltes as Array<Record<string, unknown>>).map((r) => ({
                id: toStr(r.id),
                produit: toStr(r.produit),
                quantiteKg: toNum(r.quantite_kg ?? r.quantiteKg),
                qualite: (r.qualite ?? 'standard') as RecolteQualite,
                dateRecolte: toStr(r.date_recolte ?? r.dateRecolte).slice(0, 10),
                parcelle: toStr(r.parcelle),
                prixSouhaiteParKg: toNum(r.prix_souhaite_par_kg ?? r.prixSouhaiteParKg),
                photos: parsePhotos(r.photos),
                statut: (r.statut ?? 'brouillon') as RecolteStatut,
                acheteur: (r.acheteur as string | null) ?? undefined,
                montantVente: (r.montant_vente ?? r.montantVente ?? null) as number | null ?? undefined,
                notes: (r.notes as string | null) ?? undefined,
              })),
            })
          }
          if (commandesRes.ok) {
            const { commandes } = await commandesRes.json()
            set({
              commandes: (commandes as Array<Record<string, unknown>>).map((c) => ({
                id: toStr(c.id),
                reference: toStr(c.reference),
                acheteurNom: toStr(c.acheteur_nom ?? c.acheteurNom),
                produit: toStr(c.produit),
                quantiteKg: toNum(c.quantite_kg ?? c.quantiteKg),
                montant: toNum(c.montant),
                dateLivraisonSouhaitee: toStr(c.date_livraison_souhaitee ?? c.dateLivraisonSouhaitee).slice(0, 10),
                statut: (c.statut ?? 'a_traiter') as CommandeStatut,
                urgent: c.urgent === true,
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
                id: toStr(e.id),
                date: toStr(e.date).slice(0, 10),
                texte: toStr(e.texte),
                photoUrl: ((e.photo_url as string | null) ?? (e.photoUrl as string | null)) ?? undefined,
              }))
              set((s) => (s.cycleEnCours ? { cycleEnCours: { ...s.cycleEnCours, journal } } : s))
            }
          }
          set({ isLoading: false, hasLoaded: true, lastSyncedAt: new Date().toISOString(), loadError: null })
        } catch {
          // Keep local mutations, but expose the unavailable server state.
          set({ isLoading: false, hasLoaded: true, loadError: 'Impossible de charger vos données. Vérifiez votre connexion puis réessayez.' })
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
        const commandesEnAttente = commandes.filter(
          (c) => c.statut === 'a_traiter' || c.statut === 'en_attente'
        ).length
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
