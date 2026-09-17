import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MarchandCategorie } from '@/lib/marchand-categories'

export type ActorType = 'marchand' | 'producteur' | 'cooperative'
export type DossierStatus = 'brouillon' | 'en_attente' | 'valide' | 'rejete'

export interface GPSCoords {
  lat: number
  lon: number
  accuracy?: number
  timestamp: number
}

export interface Dossier {
  id: string
  // Actor info
  actorType: ActorType
  firstName: string
  lastName: string
  phone: string
  activite: string
  zone: string
  // Classification marchand (détaillant / semi-grossiste / grossiste) —
  // collectée à l'identité, requise quand actorType === 'marchand'.
  categorieMarchand?: MarchandCategorie
  // Photo (base64)
  photoBase64?: string
  // CNI scannée (étape 1 du wizard) : photos recto/verso en data URL +
  // numéros lus par OCR sur l'appareil. Les images restent locales au
  // dossier (jamais envoyées au serveur, comme photoBase64) ; les numéros
  // partent dans le payload d'enrôlement pour le backoffice.
  cniRecto?: string
  cniVerso?: string
  cniNumero?: string
  nni?: string
  // Complementary info
  dateNaissance?: string
  sexe?: 'masculin' | 'feminin' | 'autre'
  adresse?: string
  nbEmployes?: number
  chiffreAffaires?: number
  // Marchand specific
  nomCommerce?: string
  typeCommerce?: 'marche' | 'boutique' | 'ambulant'
  produitsPrincipaux?: string[]
  horaires?: string
  standEmplacement?: string
  photoEtal?: string
  // Producteur specific
  typeProduction?: 'culture' | 'elevage' | 'mixte'
  superficie?: number
  principalesCultures?: string[]
  nbCyclesAn?: number
  modeExploitation?: 'familial' | 'cooperatif' | 'individuel'
  accesIrrigation?: boolean
  // Cooperative specific
  nomCooperative?: string
  numeroEnregistrement?: string
  nbMembres?: number
  adresseSiege?: string
  president?: string
  domainesActivite?: string[]
  // GPS
  gps?: GPSCoords
  gpsStatus?: 'captured' | 'refused' | 'unavailable' | 'pending'
  gpsUnavailableReason?: string
  // Notes & documents
  notes?: string
  documents?: { name: string; base64: string; type: string; ocrText?: string }[]
  // Authentication credentials for the identified actor
  pinHash?: string
  patternHash?: string
  visualCodeHash?: string
  // Status
  status: DossierStatus
  rejectionReason?: string
  // Timestamps
  createdAt: number
  updatedAt: number
  submittedAt?: number
  validatedAt?: number
  validatedBy?: string
  // Agent info
  agentId: string
  agentName: string
  // Dossier number
  dossierNumber: string
}

export interface AgentMission {
  month: number // 0-11
  year: number
  target: number
}

interface IdentificateurState {
  // Dossiers
  dossiers: Dossier[]
  addDossier: (dossier: Dossier) => void
  updateDossier: (id: string, updates: Partial<Dossier>) => void
  deleteDossier: (id: string) => void
  getDossierById: (id: string) => Dossier | undefined
  getDossiersByStatus: (status: DossierStatus) => Dossier[]
  syncDossiersFromServer: (identificateurId: string) => Promise<void>

  // Agent info
  agentZone: string
  agentMarche: string
  setAgentZone: (zone: string) => void
  setAgentMarche: (marche: string) => void

  // Code agent unique attribué par le back-office à la création du compte
  // (JID-0001). Résolu au login via /api/identificateur/auth/lookup et
  // conservé pour l'affichage profil/missions.
  agentCode: string | null
  setAgentCode: (code: string | null) => void

  // Mission
  mission: AgentMission
  setMission: (mission: AgentMission) => void
  /** Source de la cible affichée : fixée par le BO (individuelle ou zone)
   * ou null tant que le serveur n'a pas répondu / repli local. */
  missionSource: 'identificateur' | 'zone' | null
  /** Récupère l'objectif du mois fixé par le back-office
   * (GET /api/identificateur/mission) — boucle complète BO -> terrain.
   * Hors ligne ou sans objectif BO, la cible locale persistée reste. */
  fetchMissionFromServer: (identificateurId: string) => Promise<void>

