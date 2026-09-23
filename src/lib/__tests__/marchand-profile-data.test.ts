import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MerchantProfile,
  defaultProfile,
  loadMerchantProfile,
  saveMerchantProfile,
  loadMerchantAuthData,
} from '@/lib/marchand-profile-data'

/**
 * Tests du modèle + persistance du profil marchand (MODE-991, DET-001
 * tranche 5). Les fonctions sont extraites VERBATIM de
 * profile-screen.tsx : elles lisent/écrivent localStorage directement.
 * Environnement vitest « node » → localStorage simulé en mémoire
 * (patron établi auth-multi / cooperatives-sync), + cas « storage qui
 * lève » pour prouver les try/catch silencieux.
 */
function makeStorage(opts: {
  initial?: Record<string, string>
  failGet?: boolean
  failSet?: boolean
} = {}) {
  const map = new Map(Object.entries(opts.initial ?? {}))
  return {
    getItem: (k: string) => {
      if (opts.failGet) throw new Error('storage indisponible')
      return map.has(k) ? (map.get(k) as string) : null
    },
    setItem: (k: string, v: string) => {
      if (opts.failSet) throw new Error('storage indisponible')
      map.set(k, v)
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => void map.clear(),
  }
}

const CLE = 'julaba-profile-0701020304'

beforeEach(() => {
  vi.stubGlobal('localStorage', makeStorage())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('defaultProfile', () => {
  it('garde la forme figée du profil vierge', () => {
    expect(defaultProfile.firstName).toBe('')
    expect(defaultProfile.preferences.volume).toBe(100)
    expect(defaultProfile.preferences.textSize).toBe(1)
    expect(defaultProfile.preferences.voiceConfirmation).toBe('always')
    expect(defaultProfile.preferences.notifications).toEqual({ tontines: true, systeme: true })
    expect(defaultProfile.commerce.hours).toBe('06:00 - 18:00')
    expect(defaultProfile.commerce.days).toEqual(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'])
    expect(defaultProfile.connectionHistory).toEqual([])
  })

  it('date memberSince au format ISO du jour (évaluée au chargement du module)', () => {
    expect(defaultProfile.memberSince).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('loadMerchantProfile', () => {
  it('retourne le profil par défaut quand la clé est absente', () => {
    expect(loadMerchantProfile('0701020304')).toEqual(defaultProfile)
  })

  it('fusionne le profil sauvegardé partiel sur les défauts (spread superficiel)', () => {
    localStorage.setItem(CLE, JSON.stringify({ firstName: 'Awa' }))
    const p = loadMerchantProfile('0701020304')
    expect(p.firstName).toBe('Awa')
    // champs absents du saved : ceux du défaut
    expect(p.preferences.volume).toBe(100)
    expect(p.commerce.hours).toBe('06:00 - 18:00')
  })

  it('normalise le téléphone en ne gardant que les chiffres pour la clé', () => {
    localStorage.setItem('julaba-profile-0701020304', JSON.stringify({ firstName: 'Kouadio' }))
    // espaces retirés par le replace [^\d] → mêmes chiffres que la clé
    expect(loadMerchantProfile('07 01 02 03 04').firstName).toBe('Kouadio')
    // ATTENTION comportement verbatim : le « +225 » N'EST PAS retiré ici
    // (contrairement à normalizeAuthPhone) — les chiffres 225 restent,
    // donc la clé diffère : lire depuis +225… ne voit PAS ce cache
    expect(loadMerchantProfile('+2250701020304').firstName).toBe('')
    // …et un cache stocké sous 225… est bien lu depuis la saisie +225…
    localStorage.setItem('julaba-profile-2250701020304', JSON.stringify({ firstName: 'Awa' }))
    expect(loadMerchantProfile('+2250701020304').firstName).toBe('Awa')
  })

  it('storage qui lève → profil par défaut (try/catch silencieux)', () => {
    vi.stubGlobal('localStorage', makeStorage({ failGet: true }))
    expect(loadMerchantProfile('0701020304')).toEqual(defaultProfile)
  })

  it('JSON invalide → profil par défaut (try/catch silencieux)', () => {
    localStorage.setItem(CLE, '{pas du json')
    expect(loadMerchantProfile('0701020304')).toEqual(defaultProfile)
  })

  it('retourne une copie : muter le résultat ne touche pas le storage', () => {
    localStorage.setItem(CLE, JSON.stringify({ firstName: 'Awa' }))
    const p = loadMerchantProfile('0701020304')
    p.firstName = 'Muté'
    expect(JSON.parse(localStorage.getItem(CLE) as string).firstName).toBe('Awa')
  })
})

describe('saveMerchantProfile', () => {
  it('écrit le profil JSON-stringifié à la clé normalisée', () => {
    const profil: MerchantProfile = {
      ...defaultProfile,
      firstName: 'Awa',
      market: 'Adjamé',
    }
    saveMerchantProfile('07 01 02 03 04', profil)
    const brut = localStorage.getItem('julaba-profile-0701020304')
    expect(brut).toBeTruthy()
    const lu = JSON.parse(brut as string) as MerchantProfile
    expect(lu.firstName).toBe('Awa')
    expect(lu.market).toBe('Adjamé')
    expect(lu.preferences.volume).toBe(100)
  })

  it('storage qui lève → silencieux, jamais de throw', () => {
    vi.stubGlobal('localStorage', makeStorage({ failSet: true }))
    expect(() => saveMerchantProfile('0701020304', defaultProfile)).not.toThrow()
  })
})

describe('loadMerchantAuthData', () => {
  it('retourne null quand le cache marchand est absent', () => {
    expect(loadMerchantAuthData('0701020304')).toBeNull()
  })

  it('lit authMethod du cache marchand (clé julaba-merchant-<tel>)', () => {
    localStorage.setItem('julaba-merchant-0701020304', JSON.stringify({ authMethod: 'pattern', pinHash: 'x' }))
    expect(loadMerchantAuthData('0701020304')).toEqual({ authMethod: 'pattern' })
  })

  it('cache sans authMethod → fallback « pin » (data.authMethod || pin)', () => {
    localStorage.setItem('julaba-merchant-0701020304', JSON.stringify({ pinHash: 'x' }))
    expect(loadMerchantAuthData('0701020304')).toEqual({ authMethod: 'pin' })
  })

  it('authMethod vide → fallback « pin »', () => {
    localStorage.setItem('julaba-merchant-0701020304', JSON.stringify({ authMethod: '' }))
    expect(loadMerchantAuthData('0701020304')).toEqual({ authMethod: 'pin' })
  })

  it('JSON invalide → null (try/catch silencieux)', () => {
    localStorage.setItem('julaba-merchant-0701020304', '###')
    expect(loadMerchantAuthData('0701020304')).toBeNull()
  })

  it('normalise le téléphone en ne gardant que les chiffres (225 conservé, verbatim)', () => {
    localStorage.setItem('julaba-merchant-2250701020304', JSON.stringify({ authMethod: 'pattern' }))
    expect(loadMerchantAuthData('+225 07 01 02 03 04')).toEqual({ authMethod: 'pattern' })
    localStorage.setItem('julaba-merchant-0701020304', JSON.stringify({ authMethod: 'pin' }))
    expect(loadMerchantAuthData('07 01 02 03 04')).toEqual({ authMethod: 'pin' })
  })
})
