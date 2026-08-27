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
  // Notes & documents
  notes?: string
  documents?: { name: string; base64: string; type: string }[]
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

  // Search
  searchQuery: string
  setSearchQuery: (q: string) => void

  // Current identification form draft
  currentDraftId: string | null
  setCurrentDraftId: (id: string | null) => void
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

      // Search
      searchQuery: '',
      setSearchQuery: (q) => set({ searchQuery: q }),

      // Current draft
      currentDraftId: null,
      setCurrentDraftId: (id) => set({ currentDraftId: id }),
    }),
    {
      name: 'julaba-identificateur-store',
      partialize: (state) => ({
        dossiers: state.dossiers,
        agentZone: state.agentZone,
        agentMarche: state.agentMarche,
        mission: state.mission,
        screenSensitive: state.screenSensitive,
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