  // Screen sensitivity
  screenSensitive: boolean
  toggleScreenSensitive: () => void

  // Auto-lock
  autoLockMinutes: number
  setAutoLockMinutes: (m: number) => void

  // Screenshot blocked
  screenshotBlocked: boolean
  toggleScreenshotBlocked: () => void

  // Theme
  identDarkMode: boolean
  toggleIdentDarkMode: () => void

  // Search
  searchQuery: string
  setSearchQuery: (q: string) => void

  // Current identification form draft
  currentDraftId: string | null
  setCurrentDraftId: (id: string | null) => void

  // Status pill to pre-select when navigating into "Mes dossiers" from a
  // Home screen shortcut (e.g. tapping "Validé"). Read once by that
  // screen on mount, not persisted.
  dossiersFilterIntent: DossierStatus | 'tous' | null
  setDossiersFilterIntent: (filter: DossierStatus | 'tous' | null) => void

  // Zone to pre-filter "Mes dossiers" with when jumping there from the
  // Missions screen button (« Voir la liste des dossiers de la zone »).
  // Same one-shot contract as dossiersFilterIntent: consumed on mount,
  // never persisted.
  dossiersZoneIntent: string | null
  setDossiersZoneIntent: (zone: string | null) => void

  // Dossier affiché par l'écran « Détail du dossier » (ident-dossier-detail).
  // Non persisté : l'écran suit la navigation, jamais un rechargement.
  dossierDetailId: string | null
  setDossierDetailId: (id: string | null) => void
}

export const generateDossierNumber = (dossiers: Dossier[]): string => {
  const year = new Date().getFullYear()
  const count = dossiers.length + 1
  return `ID-${year}-${String(count).padStart(4, '0')}`
}

