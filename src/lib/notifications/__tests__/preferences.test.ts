import { describe, it, expect, beforeEach, vi } from 'vitest'

// Les préférences dépendent de l'app-store (rôle + téléphone) et du
// localStorage — les deux sont simulés ici, sans jamais toucher Supabase.

let backingStore: Record<string, string>

vi.stubGlobal('localStorage', {
  getItem: (key: string) => backingStore[key] ?? null,
  setItem: (key: string, value: string) => { backingStore[key] = value },
  removeItem: (key: string) => { delete backingStore[key] },
  clear: () => { backingStore = {} },
})

vi.mock('@/lib/stores/app-store', () => ({
  useAppStore: {
    getState: () => ({
      userRole: 'marchand',
      merchantPhone: '0701020304',
      merchantId: 'm1',
      isAuthenticated: true,
    }),
  },
}))

import {
  getNotificationPrefs, setNotificationPrefs, updateCategoryPref,
  setToastsEnabled, setKeepHistory, setSilentUntil, resetNotificationPrefs,
  categoryLabel, categoriesForRole, isNotificationHiddenForPrefs,
} from '../preferences'

beforeEach(() => {
  backingStore = {}
})

describe('getNotificationPrefs', () => {
  it('returns all-on defaults when nothing is stored', () => {
    const prefs = getNotificationPrefs()
    expect(prefs.categories.vente).toBe('on')
    expect(prefs.categories.securite).toBe('on')
    expect(prefs.toastsEnabled).toBe(true)
    expect(prefs.keepHistory).toBe(true)
    expect(prefs.silentUntil).toBeNull()
  })

  it('round-trips a stored v2 object', () => {
    const prefs = getNotificationPrefs()
    prefs.categories.stock = 'important'
    prefs.toastsEnabled = false
    setNotificationPrefs(prefs)
    const reloaded = getNotificationPrefs()
    expect(reloaded.categories.stock).toBe('important')
    expect(reloaded.toastsEnabled).toBe(false)
  })

  it('migrates legacy marchand profile toggles on first read', () => {
    backingStore['julaba-profile-0701020304'] = JSON.stringify({
      preferences: { notifications: { tontines: false, systeme: false } },
    })
    const prefs = getNotificationPrefs()
    expect(prefs.categories.tontine).toBe('off')
    expect(prefs.categories.synchronisation).toBe('off')
    expect(prefs.categories.systeme).toBe('off')
    // La v2 n'a pas encore été écrite : le migrate reste un défaut.
    expect(backingStore['julaba-notif-prefs-v2-marchand-0701020304']).toBeUndefined()
  })

  it('migrates the legacy producteur "systeme" toggle', async () => {
    const { useAppStore } = await import('@/lib/stores/app-store')
    vi.mocked(useAppStore.getState, true)
    const original = useAppStore.getState
    useAppStore.getState = () => ({ ...original(), userRole: 'producteur' }) as ReturnType<typeof original>
    try {
      backingStore['julaba-notif-prefs-producteur-0701020304'] = JSON.stringify({ systeme: false })
      const prefs = getNotificationPrefs()
      expect(prefs.categories.synchronisation).toBe('off')
      expect(prefs.categories.systeme).toBe('off')
      expect(prefs.categories.vente).toBe('on')
    } finally {
      useAppStore.getState = original
    }
  })
})

describe('mutations', () => {
  it('updateCategoryPref persists the new value', () => {
    updateCategoryPref('stock', 'important')
    expect(getNotificationPrefs().categories.stock).toBe('important')
  })

  it('setToastsEnabled / setKeepHistory / setSilentUntil persist', () => {
    setToastsEnabled(false)
    setKeepHistory(false)
    setSilentUntil('2030-01-01T00:00:00.000Z')
    const prefs = getNotificationPrefs()
    expect(prefs.toastsEnabled).toBe(false)
    expect(prefs.keepHistory).toBe(false)
    expect(prefs.silentUntil).toBe('2030-01-01T00:00:00.000Z')
  })

  it('resetNotificationPrefs restores defaults', () => {
    updateCategoryPref('stock', 'off')
    setToastsEnabled(false)
    resetNotificationPrefs()
    const prefs = getNotificationPrefs()
    expect(prefs.categories.stock).toBe('on')
    expect(prefs.toastsEnabled).toBe(true)
  })
})

describe('helpers', () => {
  it('categoryLabel returns French labels', () => {
    expect(categoryLabel('vente')).toBe('Ventes')
    expect(categoryLabel('keiwa')).toBe('Portefeuille Keiwa')
  })

  it('categoriesForRole adapts to the role', () => {
    expect(categoriesForRole('producteur')).not.toContain('tontine')
    expect(categoriesForRole('producteur')).toContain('production')
    expect(categoriesForRole('identificateur')).toEqual(['synchronisation', 'securite', 'systeme'])
    expect(categoriesForRole('marchand')).toHaveLength(12)
  })

  it('isNotificationHiddenForPrefs respects category muting for toasts', () => {
    updateCategoryPref('stock', 'off')
    const low = { category: 'stock' as const, severity: 'warning' as const, priority: 'normal' as const }
    expect(isNotificationHiddenForPrefs(low, false)).toBe(true)
    expect(isNotificationHiddenForPrefs(low, true)).toBe(true)
    // Une erreur critique passe toujours.
    const critical = { category: 'stock' as const, severity: 'error' as const, priority: 'critical' as const }
    expect(isNotificationHiddenForPrefs(critical, true)).toBe(false)
  })
})
