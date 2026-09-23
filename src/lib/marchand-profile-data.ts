// MODE-991 (DET-001 tranche 5) — modèle et persistance du profil
// marchand, déplacés VERBATIM de profile-screen.tsx (preuve
// octet-pour-octet via le script de chirurgie persisté) ;
// comportement inchangé. Substitution documentée : déclarations
// « export »ées (fichier monolithique -> lib consommée par les modules
// src/components/marchand/profile/*). Clé localStorage
// « julaba-profile-<tel> » inchangée (miroir documenté dans
// src/lib/notification-preferences.ts).

export interface MerchantProfile {
  firstName: string
  lastName: string
  nickname: string
  market: string
  commune: string
  ville: string
  activity: string
  experience: number
  preferences: {
    volume: number
    textSize: number
    notifications: Record<string, boolean>
    voiceConfirmation: 'always' | 'never' | 'high-amount'
  }
  commerce: {
    name: string
    type: string
    products: string[]
    hours: string
    days: string[]
  }
  photoDataUrl?: string
  memberSince: string
  connectionHistory: { date: string; method: string }[]
}

export const defaultProfile: MerchantProfile = {
  firstName: '',
  lastName: '',
  nickname: '',
  market: '',
  commune: '',
  ville: '',
  activity: '',
  experience: 0,
  preferences: {
    volume: 100,
    textSize: 1,
    notifications: {
      tontines: true,
      systeme: true,
    },
    voiceConfirmation: 'always',
  },
  commerce: {
    name: '',
    type: '',
    products: [],
    hours: '06:00 - 18:00',
    days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
  },
  memberSince: new Date().toISOString().split('T')[0],
  connectionHistory: [],
}

export function loadMerchantProfile(phone: string): MerchantProfile {
  const normalized = phone.replace(/[^\d]/g, '')
  try {
    const raw = localStorage.getItem(`julaba-profile-${normalized}`)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<MerchantProfile>
      return { ...defaultProfile, ...saved }
    }
  } catch {}
  return { ...defaultProfile }
}

export function saveMerchantProfile(phone: string, profile: MerchantProfile) {
  const normalized = phone.replace(/[^\d]/g, '')
  try {
    localStorage.setItem(`julaba-profile-${normalized}`, JSON.stringify(profile))
  } catch {}
}

export function loadMerchantAuthData(phone: string): { authMethod: string } | null {
  const normalized = phone.replace(/[^\d]/g, '')
  try {
    const raw = localStorage.getItem(`julaba-merchant-${normalized}`)
    if (raw) {
      const data = JSON.parse(raw)
      return { authMethod: data.authMethod || 'pin' }
    }
  } catch {}
  return null
}
