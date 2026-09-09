import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  // Photo (base64)
  photoBase64?: string
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

  // Mission
  mission: AgentMission
  setMission: (mission: AgentMission) => void

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
}

const generateDossierNumber = (dossiers: Dossier[]): string => {
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
      updateDossier: (id, updates) =>
        set((s) => ({
          dossiers: s.dossiers.map((d) =>
            d.id === id ? { ...d, ...updates, updatedAt: Date.now() } : d
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
                return {
                  id: crypto.randomUUID(),
                  actorType: 'marchand',
                  firstName: firstName || sd.actorName,
                  lastName: rest.join(' '),
                  phone: sd.phone,
                  activite: '',
                  zone: sd.zone,
                  status: sd.status,
                  rejectionReason: sd.rejectReason ?? undefined,
                  createdAt: new Date(sd.submittedAt).getTime(),
                  updatedAt: Date.now(),
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

      // Mission
      mission: { month: 7, year: 2026, target: 300 },
      setMission: (mission) => set({ mission }),

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
    }),
    {
      name: 'julaba-identificateur-store',
       partialize: (state) => ({
         // Dossiers and documents are sensitive server-owned data. Only
         // non-business agent preferences survive a page reload.
         agentZone: state.agentZone,
        agentMarche: state.agentMarche,
        mission: state.mission,
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

export const ACTIVITES = [
  'Culture maraîchère', 'Commerce de céréales', 'Vente de fruits & légumes',
  'Boucherie', 'Poissonnerie', 'Commerce de tissus', 'Quincaillerie',
  'Restauration', 'Transport', 'Élevage', 'Culture de cacao',
  'Culture de café', 'Production de riz', 'Culture vivrière',
  'Apiculture', 'Aviculture', 'Transformation agroalimentaire',
  'Autre',
]

export const PRODUITS = [
  'Tomates', 'Piment', 'Aubergine', 'Gombo', 'Igname',
  'Manioc', 'Banane', 'Riz', 'Maïs', 'Arachide',
  'Cacao', 'Café', 'Poisson', 'Viande', 'Tissus',
  'Céréales', 'Légumes feuilles', 'Fruits', 'Épices', 'Autre',
]
