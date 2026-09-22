import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { queuePendingSync } from '@/lib/offline-db'
import { useAppStore } from '@/lib/stores/app-store'
import type { NiveauPerformance } from '@/lib/scores/score-julaba'
// MODE-975 (AUDIT-007 Phase 3) — la FORME de l'agrégat dashboard a UNE
// seule source : le handler MODE-972. Import TYPE-ONLY (effacé à la
// compilation : aucune dépendance runtime du client vers le code serveur,
// le garde requirePresident reste le seul juge côté route).
import type { DashboardResponse } from '@/app/api/cooperatives/dashboard/route'

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
  /** MODE-985 (DET-COOP-011 tranche 2) — commune déclarée par le
   * marchand (référentiel GPS MODE-979) ; null = jamais déclarée, le
   * membre ne passe alors que dans le filtre « Toutes » (jamais de
   * localisation devinée). */
  commune: { id: string; nom: string; region: string } | null
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

/** MODE-986 (DET-COOP-003) — canal d'une écriture de trésorerie : 'especes'
 * = déclaration honnête (aucun mouvement wallet) ; 'keiwa' = portefeuille
 * du marchand DÉBITÉ dans la même transaction SQL que l'écriture. Optionnel
 * dans les fixtures/écritures antérieures — l'absence SE LIT 'especes'
 * (les écritures pré-migration étaient toutes des déclarations). */
export type CanalCotisation = 'especes' | 'keiwa'

export interface TransactionCoop {
  id: string
  type: 'entree' | 'sortie'
  categorie: string
  montant: number
  membreId: string | null
  description: string
  statut: 'en_attente' | 'validee' | 'annulee'
  canal?: CanalCotisation
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
  statut: 'en_attente' | 'consolide' | 'en_cours' | 'livre'
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
  /** MODE-979 (DET-COOP-008) — commune du référentiel GPS liée
   * (renvoyée par GET /api/cooperatives depuis MODE-979 ; optionnelle
   * pour l'annuaire qui n'en porte pas). */
  communeId?: string | null
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

/** MODE-951 (AUDIT-003 PF-05) — sections de l'espace président : chaque
 * écran ne recharge que ce qu'il affiche (fin des 5-6 requêtes pour un
 * seul onglet). Par défaut : tout. */
export type SectionEspace = 'resume' | 'membres' | 'tresorerie' | 'stock' | 'besoins' | 'score'

const TOUTES_SECTIONS: SectionEspace[] = ['resume', 'membres', 'tresorerie', 'stock', 'besoins', 'score']

// ── Dashboard (MODE-975, AUDIT-007 Phase 3) ──────────────────────────────

/** Agrégat UNIQUE du dashboard coopératif — le MÊME objet que renvoie
 * GET /api/cooperatives/dashboard (MODE-972). Calculé SERVEUR, jamais
 * recalculé client : pas de second agrégat divergent (leçon du module
 * partagé MODE-935). */
export type DashboardCoop = DashboardResponse

/** Fenêtre du sélecteur de période (l'endpoint n'accepte que 7|30 jours). */
export type PeriodeDashboard = '7j' | '30j'

interface CoteCooperateur {
  cooperative: CooperativeInfo | null
  resume: ResumeCooperative | null
  membres: MembreCoop[]
  transactions: TransactionCoop[]
  solde: number
  totalCotisations: number
  /** MODE-974 (AUDIT-007 G16) — écritures de trésorerie en attente de
   * validation (champ `enAttente` calculé serveur par GET /tresorerie,
   * jusqu'ici JAMAIS lu par le front) : alimente le badge de l'onglet
   * Trésorerie. Dernière valeur connue du serveur — persistée comme le
   * reste des données (jamais réinitialisée en zéro inventé). */
  ecrituresEnAttente: number
  stock: StockCommunItem[]
  besoins: BesoinCoop[]
  groupes: BesoinGroupeCoop[]
  /** MODE-946 (AUDIT-003 D-2, F-14) — score JULABA de la COOPÉRATIVE
   * (scoreCooperateur, source unique /scores/me) ; null si pas calculable
   * (404 sans coop, erreur réseau) — jamais de score inventé. */
  scoreJulaba: { score: number; niveau: NiveauPerformance } | null
  /** MODE-951 (AUDIT-003 I-13) — sections dont le chargement a échoué lors
   * du dernier appel : l'écran l'annonce au lieu d'afficher des listes
   * vides silencieuses. Les données déjà chargées restent affichées. */
  sectionsEnErreur: SectionEspace[]
  /** MODE-975 (AUDIT-007 Phase 3) — dernier agrégat dashboard connu
   * (MODE-972). null = jamais chargé — JAMAIS d'agrégat inventé. Persisté
   * comme le reste : hors ligne, les widgets montrent la dernière synthèse
   * connue AVEC sa date (genereLe) plutôt qu'un mensonge de fraîcheur. */
  dashboard: DashboardCoop | null
  /** Fenêtre affichée (7 jours par défaut sur mobile : la fenêtre 30 j
   * reste un choix explicite). */
  periodeDashboard: PeriodeDashboard
  /** MODE-976 (AUDIT-007 G3/G10) — membre ouvert dans la fiche
   * drill-down. Persisté (comme les autres données) : le retour matériel
   * Android ou un redémarrage ne perd plus le contexte de navigation.
   * null = aucune fiche ouverte. */
  membreSelectionneId: string | null
}

interface CoteMarchand {
  annuaire: CooperativeAnnuaireItem[]
  maCooperative: MaCooperativeMarchand | null
}

interface CooperativeState extends CoteCooperateur, CoteMarchand {
  // Chargement
  loading: boolean
  loadError: string | null
  /** MODE-975 — transitoires du dashboard, jamais persistés (comme
   * loading/loadError) ; dashboardEnErreur annonce un fetch échoué SANS
   * écraser l'agrégat précédent. */
  dashboardChargement: boolean
  dashboardEnErreur: boolean
  chargerEspaceCooperateur: (cooperateurId: string, sections?: SectionEspace[]) => Promise<void>
  chargerMaCooperative: (merchantId: string) => Promise<void>
  chargerAnnuaire: (merchantId?: string) => Promise<void>

