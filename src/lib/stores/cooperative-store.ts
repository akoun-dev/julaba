import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { queuePendingSync } from '@/lib/offline-db'
import { useAppStore } from '@/lib/stores/app-store'
import type { NiveauPerformance } from '@/lib/scores/score-julaba'

/**
 * Store du module Coopérative (MODE-921) — partagé par les DEUX côtés :
 *  • le coopérateur (président) : membres, trésorerie, pot commun, besoins ;
 *  • le marchand membre : annuaire, adhésion, cotisation, besoins, reçus.
 *
 * Règles héritées des audits précédents (producteur-store) :
 *  • AUCUNE donnée de démonstration : l'état initial est vide, tout vient
 *    du serveur (loadFromServer) ou des mutations réelles de l'utilisateur ;
 *  • mutations optimistes + syncOrQueue : l'écriture part maintenant, en
 *    cas d'échec réseau elle rejoint la file offline (queuePendingSync) et
 *    le statut 'synced' | 'queued' | 'lost' est renvoyé à l'écran pour un
 *    feedback honnête (jamais de succès inventé — contrat `persisted`) ;
 *  • syncError global affiché par la barre basse (même pattern que
 *    producteur-store/prod-bottom-bar) ;
 *  • INCIDENT-006 : aucun sélecteur avec dérivé useMemo dans ce store.
 */

// ── Types publics ───────────────────────────────────────────────────────

export type MembreStatut = 'actif' | 'suspendu' | 'en_attente' | 'exclu'
export type MembreRole = 'membre' | 'president'

export interface MembreCoop {
  id: string
  marchandId: string
  prenom: string | null
  nom: string | null
  telephone: string | null
  statut: MembreStatut
  role: MembreRole
  dateAdhesion: string | null
  cotisationPayee: boolean
  totalCotisations: number
  membreDepuis: string
  /** MODE-932 — score JULABA réel (source unique /scores/me) ; null si
   * l'API n'a pas pu le calculer (jamais de score inventé côté client). */
  scoreJulaba: { score: number; niveau: NiveauPerformance } | null
}

export interface TransactionCoop {
  id: string
  type: 'entree' | 'sortie'
  categorie: string
  montant: number
  membreId: string | null
  description: string
  statut: 'en_attente' | 'validee' | 'annulee'
  date: string
}

export interface StockCommunItem {
  id: string
  produit: string
  categorie: string | null
  quantite: number
  unite: string
  misAJour?: string
}

export interface BesoinCoop {
  id: string
  marchandId: string
  produit: string
  categorie: string | null
  quantite: number
  unite: string
  prixMax: number | null
  priorite: 'normale' | 'urgente'
  statut: 'en_attente' | 'consolide' | 'en_cours' | 'approuve' | 'livre'
  notes?: string | null
  dateBesoin?: string | null
  quantiteAttribuee?: number | null
  prixAchat?: number | null
  prixDispatch?: number | null
  date: string
}

export interface BesoinGroupeCoop {
  cle: string
  produit: string
  categorie: string | null
  unite: string
  quantiteTotale: number
  nbMembres: number
  priorite: 'normale' | 'urgente'
  prixMax: number | null
  nbBesoins: number
}

export interface DistributionRecue {
  id: string
  produit: string
  unite: string
  quantite: number
  date: string
  cooperativeId?: string
}

export interface CooperativeInfo {
  id: string
  nom: string
  commune: string | null
}

export interface ResumeCooperative {
  membresTotal: number
  membresActifs: number
  adhesionsEnAttente: number
  membresSuspendus: number
  soldeTresorerie: number
  totalCotisations: number
  produitsEnStock: number
  articlesEnStock: number
}

export interface CooperativeAnnuaireItem extends CooperativeInfo {
  responsableNom: string | null
  membresActifs: number
}

export interface MaCooperativeMarchand {
  membre: {
    id: string
    statut: MembreStatut
    role: MembreRole
    dateAdhesion: string | null
    cotisationPayee: boolean
  } | null
  cooperative: (CooperativeInfo & { responsableNom: string | null }) | null
  distributionsRecues: DistributionRecue[]
  besoins: BesoinCoop[]
}

// ── syncOrQueue (même contrat que producteur-store) ─────────────────────

export type StatutSync = 'synced' | 'queued' | 'lost'

