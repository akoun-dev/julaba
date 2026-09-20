import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { queuePendingSync } from '@/lib/offline-db'
import { useAppStore } from '@/lib/stores/app-store'
import { announceProducteurAction } from '@/lib/voice/producteur-actions'

// Task 98-B (audit 97-B1 #8) — plus JAMAIS d'id fictif : sans session
// producteur réelle, les écritures partiraient avec un identifiant fantôme
// (« producteur-1 ») → 401 requireDeviceOwner → opérations mises en file
// pour un compte démo qui n'existe pas. L'absence d'identité est un refus
// EXPLICITE, pas un fallback silencieux.
function getProducteurId(): string | null {
  return useAppStore.getState().merchantId
}

const ERREUR_SANS_SESSION = 'Connectez-vous pour enregistrer vos données.'

/**
 * Dérivation PURE du suivi d'un cycle cultural (Task 98-B) : jours écoulés,
 * durée totale, phase atteinte — calculées depuis les dates réelles, jamais
 * stockées (un cycle chargé du serveur se recalcule toujours au jour J).
 */
export function deriveCycleCulture(
  dateSemis: string,
  dateRecoltePrevue: string,
  aujourdhui: Date = new Date()
): { joursEcoules: number; joursTotal: number; phase: string } {
  const semis = new Date(dateSemis).getTime()
  const prevue = new Date(dateRecoltePrevue).getTime()
  if (!Number.isFinite(semis) || !Number.isFinite(prevue) || prevue <= semis) {
    return { joursEcoules: 0, joursTotal: 0, phase: 'Semis' }
  }
  const jourMs = 24 * 60 * 60 * 1000
  const joursTotal = Math.round((prevue - semis) / jourMs)
  const joursEcoules = Math.min(joursTotal, Math.max(0, Math.round((aujourdhui.getTime() - semis) / jourMs)))
  const fraction = joursEcoules / joursTotal
  const phase =
    fraction < 0.25 ? 'Germination'
    : fraction < 0.5 ? 'Croissance'
    : fraction < 0.75 ? 'Floraison'
    : 'Maturation'
  return { joursEcoules, joursTotal, phase }
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

  /** Task 98-B — démarrage d'un cycle cultural (POST rejouable offline). */
  demarrerCycle: (cycle: { produit: string; parcelle: string; dateSemis: string; dateRecoltePrevue: string }) => string

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
          // Task 98-B (audit 97-B1 #6) — le verdict de synchronisation n'est
          // plus muet : 'lost' (perte réelle) et 'queued' (en attente de
          // réseau) sont ANNONCÉS à la voix + vibrés. 'synced' reste
          // silencieux : l'action elle-même a déjà son retour oral
          // (announceProducteurAction) — dicter chaque succès ferait de la
          // cacophonie.
          if (result === 'lost') {
            announceProducteurAction("Attention ! Une modification n'a pas pu être enregistrée. Vérifiez votre connexion.", 'error')
          } else if (result === 'queued') {
            announceProducteurAction('Modification enregistrée sur cet appareil. Elle sera synchronisée quand la connexion reviendra.', 'medium')
          }
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
        const producteurId = getProducteurId()
        if (!producteurId) {
          // Task 98-B (#8) — refus explicite, jamais d'id fantôme.
          set({ syncError: ERREUR_SANS_SESSION })
          announceProducteurAction('Connectez-vous pour enregistrer vos récoltes.', 'error')
          return id
        }
        reportOperation(`recolte:${id}`, syncOrQueue('recolte-create', '/api/producteur/recoltes', 'POST', {
          id,
          producteurId,
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
        if (!cycleId) {
          // Task 98-B (#2) — plus de return SILENCIEUX : l'écriture impossible
          // (aucun cycle démarré) est dite à l'utilisateur.
          set({ syncError: 'Démarrez un cycle cultural pour tenir votre carnet de champ.' })
          announceProducteurAction('Démarrez d\'abord un cycle cultural pour tenir votre carnet de champ.', 'error')
          return
        }
        const producteurId = getProducteurId()
        if (!producteurId) {
          set({ syncError: ERREUR_SANS_SESSION })
          announceProducteurAction('Connectez-vous pour enregistrer votre carnet.', 'error')
          return
        }
        const entry: JournalEntry = { id: `j-${Date.now()}`, date: new Date().toISOString().slice(0, 10), texte, photoUrl }
        set((s) => {
          if (!s.cycleEnCours) return s
          return { cycleEnCours: { ...s.cycleEnCours, journal: [entry, ...s.cycleEnCours.journal] } }
        })
        reportOperation(`journal:${entry.id}`, syncOrQueue('journal', '/api/producteur/journal', 'POST', {
          id: entry.id,
          producteurId,
          cycleId,
          date: entry.date,
          texte: entry.texte,
          photoUrl: entry.photoUrl ?? null,
        }))
      },

      // Task 98-B (#2) — démarrage d'un cycle cultural (le POST est rejoué
      // offline via la file, l'API est idempotente sur l'id fourni).
      demarrerCycle: (cycle) => {
        const id = `cycle-${Date.now()}`
        const producteurId = getProducteurId()
        if (!producteurId) {
          set({ syncError: ERREUR_SANS_SESSION })
          announceProducteurAction('Connectez-vous pour démarrer un cycle.', 'error')
          return id
        }
        const nouveau: CycleCulture = {
          id,
          produit: cycle.produit,
          parcelle: cycle.parcelle,
          dateSemis: cycle.dateSemis,
          dateRecoltePrevue: cycle.dateRecoltePrevue,
          ...deriveCycleCulture(cycle.dateSemis, cycle.dateRecoltePrevue),
          journal: [],
        }
        set((s) => ({ cycleEnCours: nouveau }))
        announceProducteurAction(`Cycle ${cycle.produit} démarré. Je le suivrai avec vous.`, 'success')
        reportOperation(`cycle:${id}`, syncOrQueue('cycle-create', '/api/producteur/cycles', 'POST', {
          id,
          producteurId,
          produit: cycle.produit,
          parcelle: cycle.parcelle,
          dateSemis: cycle.dateSemis,
          dateRecoltePrevue: cycle.dateRecoltePrevue,
        }))
        return id
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
        if (!producteurId) {
          // Task 98-B (#8) — pas d'id fantôme dans les URLs : sans session,
          // l'état local reste et l'indisponibilité serveur est dite.
          set({ isLoading: false, hasLoaded: true, loadError: ERREUR_SANS_SESSION })
          return
        }
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
          const [recoltesRes, commandesRes, stockRes, cyclesRes] = await Promise.all([
            fetch(`/api/producteur/recoltes?producteurId=${producteurId}`),
            fetch(`/api/producteur/commandes?producteurId=${producteurId}`),
            fetch(`/api/producteur/stock?producteurId=${producteurId}`),
            fetch(`/api/producteur/cycles?producteurId=${producteurId}`),
          ])
          if (!recoltesRes.ok || !commandesRes.ok || !stockRes.ok || !cyclesRes.ok) {
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

          // Task 98-B (#1) — le stock est DÉRIVÉ par le serveur des récoltes
          // disponibles (une seule source de vérité, zéro double comptage).
          if (stockRes.ok) {
            const { stock } = await stockRes.json()
            set({
              stock: (stock as Array<Record<string, unknown>>).map((s) => ({
                produit: toStr(s.produit),
                quantiteKg: toNum(s.quantite_kg ?? s.quantiteKg),
                etat: (s.etat === 'bas' ? 'bas' : 'bon') as StockProducteur['etat'],
                prochaineRecolte: (s.prochaine_recolte as string | null) ?? undefined,
              })),
            })
          }

          // Task 98-B (#2) — cycles culturaux réels (le plus récent
          // « en_cours » devient le cycle suivi ; les « termine » nourrissent
          // l'historique). joursEcoules/joursTotal/phase sont RECALCULÉS au
          // jour J — jamais stockés.
          if (cyclesRes.ok) {
            const { cycles } = await cyclesRes.json()
            const tous = (cycles as Array<Record<string, unknown>>).map((c) => {
              const dateSemis = toStr(c.date_semis ?? c.dateSemis).slice(0, 10)
              const dateRecoltePrevue = toStr(c.date_recolte_prevue ?? c.dateRecoltePrevue).slice(0, 10)
              return {
                id: toStr(c.id),
                produit: toStr(c.produit),
                parcelle: toStr(c.parcelle),
                dateSemis,
                dateRecoltePrevue,
                statut: (c.statut ?? 'en_cours') as 'en_cours' | 'termine',
                quantiteRecolteeKg: (c.quantite_recoltee_kg ?? null) as number | null,
                derivation: deriveCycleCulture(dateSemis, dateRecoltePrevue),
              }
            })
            const enCours = tous.find((c) => c.statut === 'en_cours')
            set((s) => ({
              cycleEnCours: enCours
                ? {
                    id: enCours.id,
                    produit: enCours.produit,
                    parcelle: enCours.parcelle,
                    dateSemis: enCours.dateSemis,
                    dateRecoltePrevue: enCours.dateRecoltePrevue,
                    ...enCours.derivation,
                    journal: s.cycleEnCours?.id === enCours.id ? s.cycleEnCours.journal : [],
                  }
                : null,
              cyclesTermines: tous
                .filter((c) => c.statut === 'termine')
                .map((c) => ({
                  id: c.id,
                  produit: c.produit,
                  periode: `${c.dateSemis} → ${c.dateRecoltePrevue}`,
                  quantiteRecolteeKg: c.quantiteRecolteeKg ?? 0,
                })),
            }))
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
