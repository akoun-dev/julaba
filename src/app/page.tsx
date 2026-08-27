'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore, type ScreenRoute } from '@/lib/stores/app-store'
import { OnboardingScreen } from '@/components/marchand/onboarding-screen'
import { AuthScreen } from '@/components/marchand/auth-screen'
import { HomeScreen } from '@/components/marchand/home-screen'
import { CaisseScreen } from '@/components/marchand/caisse-screen'
import { StockScreen } from '@/components/marchand/stock-screen'
import { DepensesScreen } from '@/components/marchand/depenses-screen'
import { VentesScreen } from '@/components/marchand/ventes-screen'
import { BottomBar } from '@/components/marchand/bottom-bar'
import { VoiceModal } from '@/components/marchand/voice-modal'
import { WakeWordManager } from '@/components/marchand/wake-word-manager'
import { SplashScreen } from '@/components/marchand/splash-screen'
import {
  MarcheScreen,
  CommandesScreen,
  TontinesScreen,
  KeiwaScreen,
  AcademyScreen,
  SupportScreen,
  FideliteScreen,
  ProtectionSocialeScreen,
} from '@/components/marchand/secondary-screens'
import { ProfilScreen } from '@/components/marchand/profile-screen'

// Identificateur imports
import { IdentAuthScreen } from '@/components/identificateur/ident-auth-screen'
import { IdentHomeScreen } from '@/components/identificateur/ident-home-screen'
import { IdentBottomBar } from '@/components/identificateur/ident-bottom-bar'
import { IdentIdentificationScreen } from '@/components/identificateur/ident-identification-screen'
import { IdentSuiviScreen } from '@/components/identificateur/ident-suivi-screen'
import { IdentBrouillonsScreen } from '@/components/identificateur/ident-brouillons-screen'
import { IdentActeursScreen } from '@/components/identificateur/ident-acteurs-screen'
import { IdentStatistiquesScreen } from '@/components/identificateur/ident-statistiques-screen'
import { IdentRapportsScreen } from '@/components/identificateur/ident-rapports-screen'
import { IdentDashboardScreen } from '@/components/identificateur/ident-dashboard-screen'
import { IdentProfilScreen } from '@/components/identificateur/ident-profil-screen'

/**
 * Waits for Zustand persist to rehydrate from localStorage.
 * Prevents flash of wrong screen (onboarding/auth) on page load.
 */
function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    // Wait for Zustand persist to actually finish rehydrating
    const unsubFinish = useAppStore.persist.onFinishHydration(() => {
      setHydrated(true)
    })
    // Safety: if already hydrated (e.g. HMR), resolve immediately
    if (useAppStore.persist.hasHydrated()) {
      setHydrated(true)
    }
    return () => unsubFinish()
  }, [])
  return hydrated
}

// Helper to check if a screen route belongs to the Identificateur module
const isIdentScreen = (screen: ScreenRoute) => screen.startsWith('ident-')

type IdentScreenRoute = Exclude<ScreenRoute, 'ident-auth'>

function IdentScreenRouter() {
  const { currentScreen, soleilMode, isAuthenticated } = useAppStore()

  // Apply soleil mode
  useEffect(() => {
    if (soleilMode) {
      document.documentElement.classList.add('soleil')
      document.body.classList.add('soleil')
    } else {
      document.documentElement.classList.remove('soleil')
      document.body.classList.remove('soleil')
    }
  }, [soleilMode])

  // Safety net
  useEffect(() => {
    if (isAuthenticated && currentScreen === 'ident-auth') {
      useAppStore.getState().navigate('ident-home')
    }
  }, [isAuthenticated, currentScreen])

  switch (currentScreen as IdentScreenRoute) {
    case 'ident-home':
      return <IdentHomeScreen />
    case 'ident-identification':
      return <IdentIdentificationScreen />
    case 'ident-suivi':
      return <IdentSuiviScreen />
    case 'ident-brouillons':
      return <IdentBrouillonsScreen />
    case 'ident-acteurs':
      return <IdentActeursScreen />
    case 'ident-statistiques':
      return <IdentStatistiquesScreen />
    case 'ident-rapports':
      return <IdentRapportsScreen />
    case 'ident-dashboard':
      return <IdentDashboardScreen />
    case 'ident-profil':
    case 'ident-parametres':
      return <IdentProfilScreen />
    default:
      return <IdentHomeScreen />
  }
}