export const useIdentificateurStore = create<IdentificateurState>()(
  persist(
    (set, get) => ({
      // Dossiers
      dossiers: [],
      addDossier: (dossier) =>
        set((s) => ({
          dossiers: [{
            ...dossier,
            dossierNumber: generateDossierNumber(s.dossiers),
          }, ...s.dossiers],
        })),
      // A partial update never blanks an already-assigned dossierNumber: the
      // wizard screen re-sends its full local snapshot on every autosave,
      // and that snapshot's dossierNumber lags behind the one addDossier()
      // generated on the very first save (the local component state is
      // never told about it) — without this guard, that stale '' would
      // overwrite the real number on the very next autosave.
      updateDossier: (id, updates) =>
        set((s) => ({
          dossiers: s.dossiers.map((d) =>
            d.id === id
              ? { ...d, ...updates, dossierNumber: updates.dossierNumber || d.dossierNumber, updatedAt: Date.now() }
              : d
          ),
        })),
      deleteDossier: (id) =>
        set((s) => ({
          dossiers: s.dossiers.filter((d) => d.id !== id),
        })),
      getDossierById: (id) => get().dossiers.find((d) => d.id === id),
      getDossiersByStatus: (status) => get().dossiers.filter((d) => d.status === status),

      // Submission only ever wrote (POST) — this agent's app never learned
      // what happened after that, including a backoffice admin validating or
      // rejecting the dossier days later. Reconciles local dossiers (by
      // dossierNumber, matching the server's dossierId) with the server's
      // current status, and adds any server dossier with no local match
      // (e.g. submitted from a since-reinstalled device) so it's visible
      // here too. Brouillons never submitted have no server counterpart and
      // are left untouched.
      syncDossiersFromServer: async (identificateurId) => {
        try {
          const res = await fetch(`/api/identificateur/dossiers?identificateurId=${identificateurId}`)
          if (!res.ok) return
          const { dossiers: serverDossiers } = await res.json() as {
            dossiers: Array<{
              dossierId: string; actorName: string; zone: string; phone: string
              status: DossierStatus; validatedBy: string | null; rejectReason: string | null
              submittedAt: string; validatedAt: string | null
              // Renvoyé par select(*) de legacy_bo_enrolments ('marchand',
              // 'producteur', 'cooperatif') — conservé pour les badges de type
              // d'acteur de la liste ; 'cooperatif' est normalisé en 'cooperative'.
              actor_type?: string | null
            }>
          }

          set((s) => {
            const byDossierId = new Map(s.dossiers.map((d) => [d.dossierNumber, d]))
            const updated = s.dossiers.map((d) => {
              const server = serverDossiers.find((sd) => sd.dossierId === d.dossierNumber)
              if (!server) return d
              return {
                ...d,
                status: server.status,
                rejectionReason: server.rejectReason ?? undefined,
                validatedBy: server.validatedBy ?? undefined,
                validatedAt: server.validatedAt ? new Date(server.validatedAt).getTime() : undefined,
              }
            })
            const additions = serverDossiers
              .filter((sd) => !byDossierId.has(sd.dossierId))
              .map((sd): Dossier => {
                const [firstName, ...rest] = sd.actorName.split(' ')
                // Dernier événement connu du serveur (validation > soumission) :
                // un dossier ajouté depuis un autre appareil ne doit pas
                // prétendre qu'il vient d'être « mis à jour à l'instant ».
                const lastEvent = sd.validatedAt || sd.submittedAt
                const rawType = (sd.actor_type || 'marchand').toLocaleLowerCase()
                const actorType: Dossier['actorType'] = rawType === 'cooperatif' || rawType === 'cooperative'
                  ? 'cooperative'
                  : rawType === 'producteur'
                    ? 'producteur'
                    : 'marchand'
                return {
                  id: crypto.randomUUID(),
                  actorType,
                  firstName: firstName || sd.actorName,
                  lastName: rest.join(' '),
                  phone: sd.phone,
                  activite: '',
                  zone: sd.zone,
                  status: sd.status,
                  rejectionReason: sd.rejectReason ?? undefined,
                  createdAt: new Date(sd.submittedAt).getTime(),
                  updatedAt: lastEvent ? new Date(lastEvent).getTime() : Date.now(),
                  submittedAt: new Date(sd.submittedAt).getTime(),
                  validatedAt: sd.validatedAt ? new Date(sd.validatedAt).getTime() : undefined,
                  validatedBy: sd.validatedBy ?? undefined,
                  agentId: identificateurId,
                  agentName: get().dossiers[0]?.agentName ?? '',
                  dossierNumber: sd.dossierId,
                }
              })
            return { dossiers: [...additions, ...updated] }
          })
        } catch {
          // Offline or server error — keep local state as-is.
        }
      },

      // Agent info
      agentZone: 'Adjamé',
      agentMarche: 'Marché central',
      setAgentZone: (zone) => set({ agentZone: zone }),
      setAgentMarche: (marche) => set({ agentMarche: marche }),

      agentCode: null,
      setAgentCode: (code) => set({ agentCode: code }),

      // Mission
      mission: { month: 7, year: 2026, target: 300 },
      setMission: (mission) => set({ mission }),

      missionSource: null,
      fetchMissionFromServer: async (identificateurId) => {
        try {
          const res = await fetch(`/api/identificateur/mission?identificateurId=${encodeURIComponent(identificateurId)}`)
          if (!res.ok) return
          const data = await res.json() as { month?: number; year?: number; target?: number | null; source?: 'identificateur' | 'zone' | null; boDefined?: boolean }
          if (data.boDefined && typeof data.target === 'number' && data.target > 0 && typeof data.month === 'number' && typeof data.year === 'number') {
            // Ne remplace la mission que si elle porte sur le mois courant :
            // une réponse retardée pour un autre mois serait fausse ici.
            const now = new Date()
            if (data.month === now.getMonth() && data.year === now.getFullYear()) {
              set({ mission: { month: data.month, year: data.year, target: data.target }, missionSource: data.source ?? 'identificateur' })
            }
          } else {
            // Objectif non (encore) défini au BO : on garde la cible locale.
            set({ missionSource: null })
          }
        } catch {
          // Hors ligne : la mission persistée reste affichée.
        }
      },

      // Screen sensitivity
      screenSensitive: true,
      toggleScreenSensitive: () => set({ screenSensitive: !get().screenSensitive }),

      // Auto-lock
      autoLockMinutes: 15,
      setAutoLockMinutes: (m) => set({ autoLockMinutes: m }),

      // Screenshot blocked
      screenshotBlocked: true,
      toggleScreenshotBlocked: () => set({ screenshotBlocked: !get().screenshotBlocked }),

      identDarkMode: false,
      toggleIdentDarkMode: () => set({ identDarkMode: !get().identDarkMode }),

      // Search
      searchQuery: '',
      setSearchQuery: (q) => set({ searchQuery: q }),

      // Current draft
      currentDraftId: null,
      setCurrentDraftId: (id) => set({ currentDraftId: id }),

      dossiersFilterIntent: null,
      setDossiersFilterIntent: (filter) => set({ dossiersFilterIntent: filter }),

      dossiersZoneIntent: null,
      setDossiersZoneIntent: (zone) => set({ dossiersZoneIntent: zone }),

      dossierDetailId: null,
      setDossierDetailId: (id) => set({ dossierDetailId: id }),
    }),
    {
      name: 'julaba-identificateur-store',
       partialize: (state) => ({
         // Dossiers and documents are sensitive server-owned data. Only
         // non-business agent preferences survive a page reload.
         agentZone: state.agentZone,
        agentMarche: state.agentMarche,
        agentCode: state.agentCode,
        mission: state.mission,
        missionSource: state.missionSource,
        screenSensitive: state.screenSensitive,
        autoLockMinutes: state.autoLockMinutes,
        screenshotBlocked: state.screenshotBlocked,
        identDarkMode: state.identDarkMode,
      }),
    }
  )
)

