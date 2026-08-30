import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../app-store'

describe('app-store', () => {
  beforeEach(() => {
    // Reset store state before each test using setState directly
    useAppStore.setState({
      hasCompletedOnboarding: false,
      isAuthenticated: false,
      merchantId: null,
      merchantName: null,
      merchantPhone: null,
      currentScreen: 'auth',
      previousScreen: null,
      userRole: 'marchand',
      soleilMode: false,
      voiceEnabled: true,
      voiceHistory: [],
      wakeWordEnabled: true,
      showVoiceModal: false,
      voiceModalKey: 0,
      showDaySummary: false,
      showCloseDay: false,
      voiceAutoRecord: false,
      voiceStopRequested: false,
    })
  })

  describe('onboarding', () => {
    it('devrait marquer onboarding comme complété', () => {
      const state = useAppStore.getState()
      state.completeOnboarding()
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(true)
    })

    it('devrait initialiser avec onboarding non complété', () => {
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(false)
    })
  })

  describe('userRole', () => {
    it('devrait initialiser avec le rôle marchand par défaut', () => {
      expect(useAppStore.getState().userRole).toBe('marchand')
    })

    it('devrait permettre de changer le rôle utilisateur', () => {
      const state = useAppStore.getState()
      state.setUserRole('identificateur')
      expect(useAppStore.getState().userRole).toBe('identificateur')
    })

    it('devrait accepter tous les rôles valides', () => {
      const roles = ['marchand', 'identificateur', 'backoffice', 'producteur'] as const
      roles.forEach((role) => {
        useAppStore.getState().setUserRole(role)
        expect(useAppStore.getState().userRole).toBe(role)
      })
    })
  })

  describe('navigation', () => {
    it('devrait naviguer vers un écran et garder le précédent', () => {
      const state = useAppStore.getState()
      state.navigate('home')
      expect(state.currentScreen).toBe('home')
      expect(state.previousScreen).toBe('auth')
    })

    it('devrait mettre à jour previousScreen lors de navigation multiple', () => {
      const state = useAppStore.getState()
      state.navigate('caisse')
      expect(state.previousScreen).toBe('auth')
      state.navigate('stock')
      expect(state.currentScreen).toBe('stock')
      expect(state.previousScreen).toBe('caisse')
    })

    it('devrait retourner à l\'écran précédent avec goBack', () => {
      const state = useAppStore.getState()
      state.navigate('caisse')
      state.goBack()
      expect(state.currentScreen).toBe('auth')
    })

    it('devrait aller à home si goBack sans previousScreen', () => {
      const state = useAppStore.getState()
      state.goBack()
      expect(state.currentScreen).toBe('home')
    })

    it('devrait retourner à auth si goBack vers auth screen quand authentifié', () => {
      const state = useAppStore.getState()
      state.setAuth('test-123', 'Moussa', '770000000')
      state.navigate('profil')
      state.navigate('auth')
      state.goBack()
      expect(state.currentScreen).toBe('home')
    })
  })

  describe('authentification', () => {
    it('devrait être non authentifié par défaut', () => {
      expect(useAppStore.getState().isAuthenticated).toBe(false)
    })

    it('devrait définir les données utilisateur lors de l\'auth', () => {
      const state = useAppStore.getState()
      state.setAuth('test-123', 'Moussa Diop', '770000000')
      expect(state.isAuthenticated).toBe(true)
      expect(state.merchantId).toBe('test-123')
      expect(state.merchantName).toBe('Moussa Diop')
      expect(state.merchantPhone).toBe('770000000')
    })

    it('devrait rediriger vers home après authentification pour marchand', () => {
      const state = useAppStore.getState()
      state.setAuth('test-123', 'Moussa', '770000000')
      expect(state.currentScreen).toBe('home')
    })

    it('devrait rediriger vers ident-home après authentification pour identificateur', () => {
      const state = useAppStore.getState()
      state.setUserRole('identificateur')
      state.setAuth('test-456', 'Fatou', '771111111')
      expect(state.currentScreen).toBe('ident-home')
    })

    it('devrait rediriger vers bo-dashboard après authentification pour backoffice', () => {
      const state = useAppStore.getState()
      state.setUserRole('backoffice')
      state.setAuth('test-789', 'Admin', '772222222')
      expect(state.currentScreen).toBe('bo-dashboard')
    })

    it('devrait rediriger vers prod-home après authentification pour producteur', () => {
      const state = useAppStore.getState()
      state.setUserRole('producteur')
      state.setAuth('test-101', 'Producteur', '773333333')
      expect(state.currentScreen).toBe('prod-home')
    })

    it('devrait réinitialiser l\'état lors du logout', () => {
      const state = useAppStore.getState()
      state.setAuth('test-123', 'Moussa', '770000000')
      state.logout()
      expect(state.isAuthenticated).toBe(false)
      expect(state.merchantId).toBe(null)
      expect(state.merchantName).toBe(null)
      expect(state.merchantPhone).toBe(null)
    })

    it('devrait rediriger vers auth screen lors du logout', () => {
      const state = useAppStore.getState()
      state.setAuth('test-123', 'Moussa', '770000000')
      state.logout()
      expect(state.currentScreen).toBe('auth')
    })

    it('devrait fermer les modals lors du logout', () => {
      const state = useAppStore.getState()
      state.setAuth('test-123', 'Moussa', '770000000')
      state.openVoiceModal()
      state.openCloseDay()
      state.toggleDaySummary()
      state.logout()
      expect(state.showVoiceModal).toBe(false)
      expect(state.showCloseDay).toBe(false)
      expect(state.showDaySummary).toBe(false)
    })
  })

  describe('UI state', () => {
    it('devrait initialiser soleilMode à false', () => {
      expect(useAppStore.getState().soleilMode).toBe(false)
    })

    it('devrait basculer soleilMode avec toggleSoleil', () => {
      const state = useAppStore.getState()
      state.toggleSoleil()
      expect(state.soleilMode).toBe(true)
      state.toggleSoleil()
      expect(state.soleilMode).toBe(false)
    })

    it('devrait ouvrir le voice modal', () => {
      const state = useAppStore.getState()
      const initialKey = state.voiceModalKey
      state.openVoiceModal()
      expect(state.showVoiceModal).toBe(true)
      expect(state.voiceModalKey).toBe(initialKey + 1)
    })

    it('devrait fermer le voice modal', () => {
      const state = useAppStore.getState()
      state.openVoiceModal()
      state.closeVoiceModal()
      expect(state.showVoiceModal).toBe(false)
    })

    it('ne devrait pas incrémenter voiceModalKey si déjà ouvert', () => {
      const state = useAppStore.getState()
      const initialKey = state.voiceModalKey
      state.openVoiceModal()
      state.openVoiceModal() // Double appel
      expect(state.voiceModalKey).toBe(initialKey + 1) // Devrait rester inchangé
    })

    it('devrait toggler day summary', () => {
      const state = useAppStore.getState()
      state.toggleDaySummary()
      expect(state.showDaySummary).toBe(true)
      state.toggleDaySummary()
      expect(state.showDaySummary).toBe(false)
    })

    it('devrait ouvrir et fermer close day modal', () => {
      const state = useAppStore.getState()
      state.openCloseDay()
      expect(state.showCloseDay).toBe(true)
      state.closeCloseDay()
      expect(state.showCloseDay).toBe(false)
    })
  })

  describe('voice state', () => {
    it('devrait initialiser voiceEnabled à true', () => {
      expect(useAppStore.getState().voiceEnabled).toBe(true)
    })

    it('devrait basculer voiceEnabled avec toggleVoice', () => {
      const state = useAppStore.getState()
      state.toggleVoice()
      expect(state.voiceEnabled).toBe(false)
      state.toggleVoice()
      expect(state.voiceEnabled).toBe(true)
    })

    it('devrait initialiser voiceAutoRecord à false', () => {
      expect(useAppStore.getState().voiceAutoRecord).toBe(false)
    })

    it('devrait définir voiceAutoRecord', () => {
      const state = useAppStore.getState()
      state.setVoiceAutoRecord(true)
      expect(state.voiceAutoRecord).toBe(true)
    })

    it('devrait demander l\'arrêt voice', () => {
      const state = useAppStore.getState()
      state.requestVoiceStop()
      expect(state.voiceStopRequested).toBe(true)
    })

    it('devrait initialiser wakeWordEnabled à true', () => {
      expect(useAppStore.getState().wakeWordEnabled).toBe(true)
    })

    it('devrait basculer wakeWordEnabled avec toggleWakeWord', () => {
      const state = useAppStore.getState()
      state.toggleWakeWord()
      expect(state.wakeWordEnabled).toBe(false)
      state.toggleWakeWord()
      expect(state.wakeWordEnabled).toBe(true)
    })

    it('devrait ajouter une entrée à l\'historique voice', () => {
      const state = useAppStore.getState()
      const entry = {
        id: 'entry-1',
        transcript: 'J\'ai vendu 5 sacs de riz',
        intent: 'sale',
        response: 'Vente enregistrée',
        timestamp: Date.now(),
      }
      state.addVoiceEntry(entry)
      expect(state.voiceHistory).toHaveLength(1)
      expect(state.voiceHistory[0]).toEqual(entry)
    })

    it('devrait limiter l\'historique voice à 20 entrées', () => {
      const state = useAppStore.getState()
      for (let i = 0; i < 25; i++) {
        state.addVoiceEntry({
          id: `entry-${i}`,
          transcript: `Transcript ${i}`,
          intent: 'sale',
          response: `Response ${i}`,
          timestamp: Date.now(),
        })
      }
      expect(state.voiceHistory).toHaveLength(20)
    })

    it('devrait garder les entrées les plus récentes en premier', () => {
      const state = useAppStore.getState()
      state.addVoiceEntry({
        id: 'entry-1',
        transcript: 'Premier',
        intent: 'sale',
        response: 'OK',
        timestamp: 1000,
      })
      state.addVoiceEntry({
        id: 'entry-2',
        transcript: 'Deuxième',
        intent: 'expense',
        response: 'OK',
        timestamp: 2000,
      })
      expect(state.voiceHistory[0].id).toBe('entry-2')
      expect(state.voiceHistory[1].id).toBe('entry-1')
    })
  })

  describe('persistance', () => {
    it('devrait avoir le bon nom de storage', () => {
      const store = useAppStore.persist
      expect(store.getOptions().name).toBe('julaba-app-store')
    })

    it('devrait partializer les bons états pour persistance', () => {
      const state = useAppStore.getState()
      const partialized = useAppStore.persist.getOptions().partialize?.(state)
      
      expect(partialized).toHaveProperty('hasCompletedOnboarding')
      expect(partialized).toHaveProperty('soleilMode')
      expect(partialized).toHaveProperty('voiceEnabled')
      expect(partialized).toHaveProperty('voiceHistory')
      expect(partialized).toHaveProperty('isAuthenticated')
      expect(partialized).toHaveProperty('merchantId')
      expect(partialized).toHaveProperty('merchantName')
      expect(partialized).toHaveProperty('merchantPhone')
      expect(partialized).toHaveProperty('wakeWordEnabled')
      expect(partialized).toHaveProperty('currentScreen')
      expect(partialized).toHaveProperty('userRole')
    })
  })

  describe('goBack edge cases', () => {
    it('devrait gérer goBack depuis auth screen quand non authentifié', () => {
      const state = useAppStore.getState()
      state.navigate('auth')
      state.goBack()
      // Devrait retourner à home car pas de previousScreen valide
      expect(state.currentScreen).toBe('home')
    })

    it('devrait gérer goBack depuis register screen', () => {
      const state = useAppStore.getState()
      state.navigate('register')
      state.goBack()
      expect(state.currentScreen).toBe('home')
    })
  })
})
