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
import { IdentProfilScreen } from '@/components/identificateur/ident-profil-screen'
import { useIdentificateurStore } from '@/lib/stores/identificateur-store'

// Producteur imports
import { ProdAuthScreen } from '@/components/producteur/prod-auth-screen'
import { ProdHomeScreen } from '@/components/producteur/prod-home-screen'
import { ProdBottomBar } from '@/components/producteur/prod-bottom-bar'
import { ProdRecoltesScreen } from '@/components/producteur/prod-recoltes-screen'
import { ProdCommandesScreen } from '@/components/producteur/prod-commandes-screen'
import { ProdStockScreen } from '@/components/producteur/prod-stock-screen'
import { ProdProfilScreen } from '@/components/producteur/prod-profil-screen'

// Backoffice imports
import { BoAuthScreen } from '@/components/backoffice/bo-auth-screen'
import { BoLayout } from '@/components/backoffice/bo-layout'
import { BoScreenRouter } from '@/components/backoffice/bo-screen-router'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'

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
    // Fallback: if hydration hasn't fired after 1s, proceed anyway
    const fallback = setTimeout(() => {
      setHydrated(true)
    }, 1000)
    return () => {
      unsubFinish()
      clearTimeout(fallback)
    }
  }, [])
  return hydrated
}

// Helper to check if a screen route belongs to the Identificateur module
const isIdentScreen = (screen: ScreenRoute) => screen.startsWith('ident-')

// Helper to check if a screen route belongs to the Backoffice module
const isBoScreen = (screen: ScreenRoute) => screen.startsWith('bo-') && screen !== 'bo-auth'

// Helper to check if a screen route belongs to the Producteur module
const isProdScreen = (screen: ScreenRoute) => screen.startsWith('prod-')

// Gates every Backoffice screen behind a server-confirmed session. Shows a
// minimal loading state while the check is in flight, and falls back to the
// login screen (without ever rendering BO data) if it comes back invalid.
function BoGate() {
  const { boUser, boSessionChecked } = useBackofficeStore()

  if (!boSessionChecked) {
    return (
      <div className="h-dvh w-screen flex items-center justify-center bg-slate-900">
        <div className="h-8 w-8 rounded-full border-2 border-slate-600 border-t-white animate-spin" />
      </div>
    )
  }

  if (!boUser) {
    return <BoAuthScreen />
  }

  return (
    <BoLayout>
      <BoScreenRouter />
    </BoLayout>
  )
}

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
    case 'ident-profil':
    case 'ident-parametres':
      return <IdentProfilScreen />
    default:
      return <IdentHomeScreen />
  }
}

type ProdScreenRoute = Exclude<ScreenRoute, 'prod-auth'>

function ProdScreenRouter() {
  const { currentScreen, isAuthenticated } = useAppStore()

  // Safety net
  useEffect(() => {
    if (isAuthenticated && currentScreen === 'prod-auth') {
      useAppStore.getState().navigate('prod-home')
    }
  }, [isAuthenticated, currentScreen])

  switch (currentScreen as ProdScreenRoute) {
    case 'prod-home':
      return <ProdHomeScreen />
    case 'prod-recoltes':
      return <ProdRecoltesScreen />
    case 'prod-commandes':
      return <ProdCommandesScreen />
    case 'prod-stock':
      return <ProdStockScreen />
    case 'prod-profil':
      return <ProdProfilScreen />
    default:
      return <ProdHomeScreen />
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

  // Backoffice auth screen (full-screen, no layout)
  if (currentScreen === 'bo-auth') {
    return <BoAuthScreen />
  }

  // Backoffice screens: only render inside BO layout once the server has
  // confirmed a live session — a persisted `currentScreen` of 'bo-dashboard'
  // (or any bo-* screen) is not proof of being logged in, and boUser/boUserRole
  // are no longer trusted from client storage (see backoffice-store.ts).
  if (isBoScreen(currentScreen)) {
    return <BoGate />
  }

  // If we're in identificateur mode and on an ident screen, use ident router
  if (currentScreen === 'ident-auth') {
    return <IdentAuthScreen />
  }

  if (isIdentScreen(currentScreen)) {
    return <IdentScreenRouter />
  }

  if (currentScreen === 'prod-auth') {
    return <ProdAuthScreen />
  }

  if (isProdScreen(currentScreen)) {
    return <ProdScreenRouter />
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
    case 'fidelite':
      return <FideliteScreen />
    case 'protection-sociale':
      return <ProtectionSocialeScreen />
    default:
      return <HomeScreen />
  }
}

export default function JulabaApp() {
  const { isAuthenticated, hasCompletedOnboarding, showVoiceModal, voiceModalKey, userRole, currentScreen } = useAppStore()
  const identDarkMode = useIdentificateurStore((state) => state.identDarkMode)
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
      <div className="min-h-dvh flex flex-col items-center justify-center bg-gradient-to-b from-[#FDF3ED] to-[#F5E6D5]">
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
  const isBo = currentScreen.startsWith('bo-')
  const isProd = isProdScreen(currentScreen)
  // Hide ident bottom bar on identification screen (it has its own action bar)
  const identNoBarScreens = new Set(['ident-identification'])
  const showIdentBar = isAuthenticated && userRole === 'identificateur' && isIdent && !identNoBarScreens.has(currentScreen)
  const showMarchandBar = isAuthenticated && userRole === 'marchand' && !isIdent && !isBo && !isProd
  const showProdBar = isAuthenticated && userRole === 'producteur' && isProd

  // Backoffice has its own layout (sidebar + header + status bar), no mobile bottom bar
  if (isBo && isAuthenticated) {
    return (
      <main>
        <BoLayout>
          <BoScreenRouter />
        </BoLayout>
      </main>
    )
  }

  return (
    <div className={`min-h-dvh flex flex-col ${isIdent && identDarkMode ? 'ident-dark' : ''}`}>
      {/* Main content */}
      <main className="flex-1">
        <ScreenRouter />
      </main>

      {/* Bottom navigation bar — role-specific */}
      {showMarchandBar && <BottomBar />}
      {showIdentBar && <IdentBottomBar />}
      {showProdBar && <ProdBottomBar />}

      {/* Global voice modal — only for marchand role */}
      {isAuthenticated && userRole === 'marchand' && showVoiceModal && <VoiceModal key={voiceModalKey} />}

      {/* Invisible wake word lifecycle manager — only for marchand role */}
      {isAuthenticated && userRole === 'marchand' && <WakeWordManager />}
    </div>
  )
}