  // Dashboard (MODE-975 — consommateur du MODE-972)
  /** Charge (ou recharge) l'agrégat dashboard. `periode` absent → la
   * fenêtre courante est conservée (rechargement sans saut de fenêtre). */
  chargerDashboard: (cooperateurId: string, periode?: PeriodeDashboard) => Promise<void>

  // Fiche membre (MODE-976 — G3/G10)
  /** Sélectionne le membre pour la fiche drill-down (null = refermer). */
  selectionnerMembre: (membreId: string | null) => void

  /** MODE-979 (DET-COOP-008) — le président choisit la commune de SA
   * coopérative dans le référentiel GPS (41 communes). Écriture en file
   * offline ('cooperative-commune', rejeu verbatim) ; l'optimiste utilise
   * le nom de l'annuaire choisi (le payload en file reste minimal). */
  changerCommuneCooperative: (cooperateurId: string, communeId: string, communeNom?: string) => Promise<StatutSync>

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
  /** MODE-942 (AUDIT-003 I-06) — clôture LOCALE d'un besoin déjà clôturé
   * SERVEUR par la RPC coop_distribuer_stock (même transaction que le
   * mouvement de stock). Aucun réseau : le fait est certain côté serveur,
   * ici on aligne seulement l'affichage. */
  marquerBesoinLivre: (besoinId: string) => void
  consoliderBesoins: (cooperateurId: string, groupe?: { produit: string; unite: string }) => Promise<StatutSync>

  // Marchand
  rejoindreCooperative: (merchantId: string, cooperativeId: string) => Promise<StatutSync>
  payerCotisation: (
    merchantId: string,
    montant: number,
    canal?: CanalCotisation
  ) => Promise<StatutSync>

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
  // MODE-974 — compteur de validation trésorerie absent au départ
  // (réel ou rien, comme le solde).
  ecrituresEnAttente: 0,
  // MODE-946 — score coopérative absent au départ (jamais inventé).
  scoreJulaba: null,
  sectionsEnErreur: [],
  // MODE-975 — dashboard jamais chargé au départ (null, pas d'agrégat vide
  // fabriqué) ; la fenêtre par défaut est 7 jours (actionnable sur mobile,
  // le 30 j reste un zoom explicite).
  dashboard: null,
  periodeDashboard: '7j',
  // MODE-976 — aucune fiche membre ouverte au départ.
  membreSelectionneId: null,
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
      dashboardChargement: false,
      dashboardEnErreur: false,