async function syncOrQueue(
  entity: string,
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  payload: Record<string, unknown>
): Promise<StatutSync> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      // Un 4xx est un rejet métier définitif : mettre ça dans la file ne
      // servirait à rien (le rejeu serait rejeté pareil) — 'lost' est le
      // statut honnête et l'erreur passe à l'écran.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        const data = await res.json().catch(() => null)
        throw new ErreurMetier((data?.erreur as string) || `Rejet ${res.status}`)
      }
      throw new ErreurReseau(`Erreur ${res.status}`)
    }
    return 'synced'
  } catch (error) {
    if (error instanceof ErreurMetier) throw error
    const queued = await queuePendingSync(entity, payload)
    return queued.ok ? 'queued' : 'lost'
  }
}

export class ErreurMetier extends Error {}
export class ErreurReseau extends Error {}

interface CoteCooperateur {
  cooperative: CooperativeInfo | null
  resume: ResumeCooperative | null
  membres: MembreCoop[]
  transactions: TransactionCoop[]
  solde: number
  totalCotisations: number
  stock: StockCommunItem[]
  besoins: BesoinCoop[]
  groupes: BesoinGroupeCoop[]
}

interface CoteMarchand {
  annuaire: CooperativeAnnuaireItem[]
  maCooperative: MaCooperativeMarchand | null
}

interface CooperativeState extends CoteCooperateur, CoteMarchand {
  // Chargement
  loading: boolean
  loadError: string | null
  chargerEspaceCooperateur: (cooperateurId: string) => Promise<void>
  chargerMaCooperative: (merchantId: string) => Promise<void>
  chargerAnnuaire: (merchantId?: string) => Promise<void>

  // Membres (président)
  ajouterMarchand: (cooperateurId: string, marchandId: string) => Promise<StatutSync>
  changerStatutMembre: (cooperateurId: string, membreId: string, statut: MembreStatut, motif?: string) => Promise<StatutSync>
  changerRoleMembre: (cooperateurId: string, membreId: string, role: MembreRole) => Promise<StatutSync>
  exclureMembre: (cooperateurId: string, membreId: string) => Promise<StatutSync>

  // Trésorerie (président)
  ajouterTransaction: (
    cooperateurId: string,
    tx: { type: 'entree' | 'sortie'; categorie?: string; montant: number; description: string }
  ) => Promise<StatutSync>
  changerStatutTransaction: (cooperateurId: string, transactionId: string, statut: 'validee' | 'annulee') => Promise<StatutSync>

  // Pot commun (marchand membre + président-marchand)
  apporterStock: (compteId: string, apport: { produit: string; categorie?: string; quantite: number; unite: string }) => Promise<StatutSync>
  distribuerStock: (
    compteId: string,
    distribution: { produit: string; quantite: number; unite: string; destinataires: { membreId: string; quantite: number }[]; besoinId?: string }
  ) => Promise<StatutSync>

  // Besoins
  soumettreBesoin: (
    merchantId: string,
    besoin: { produit: string; categorie?: string; quantite: number; unite: string; prixMax?: number; priorite?: 'normale' | 'urgente'; notes?: string; dateBesoin?: string }
  ) => Promise<StatutSync>
  traiterBesoin: (
    cooperateurId: string,
    besoinId: string,
    updates: { statut?: BesoinCoop['statut']; quantiteAttribuee?: number; prixAchat?: number; prixDispatch?: number; notes?: string }
  ) => Promise<StatutSync>
  consoliderBesoins: (cooperateurId: string, groupe?: { produit: string; unite: string }) => Promise<StatutSync>

  // Marchand
  rejoindreCooperative: (merchantId: string, cooperativeId: string) => Promise<StatutSync>
  payerCotisation: (merchantId: string, montant: number) => Promise<StatutSync>

  // Erreurs
  syncError: string | null
  clearSyncError: () => void
  reset: () => void
}