// Helper: create a new empty dossier
export function createEmptyDossier(agentId: string, agentName: string): Dossier {
  return {
    id: crypto.randomUUID(),
    actorType: 'marchand',
    firstName: '',
    lastName: '',
    phone: '',
    activite: '',
    zone: '',
    status: 'brouillon',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    agentId,
    agentName,
    dossierNumber: '',
  }
}

// Zone options
export const ZONES = [
  'Adjamé', 'Cocody', 'Plateau', 'Abobo', 'Yopougon',
  'Bouaké', 'Daloa', 'San Pedro', 'Korhogo', 'Man',
  'Gagnoa', 'Divo', 'Soubré', 'Aboisso', 'Anyama',
]

// Activités SCINDÉES par type d'acteur : l'ancienne liste unique mélangeait
// cultures (producteurs) et commerces (marchands) et était affichée quel que
// soit le profil choisi. La liste d'un détaillant n'a rien à voir avec celle
// d'un maraîcher — chaque profil voit désormais la sienne. ACTIVITES reste
// exporté comme union pour l'affichage des anciens dossiers (backoffice,
// suivi) où le métier réel peut appartenir à l'un ou l'autre monde.
export const ACTIVITES_MARCHAND = [
  'Commerce de céréales', 'Vente de fruits & légumes',
  'Boucherie', 'Poissonnerie', 'Commerce de tissus', 'Quincaillerie',
  'Restauration', 'Transport', 'Transformation agroalimentaire',
  'Autre',
]

export const ACTIVITES_PRODUCTEUR = [
  'Culture maraîchère', 'Élevage', 'Culture de cacao',
  'Culture de café', 'Production de riz', 'Culture vivrière',
  'Apiculture', 'Aviculture',
  'Autre',
]

export const ACTIVITES = [...ACTIVITES_MARCHAND, ...ACTIVITES_PRODUCTEUR]
  .filter((value, index, self) => self.indexOf(value) === index)

/** Liste d'activités à proposer selon le type d'acteur du dossier. */
export function activitesPour(actorType: ActorType): string[] {
  if (actorType === 'marchand') return ACTIVITES_MARCHAND
  if (actorType === 'producteur') return ACTIVITES_PRODUCTEUR
  return ACTIVITES // coopérative : les deux mondes
}

export const PRODUITS = [
  'Tomates', 'Piment', 'Aubergine', 'Gombo', 'Igname',
  'Manioc', 'Banane', 'Riz', 'Maïs', 'Arachide',
  'Cacao', 'Café', 'Poisson', 'Viande', 'Tissus',
  'Céréales', 'Légumes feuilles', 'Fruits', 'Épices', 'Autre',
]