function ScreenRouter() {
  const { currentScreen, soleilMode, isAuthenticated, userRole } = useAppStore()

  // Apply soleil mode class to body
  useEffect(() => {
    if (soleilMode) {
      document.documentElement.classList.add('soleil')
      document.body.classList.add('soleil')
    } else {
      document.documentElement.classList.remove('soleil')
      document.body.classList.remove('soleil')
    }
  }, [soleilMode])

  // Safety net: if authenticated but on auth screen, go to home
  // (handles edge case where onRehydrateStorage didn't catch it)
  useEffect(() => {
    if (isAuthenticated && (currentScreen === 'auth' || currentScreen === 'register')) {
      useAppStore.getState().navigate('home')
    }
  }, [isAuthenticated, currentScreen])

  // If we're in identificateur mode and on an ident screen, use ident router
  if (currentScreen === 'ident-auth') {
    return <IdentAuthScreen />
  }

  if (isIdentScreen(currentScreen)) {
    return <IdentScreenRouter />
  }

  switch (currentScreen) {
    case 'auth':
    case 'register':
      return <AuthScreen />
    case 'home':
      return <HomeScreen />
    case 'caisse':
      return <CaisseScreen />
    case 'stock':
      return <StockScreen />
    case 'depenses':
      return <DepensesScreen />
    case 'ventes':
      return <VentesScreen />
    case 'marche':
      return <MarcheScreen />
    case 'commandes':
      return <CommandesScreen />
    case 'tontines':
      return <TontinesScreen />
    case 'profil':
      return <ProfilScreen />
    case 'keiwa':
      return <KeiwaScreen />
    case 'academy':
      return <AcademyScreen />
    case 'support':
      return <SupportScreen />
    case 'fidelite':
      return <FideliteScreen />
    case 'protection-sociale':
      return <ProtectionSocialeScreen />
    case 'parametres':
      return <ProfilScreen /> // Settings in profile
    default:
      return <HomeScreen />
  }
}

export default function JulabaApp() {
  const { isAuthenticated, hasCompletedOnboarding, showVoiceModal, voiceModalKey, userRole, currentScreen } = useAppStore()
  const hydrated = useHydrated()
  const [splashDone, setSplashDone] = useState(false)

  const handleSplashDone = useCallback(() => {
    setSplashDone(true)
  }, [])

  // Show splash screen animation first (runs ~3s)
  if (!splashDone) {
    return <SplashScreen onDone={handleSplashDone} />
  }

  // After splash, ensure hydration is done before showing app
  if (!hydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#FDF3ED] to-[#F5E6D5]">
        <div className="w-16 h-16 rounded-2xl shadow-lg overflow-hidden animate-pulse">
          <img
            src="/icon-only.png"
            alt="Jùlaba"
            className="w-full h-full object-contain"
          />
        </div>
        <p className="mt-3 text-sm text-[#C66A2C]/60">Chargement...</p>
      </div>
    )
  }

  // Show onboarding on first launch
  if (!hasCompletedOnboarding) {
    return <OnboardingScreen />
  }

  // Determine which bottom bar to show
  const isIdent = isIdentScreen(currentScreen)
  // Hide ident bottom bar on identification screen (it has its own action bar)
  const identNoBarScreens = new Set(['ident-identification'])
  const showIdentBar = isAuthenticated && userRole === 'identificateur' && isIdent && !identNoBarScreens.has(currentScreen)
  const showMarchandBar = isAuthenticated && userRole === 'marchand' && !isIdent

  return (
    <div className="min-h-screen flex flex-col">
      {/* Main content */}
      <main className="flex-1">
        <ScreenRouter />
      </main>

      {/* Bottom navigation bar — role-specific */}
      {showMarchandBar && <BottomBar />}
      {showIdentBar && <IdentBottomBar />}

      {/* Global voice modal — only for marchand role */}
      {isAuthenticated && userRole === 'marchand' && showVoiceModal && <VoiceModal key={voiceModalKey} />}

      {/* Invisible wake word lifecycle manager — only for marchand role */}
      {isAuthenticated && userRole === 'marchand' && <WakeWordManager />}
    </div>
  )
}