function nouvelleIdempotence(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `coop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const VIDE: CoteCooperateur & CoteMarchand = {
  cooperative: null,
  resume: null,
  membres: [],
  transactions: [],
  solde: 0,
  totalCotisations: 0,
  stock: [],
  besoins: [],
  groupes: [],
  annuaire: [],
  maCooperative: null,
}

export const useCooperativeStore = create<CooperativeState>()(
  persist(
    (set, get) => ({
      ...VIDE,

      loading: false,
      loadError: null,
      syncError: null,
      clearSyncError: () => set({ syncError: null }),

      // ── Chargements ───────────────────────────────────────────────────
      chargerEspaceCooperateur: async (cooperateurId) => {
        set({ loading: true, loadError: null })
        try {
          const [resumeRes, membresRes, tresorerieRes, stockRes, besoinsRes] = await Promise.all([
            fetch(`/api/cooperatives?cooperateurId=${encodeURIComponent(cooperateurId)}`),
            fetch(`/api/cooperatives/membres?cooperateurId=${encodeURIComponent(cooperateurId)}`),
            fetch(`/api/cooperatives/tresorerie?cooperateurId=${encodeURIComponent(cooperateurId)}`),
            fetch(`/api/cooperatives/stock?cooperateurId=${encodeURIComponent(cooperateurId)}`),
            fetch(`/api/cooperatives/besoins?cooperateurId=${encodeURIComponent(cooperateurId)}`),
          ])
          // Toutes les lectures passent par requirePresident côté serveur —
          // une seule session (cooperateur) pilote les cinq requêtes.
          if (!resumeRes.ok) {
            const data = await resumeRes.json().catch(() => null)
            throw new ErreurMetier((data?.erreur as string) || 'Chargement impossible')
          }
          const resumeData = await resumeRes.json()
          const membresData = membresRes.ok ? await membresRes.json() : { membres: [] }
          const tresorerieData = tresorerieRes.ok ? await tresorerieRes.json() : { transactions: [], solde: 0, totalCotisations: 0 }
          const stockData = stockRes.ok ? await stockRes.json() : { stock: [] }
          const besoinsData = besoinsRes.ok ? await besoinsRes.json() : { besoins: [], groupes: [] }

          set({
            cooperative: resumeData.cooperative,
            resume: resumeData.resume,
            membres: membresData.membres ?? [],
            transactions: tresorerieData.transactions ?? [],
            solde: tresorerieData.solde ?? 0,
            totalCotisations: tresorerieData.totalCotisations ?? 0,
            stock: stockData.stock ?? [],
            besoins: besoinsData.besoins ?? [],
            groupes: besoinsData.groupes ?? [],
            loading: false,
          })
        } catch (error) {
          set({
            loading: false,
            loadError: error instanceof Error ? error.message : 'Chargement impossible',
          })
        }
      },

      chargerMaCooperative: async (merchantId) => {
        set({ loading: true, loadError: null })
        try {
          const res = await fetch(`/api/cooperatives/ma-cooperative?merchantId=${encodeURIComponent(merchantId)}`)
          const data = await res.json()
          if (!res.ok) throw new ErreurMetier((data?.erreur as string) || 'Chargement impossible')
          set({ maCooperative: data, loading: false })
        } catch (error) {
          set({
            loading: false,
            loadError: error instanceof Error ? error.message : 'Chargement impossible',
          })
        }
      },

      chargerAnnuaire: async (merchantId?: string) => {
        try {
          // MODE-922 : l'annuaire exige une session appareil (le merchantId
          // identifie la session à vérifier côté serveur — garde
          // requireMarchandSession).
          const query = merchantId ? `?merchantId=${encodeURIComponent(merchantId)}` : ''
          const res = await fetch(`/api/cooperatives/liste${query}`)
          const data = await res.json()
          if (!res.ok) throw new ErreurMetier((data?.erreur as string) || 'Chargement impossible')
          set({ annuaire: data.cooperatives ?? [] })
        } catch (error) {
          set({
            loadError: error instanceof Error ? error.message : 'Annuaire indisponible',
          })
        }
      },

      // ── Membres ───────────────────────────────────────────────────────
      ajouterMarchand: async (cooperateurId, marchandId) => {
        try {
          const res = await fetch('/api/cooperatives/membres', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cooperateurId, marchandId }),
          })
          const data = await res.json()
          if (!res.ok) throw new ErreurMetier((data?.erreur as string) || 'Ajout impossible')
          await get().chargerEspaceCooperateur(cooperateurId)
          return 'synced'
        } catch (error) {
          if (error instanceof ErreurMetier) {
            set({ syncError: error.message })
            throw error
          }
          throw error
        }
      },

      changerStatutMembre: async (cooperateurId, membreId, statut, motif) => {
        try {
          const res = await fetch(`/api/cooperatives/membres/${encodeURIComponent(membreId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cooperateurId, statut, motif }),
          })
          const data = await res.json()
          if (!res.ok) throw new ErreurMetier((data?.erreur as string) || 'Action impossible')
          set((state) => ({
            membres: state.membres.map((m) => (m.id === membreId ? { ...m, statut } : m)),
            resume: state.resume
              ? {
                  ...state.resume,
                  membresActifs:
                    statut === 'actif'
                      ? state.resume.membresActifs + 1
                      : state.resume.membresActifs - (state.membres.find((m) => m.id === membreId)?.statut === 'actif' ? 1 : 0),
                  adhesionsEnAttente:
                    state.resume.adhesionsEnAttente - (statut === 'actif' && state.membres.find((m) => m.id === membreId)?.statut === 'en_attente' ? 1 : 0),
                }
              : null,
          }))
          return 'synced'
        } catch (error) {
          const message = error instanceof ErreurMetier ? error.message : 'Action impossible'
          set({ syncError: message })
          throw error
        }
      },

      changerRoleMembre: async (cooperateurId, membreId, role) => {
        try {
          const res = await fetch(`/api/cooperatives/membres/${encodeURIComponent(membreId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cooperateurId, role }),
          })
          const data = await res.json()
          if (!res.ok) throw new ErreurMetier((data?.erreur as string) || 'Action impossible')
          set((state) => ({
            membres: state.membres.map((m) => (m.id === membreId ? { ...m, role } : m)),
          }))
          return 'synced'
        } catch (error) {
          const message = error instanceof ErreurMetier ? error.message : 'Action impossible'
          set({ syncError: message })
          throw error
        }
      },

      exclureMembre: async (cooperateurId, membreId) => {
        try {
          const res = await fetch(`/api/cooperatives/membres/${encodeURIComponent(membreId)}?cooperateurId=${encodeURIComponent(cooperateurId)}`, {
            method: 'DELETE',
          })
          const data = await res.json()
          if (!res.ok) throw new ErreurMetier((data?.erreur as string) || 'Exclusion impossible')
          set((state) => ({ membres: state.membres.filter((m) => m.id !== membreId) }))
          return 'synced'
        } catch (error) {
          const message = error instanceof ErreurMetier ? error.message : 'Exclusion impossible'
          set({ syncError: message })
          throw error
        }
      },

      // ── Trésorerie ───────────────────────────────────────────────────
      ajouterTransaction: async (cooperateurId, tx) => {
        const statut = await syncOrQueue('cooperative-transaction', '/api/cooperatives/tresorerie', 'POST', {
          cooperateurId,
          ...tx,
        })
        if (statut === 'synced') {
          await get().chargerEspaceCooperateur(cooperateurId)
        }
        return statut
      },

      changerStatutTransaction: async (cooperateurId, transactionId, statut) => {
        try {
          const res = await fetch(`/api/cooperatives/tresorerie/${encodeURIComponent(transactionId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cooperateurId, statut }),
          })
          const data = await res.json()
          if (!res.ok) throw new ErreurMetier((data?.erreur as string) || 'Action impossible')
          set((state) => ({
            transactions: state.transactions.map((t) =>
              t.id === transactionId ? { ...t, statut } : t
            ),
          }))
          // Le solde change — rechargement du résumé (réel, pas recalcul
          // local approximatif des agrégats).
          await get().chargerEspaceCooperateur(cooperateurId)
          return 'synced'
        } catch (error) {
          const message = error instanceof ErreurMetier ? error.message : 'Action impossible'
          set({ syncError: message })
          throw error
        }
      },

      // ── Pot commun ───────────────────────────────────────────────────
      apporterStock: async (compteId, apport) => {
        // MODE-931 — l'opérateur est un membre marchand (merchantId) OU le
        // président coopérateur (cooperateurId) : la clé du body suit le
        // rôle réel du compte (le président est authentifié
        // `cooperateur:<id>`, une session marchand serait refusée).
        const cleId =
          useAppStore.getState().userRole === 'cooperateur'
            ? { cooperateurId: compteId }
            : { merchantId: compteId }
        const statut = await syncOrQueue('cooperative-stock-apport', '/api/cooperatives/stock', 'POST', {
          ...cleId,
          clientId: nouvelleIdempotence(),
          ...apport,
        })
        return statut
      },

      distribuerStock: async (compteId, distribution) => {
        // MODE-931 — même garde duale que l'apport : président
        // (cooperateurId) ou membre actif (merchantId) selon le rôle.
        // La distribution est une opération verrouillée côté serveur (jamais
        // de stock négatif) : elle ne rejoint PAS la file offline — hors
        // réseau elle est refusée explicitement plutôt que rejouée en boucle
        // sur un disponible déjà consommé.
        const cleId =
          useAppStore.getState().userRole === 'cooperateur'
            ? { cooperateurId: compteId }
            : { merchantId: compteId }
        try {
          const res = await fetch('/api/cooperatives/distribution', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...cleId, clientId: nouvelleIdempotence(), ...distribution }),
          })
          const data = await res.json()
          if (!res.ok) {
            throw new ErreurMetier((data?.erreur as string) || 'Distribution impossible')
          }
          return 'synced'
        } catch (error) {
          if (error instanceof ErreurMetier) throw error
          throw new ErreurReseau('Réseau indisponible — réessayez en ligne')
        }
      },

      // ── Besoins ──────────────────────────────────────────────────────
      soumettreBesoin: async (merchantId, besoin) => {
        const statut = await syncOrQueue('cooperative-besoin', '/api/cooperatives/besoins', 'POST', {
          merchantId,
          ...besoin,
        })
        if (statut === 'synced') {
          await get().chargerMaCooperative(merchantId)
        }
        return statut
      },

      traiterBesoin: async (cooperateurId, besoinId, updates) => {
        try {
          const res = await fetch(`/api/cooperatives/besoins/${encodeURIComponent(besoinId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cooperateurId, ...updates }),
          })
          const data = await res.json()
          if (!res.ok) throw new ErreurMetier((data?.erreur as string) || 'Action impossible')
          set((state) => ({
            besoins: state.besoins.map((b) =>
              b.id === besoinId
                ? {
                    ...b,
                    statut: updates.statut ?? b.statut,
                    quantiteAttribuee: updates.quantiteAttribuee ?? b.quantiteAttribuee,
                    prixAchat: updates.prixAchat ?? b.prixAchat,
                    prixDispatch: updates.prixDispatch ?? b.prixDispatch,
                    notes: updates.notes ?? b.notes,
                  }
                : b
            ),
          }))
          return 'synced'
        } catch (error) {
          const message = error instanceof ErreurMetier ? error.message : 'Action impossible'
          set({ syncError: message })
          throw error
        }
      },

      consoliderBesoins: async (cooperateurId, groupe) => {
        try {
          const res = await fetch('/api/cooperatives/besoins/consolider', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cooperateurId, ...groupe }),
          })
          const data = await res.json()
          if (!res.ok) throw new ErreurMetier((data?.erreur as string) || 'Consolidation impossible')
          set((state) => ({
            besoins: state.besoins.map((b) =>
              b.statut === 'en_attente' &&
              (!groupe || (b.produit.toLowerCase() === groupe.produit.toLowerCase() && b.unite.toLowerCase() === groupe.unite.toLowerCase()))
                ? { ...b, statut: 'consolide' }
                : b
            ),
          }))
          return 'synced'
        } catch (error) {
          const message = error instanceof ErreurMetier ? error.message : 'Consolidation impossible'
          set({ syncError: message })
          throw error
        }
      },

      // ── Marchand ─────────────────────────────────────────────────────
      rejoindreCooperative: async (merchantId, cooperativeId) => {
        const statut = await syncOrQueue('cooperative-adhesion', '/api/cooperatives/rejoindre', 'POST', {
          merchantId,
          cooperativeId,
        })
        if (statut === 'synced') {
          await get().chargerMaCooperative(merchantId)
        }
        return statut
      },

      payerCotisation: async (merchantId, montant) => {
        const statut = await syncOrQueue('cooperative-cotisation', '/api/cooperatives/cotisation', 'POST', {
          merchantId,
          montant,
        })
        if (statut === 'synced') {
          await get().chargerMaCooperative(merchantId)
        }
        return statut
      },

      reset: () => set({ ...VIDE, loading: false, loadError: null, syncError: null }),
    }),
    {
      name: 'julaba-cooperative-store',
      // Le loadError/syncError sont transitoires : ils ne survivent pas à
      // un redémarrage (même politique que producteur-store).
      partialize: (state) => ({
        cooperative: state.cooperative,
        resume: state.resume,
        membres: state.membres,
        transactions: state.transactions,
        solde: state.solde,
        totalCotisations: state.totalCotisations,
        stock: state.stock,
        besoins: state.besoins,
        groupes: state.groupes,
        annuaire: state.annuaire,
        maCooperative: state.maCooperative,
      }),
    }
  )
)