      // ── Chargements ───────────────────────────────────────────────────
      chargerEspaceCooperateur: async (cooperateurId, sections) => {
        // MODE-951 (PF-05) — seules les sections DEMANDÉES sont lues
        // (défaut : tout, pour l'accueil et le bouton Réessayer).
        const voulues = sections && sections.length > 0 ? sections : TOUTES_SECTIONS
        const veut = (s: SectionEspace) => voulues.includes(s)
        const q = encodeURIComponent(cooperateurId)
        set({ loading: true, loadError: null, sectionsEnErreur: [] })
        try {
          // MODE-946 (AUDIT-003 D-2, F-14) — le score JULABA de la
          // COOPÉRATIVE (scoreCooperateur) est lu avec le reste de l'espace :
          // calculé depuis MODE-932 mais jamais affiché au président.
          // 404 (aucune coop) → null : jamais de score inventé.
          const [resumeData, membresData, tresorerieData, stockData, besoinsData, scoreData] = await Promise.all([
            veut('resume') ? fetch(`/api/cooperatives?cooperateurId=${q}`).then((r) => r.json().then((d) => ({ ok: r.ok, d })).catch(() => ({ ok: false, d: null }))) : Promise.resolve(null),
            veut('membres') ? fetch(`/api/cooperatives/membres?cooperateurId=${q}`).then((r) => r.json().then((d) => ({ ok: r.ok, d })).catch(() => ({ ok: false, d: null }))) : Promise.resolve(null),
            veut('tresorerie') ? fetch(`/api/cooperatives/tresorerie?cooperateurId=${q}`).then((r) => r.json().then((d) => ({ ok: r.ok, d })).catch(() => ({ ok: false, d: null }))) : Promise.resolve(null),
            veut('stock') ? fetch(`/api/cooperatives/stock?cooperateurId=${q}`).then((r) => r.json().then((d) => ({ ok: r.ok, d })).catch(() => ({ ok: false, d: null }))) : Promise.resolve(null),
            veut('besoins') ? fetch(`/api/cooperatives/besoins?cooperateurId=${q}`).then((r) => r.json().then((d) => ({ ok: r.ok, d })).catch(() => ({ ok: false, d: null }))) : Promise.resolve(null),
            veut('score') ? fetch(`/api/scores/me?cooperateurId=${q}`).then((r) => r.json().then((d) => ({ ok: r.ok, d })).catch(() => ({ ok: false, d: null }))) : Promise.resolve(null),
          ])
          // Toutes les lectures passent par requirePresident côté serveur —
          // une seule session (cooperateur) pilote les requêtes.
          if (resumeData && !resumeData.ok) {
            throw new ErreurMetier((resumeData.d?.erreur as string) || 'Chargement impossible')
          }

          // MODE-951 (I-13) — les échecs de sections secondaires ne sont plus
          // avalés en zéros inventés (fin du solde 0 silencieux) : la section
          // en erreur est ANNONCÉE et ses données précédentes restent
          // affichées (pas d'écrasement par des vides).
          const echecs: SectionEspace[] = []
          if (membresData && !membresData.ok) echecs.push('membres')
          if (tresorerieData && !tresorerieData.ok) echecs.push('tresorerie')
          if (stockData && !stockData.ok) echecs.push('stock')
          if (besoinsData && !besoinsData.ok) echecs.push('besoins')
          if (scoreData && !scoreData.ok) echecs.push('score')

          set((s) => ({
            ...(resumeData?.ok && resumeData.d ? { cooperative: resumeData.d.cooperative, resume: resumeData.d.resume } : {}),
            ...(membresData?.ok && membresData.d ? { membres: membresData.d.membres ?? [] } : {}),
            ...(tresorerieData?.ok && tresorerieData.d
              ? {
                  transactions: tresorerieData.d.transactions ?? [],
                  solde: tresorerieData.d.solde ?? 0,
                  totalCotisations: tresorerieData.d.totalCotisations ?? 0,
                  // MODE-974 (G16) — le compteur serveur est enfin consommé
                  // (badge de l'onglet Trésorerie).
                  ecrituresEnAttente: typeof tresorerieData.d.enAttente === 'number' ? tresorerieData.d.enAttente : 0,
                }
              : {}),
            ...(stockData?.ok && stockData.d ? { stock: stockData.d.stock ?? [] } : {}),
            ...(besoinsData?.ok && besoinsData.d ? { besoins: besoinsData.d.besoins ?? [], groupes: besoinsData.d.groupes ?? [] } : {}),
            ...(scoreData?.ok && scoreData?.d && typeof scoreData.d.score === 'number' && scoreData.d.niveau
              ? { scoreJulaba: { score: scoreData.d.score, niveau: scoreData.d.niveau } }
              : {}),
            sectionsEnErreur: echecs,
            loading: false,
          }))
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

      // ── Fiche membre (MODE-976 — G3/G10) ─────────────────────────────
      selectionnerMembre: (membreId) => set({ membreSelectionneId: membreId }),

      // ── Dashboard (MODE-975 — un seul aller-retour, agrégat MODE-972) ──
      chargerDashboard: async (cooperateurId, periode) => {
        const periodeVoulue: PeriodeDashboard = periode ?? get().periodeDashboard
        const jours = periodeVoulue === '7j' ? 7 : 30
        const q = encodeURIComponent(cooperateurId)
        set({ dashboardChargement: true })
        try {
          const res = await fetch(`/api/cooperatives/dashboard?cooperateurId=${q}&jours=${jours}`)
          const data = await res.json().catch(() => null)
          if (!res.ok || !data) {
            throw new ErreurMetier((data?.erreur as string) || 'Synthèse indisponible')
          }
          set({
            dashboard: data as DashboardCoop,
            periodeDashboard: periodeVoulue,
            dashboardChargement: false,
            dashboardEnErreur: false,
          })
        } catch {
          // Offline-first : le dernier agrégat connu reste affiché (pas
          // d'écrasement par null — même discipline que les sections en
          // erreur du chargement sectionné). L'erreur est annoncée par le
          // flag ; le prochain passage en ligne rafraîchira genereLe.
          set({ dashboardChargement: false, dashboardEnErreur: true })
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
      // MODE-977 (AUDIT-007 G9) — les DÉCISIONS de gestion rejoignent la
      // file offline : même contrat syncOrQueue que les écritures (POST
      // « synced | queued | lost »), entité dédiée par décision et payload
      // AUTOPORTEUR (l'id cible voyage dans le payload — le rejeu offline
      // reconstruit l'URL exacte, cf. sync-handlers.ts). La mutation
      // optimiste est appliquée pour synced ET queued (hors ligne, le
      // président voit sa décision ; un rejet définitif au rejeu serait
      // enregistré comme conflit et corrigé au prochain chargement), jamais
      // pour lost ni pour un 4xx live (rejet métier — l'état local reste
      // véridique).
      ajouterMarchand: async (cooperateurId, marchandId) => {
        try {
          // Rejeu : 409 (marchand déjà admis) = conflit définitif propre,
          // jamais de doublon (check serveur avant insertion).
          const statut = await syncOrQueue('cooperative-membre-ajout', '/api/cooperatives/membres', 'POST', {
            cooperateurId,
            marchandId,
          })
          if (statut === 'synced') {
            await get().chargerEspaceCooperateur(cooperateurId)
          }
          return statut
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
          // Rejeu : PATCH idempotent (re-set du même statut no-op 200) ;
          // 404 = membre exclu entre-temps → conflit définitif propre.
          const statutSync = await syncOrQueue(
            'cooperative-membre-statut',
            `/api/cooperatives/membres/${encodeURIComponent(membreId)}`,
            'PATCH',
            { cooperateurId, membreId, statut, motif },
          )
          // Optimiste POUR synced ET queued seulement : en lost (file
          // pleine), l'état local reste véridique — aucune décision fantôme.
          if (statutSync !== 'lost') {
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
          }
          return statutSync
        } catch (error) {
          const message = error instanceof ErreurMetier ? error.message : 'Action impossible'
          set({ syncError: message })
          throw error
        }
      },

      changerRoleMembre: async (cooperateurId, membreId, role) => {
        try {
          // Rejeu : PATCH idempotent (même logique que le statut).
          const statutSync = await syncOrQueue(
            'cooperative-membre-role',
            `/api/cooperatives/membres/${encodeURIComponent(membreId)}`,
            'PATCH',
            { cooperateurId, membreId, role },
          )
          if (statutSync !== 'lost') {
            set((state) => ({
              membres: state.membres.map((m) => (m.id === membreId ? { ...m, role } : m)),
            }))
          }
          return statutSync
        } catch (error) {
          const message = error instanceof ErreurMetier ? error.message : 'Action impossible'
          set({ syncError: message })
          throw error
        }
      },

      exclureMembre: async (cooperateurId, membreId) => {
        try {
          // La route DELETE lit le QUERY string : l'URL live le porte et le
          // payload transporte les ids pour que le rejeu reconstruise la
          // MÊME URL (handler verbatim). 404 au rejeu = déjà exclu →
          // conflit définitif propre.
          const statutSync = await syncOrQueue(
            'cooperative-membre-exclusion',
            `/api/cooperatives/membres/${encodeURIComponent(membreId)}?cooperateurId=${encodeURIComponent(cooperateurId)}`,
            'DELETE',
            { cooperateurId, membreId },
          )
          if (statutSync !== 'lost') {
            set((state) => ({
              membres: state.membres.filter((m) => m.id !== membreId),
              // La fiche ouverte peut être celle qu'on vient d'exclure — le
              // repli honnête de l'écran (G3) prend le relais.
              membreSelectionneId: state.membreSelectionneId === membreId ? null : state.membreSelectionneId,
            }))
          }
          return statutSync
        } catch (error) {
          const message = error instanceof ErreurMetier ? error.message : 'Exclusion impossible'
          set({ syncError: message })
          throw error
        }
      },

      // ── Commune de la coopérative (MODE-979, DET-COOP-008) ──────────
      changerCommuneCooperative: async (cooperateurId, communeId, communeNom) => {
        try {
          // En file offline (G9 — toute décision de gestion survit au
          // hors-ligne) : le payload en file reste MINIMAL (les ids — le
          // rejeu reconstruit l'URL et le body verbatim), l'affichage
          // optimiste utilise le nom choisi dans l'annuaire.
          const statutSync = await syncOrQueue(
            'cooperative-commune',
            `/api/cooperatives/commune?cooperateurId=${encodeURIComponent(cooperateurId)}`,
            'PATCH',
            { cooperateurId, communeId },
          )
          if (statutSync !== 'lost' && communeNom != null) {
            set((state) => ({
              cooperative: state.cooperative
                ? { ...state.cooperative, commune: communeNom, communeId }
                : state.cooperative,
            }))
          }
          return statutSync
        } catch (error) {
          const message = error instanceof ErreurMetier ? error.message : 'Choix impossible'
          set({ syncError: message })
          throw error
        }
      },

      // ── Trésorerie ───────────────────────────────────────────────────
      ajouterTransaction: async (cooperateurId, tx) => {
        // MODE-935 (I-08) — clientId d'idempotence : le rejeu offline rejoue
        // le MÊME payload, la route reconnaît son écriture (200 rejeu) au
        // lieu de doubler l'écriture après un crash post-commit.
        const statut = await syncOrQueue('cooperative-transaction', '/api/cooperatives/tresorerie', 'POST', {
          cooperateurId,
          clientId: nouvelleIdempotence(),
          ...tx,
        })
        if (statut === 'synced') {
          await get().chargerEspaceCooperateur(cooperateurId)
        }
        return statut
      },

      changerStatutTransaction: async (cooperateurId, transactionId, statut) => {
        try {
          // MODE-977 (G9) — en file ; le rejeu d'une écriture DÉJÀ traitée
          // rend 409 (immutabilité serveur) = conflit définitif propre :
          // jamais une double validation.
          const statutSync = await syncOrQueue(
            'cooperative-transaction-statut',
            `/api/cooperatives/tresorerie/${encodeURIComponent(transactionId)}`,
            'PATCH',
            { cooperateurId, transactionId, statut },
          )
          if (statutSync !== 'lost') {
            set((state) => ({
              transactions: state.transactions.map((t) =>
                t.id === transactionId ? { ...t, statut } : t
              ),
            }))
          }
          // Le solde change — rechargement RÉSEAU seulement : en queued,
          // recharger réécraserait la décision locale par des données
          // serveur qui ne la connaissent pas encore.
          if (statutSync === 'synced') {
            await get().chargerEspaceCooperateur(cooperateurId, ['resume', 'tresorerie'])
          }
          return statutSync
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
        // MODE-935 (I-08) — clientId d'idempotence (même contrat que la
        // trésorerie) : le rejeu ne recrée jamais le besoin.
        const statut = await syncOrQueue('cooperative-besoin', '/api/cooperatives/besoins', 'POST', {
          merchantId,
          clientId: nouvelleIdempotence(),
          ...besoin,
        })
        if (statut === 'synced') {
          await get().chargerMaCooperative(merchantId)
        }
        return statut
      },

      marquerBesoinLivre: (besoinId) => {
        set((state) => ({
          besoins: state.besoins.map((b) =>
            b.id === besoinId ? { ...b, statut: 'livre' as const } : b
          ),
        }))
      },

      traiterBesoin: async (cooperateurId, besoinId, updates) => {
        try {
          // MODE-977 (G9) — dispatch en file (PATCH idempotent : le rejeu
          // re-pose les mêmes champs, no-op 200).
          const statutSync = await syncOrQueue(
            'cooperative-besoin-traitement',
            `/api/cooperatives/besoins/${encodeURIComponent(besoinId)}`,
            'PATCH',
            { cooperateurId, besoinId, ...updates },
          )
          if (statutSync !== 'lost') {
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
          }
          return statutSync
        } catch (error) {
          const message = error instanceof ErreurMetier ? error.message : 'Action impossible'
          set({ syncError: message })
          throw error
        }
      },

      consoliderBesoins: async (cooperateurId, groupe) => {
        try {
          // MODE-977 (G9) — consolidation en file ; le rejeu rend 200 avec
          // nbConsolides: 0 (l'update ne cible que les en_attente restants).
          const statutSync = await syncOrQueue(
            'cooperative-besoins-consolidation',
            '/api/cooperatives/besoins/consolider',
            'POST',
            { cooperateurId, ...groupe },
          )
          if (statutSync !== 'lost') {
            set((state) => ({
              besoins: state.besoins.map((b) =>
                b.statut === 'en_attente' &&
                (!groupe || (b.produit.toLowerCase() === groupe.produit.toLowerCase() && b.unite.toLowerCase() === groupe.unite.toLowerCase()))
                  ? { ...b, statut: 'consolide' }
                  : b
              ),
            }))
          }
          return statutSync
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

      payerCotisation: async (merchantId, montant, canal = 'especes') => {
        // MODE-935 (I-08/I-11) — clientId d'idempotence : le rejeu d'une
        // cotisation déjà commitée rend 200 (rejeu) au lieu d'un 409
        // interprété comme conflit ; le montant reste imposé par la
        // constante partagée côté serveur.
        // MODE-986 (DET-COOP-003) — le canal voyage avec la requête :
        // 'especes' (déclaration étiquetée, voie historique) ou 'keiwa'
        // (débit du portefeuille DANS la transaction SQL serveur). Un 400
        // « Solde insuffisant » est un rejet MÉTIER : syncOrQueue le jette
        // en ErreurMetier (jamais en file — le rejeu serait refusé pareil)
        // et l'écran le parle tel quel.
        const statut = await syncOrQueue('cooperative-cotisation', '/api/cooperatives/cotisation', 'POST', {
          merchantId,
          clientId: nouvelleIdempotence(),
          montant,
          canal,
        })
        if (statut === 'synced') {
          await get().chargerMaCooperative(merchantId)
        }
        return statut
      },

      reset: () =>
        set({
          ...VIDE,
          loading: false,
          loadError: null,
          syncError: null,
          dashboardChargement: false,
          dashboardEnErreur: false,
        }),
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
        // MODE-974 (G16) — dernière valeur connue du compteur de validation
        // (le badge reste honnête au redémarrage, sans rechargement forcé).
        ecrituresEnAttente: state.ecrituresEnAttente,
        // MODE-975 — dernier agrégat dashboard connu + fenêtre choisie :
        // hors ligne, les widgets montrent la synthèse AVEC sa date.
        dashboard: state.dashboard,
        periodeDashboard: state.periodeDashboard,
        // MODE-976 (G10) — fiche ouverte conservée : le retour matériel
        // Android ne perd plus le contexte de navigation.
        membreSelectionneId: state.membreSelectionneId,
        stock: state.stock,
        besoins: state.besoins,
        groupes: state.groupes,
        annuaire: state.annuaire,
        maCooperative: state.maCooperative,
      }),
    }
  )
)
