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
import { OpenCaisseModal } from '@/components/marchand/open-caisse-modal'
import { VenteRapideModal } from '@/components/marchand/vente-rapide-modal'
import { WakeWordManager } from '@/components/marchand/wake-word-manager'
import { NotificationsWatcher } from '@/components/shared/notifications-watcher'
import { SyncFlusher } from '@/components/shared/sync-flusher'
import { SplashScreen } from '@/components/marchand/splash-screen'
import { AcademyCourseScreen } from '@/components/marchand/academy-course-screen'
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
import { tataSpeak } from '@/lib/voice/tata-tts'

// Producteur imports
import { ProdAuthScreen } from '@/components/producteur/prod-auth-screen'
import { ProdHomeScreen } from '@/components/producteur/prod-home-screen'
import { ProdBottomBar } from '@/components/producteur/prod-bottom-bar'
import { ProdRecoltesScreen } from '@/components/producteur/prod-recoltes-screen'
import { ProdCommandesScreen } from '@/components/producteur/prod-commandes-screen'
import { ProdStockScreen } from '@/components/producteur/prod-stock-screen'
import { ProdCyclesScreen } from '@/components/producteur/prod-cycles-screen'
import { ProdProfilScreen } from '@/components/producteur/prod-profil-screen'
import { ProdVoiceModal } from '@/components/producteur/prod-voice-modal'

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
    // Persist hydration is synchronous in normal browser usage. Keep a short
    // safety net for unusual storage implementations without adding a long
    // artificial auth delay.
    const fallback = setTimeout(() => {
      setHydrated(true)
    }, 500)
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

const MARCHAND_SCREEN_VOICE: Partial<Record<ScreenRoute, string>> = {
  home: 'Accueil. Voici votre activité du jour.',
  caisse: 'Nouvelle vente. Choisissez un produit ou dites-moi ce que vous voulez vendre.',
  stock: 'Gestion du stock. Vous pouvez ajouter, modifier ou réapprovisionner vos produits.',
  depenses: 'Dépenses. Consultez vos dépenses ou enregistrez une nouvelle dépense.',
  ventes: 'Historique des ventes. Consultez vos ventes et votre chiffre d’affaires.',
  marche: 'Marché Jùlaba. Consultez les produits proposés par les fournisseurs.',
  commandes: 'Mes commandes. Consultez le suivi de vos commandes.',
  tontines: 'Tontines. Consultez vos cotisations et vos prochaines échéances.',
  keiwa: 'Keiwa. Votre portefeuille mobile. Effectuez un dépôt, un retrait ou un transfert.',
  academy: 'Académie Jùlaba. Choisissez une formation pour améliorer votre commerce.',
  'academy-course': 'Lecture du cours. Je vous le lirai si vous préférez écouter.',
  fidelite: 'Fidélité. Consultez vos points et les récompenses disponibles.',
  'protection-sociale': 'Protection sociale. Découvrez les informations sur la CNPS, la CMU et les assurances.',
  profil: 'Votre profil. Choisissez les informations ou les réglages à modifier.',
}

// Gates every Backoffice screen behind a server-confirmed session. Shows a
// minimal loading state while the check is in flight, and falls back to the
// login screen (without ever rendering BO data) if it comes back invalid.
function BoGate() {
  const { boUser, boSessionChecked } = useBackofficeStore()

  if (!boSessionChecked) {
    return (
      <div className="h-dvh w-full flex items-center justify-center bg-slate-900">
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
    case 'prod-cycles':
      return <ProdCyclesScreen />
    case 'prod-profil':
      return <ProdProfilScreen />
    default:
      return <ProdHomeScreen />
  }
}

function ScreenRouter() {
  const { currentScreen, soleilMode, darkMode, isAuthenticated, userRole, voiceEnabled } = useAppStore()

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [currentScreen])

  useEffect(() => {
    if (!isAuthenticated || userRole !== 'marchand') return
    // Garde cohérent avec le reste de l'app (onboarding, notifications) :
    // « Son désactivé » coupe aussi la narration de navigation, au lieu de
    // parler contre le réglage de l'utilisateur.
    if (!voiceEnabled) return
    const message = MARCHAND_SCREEN_VOICE[currentScreen]
    if (!message) return
    tataSpeak(message)
  }, [currentScreen, isAuthenticated, userRole, voiceEnabled])

  // Apply soleil mode class to body — marchand-only concept (see
  // surfaces-marchand.md). soleilMode itself is a persisted, role-agnostic
  // toggle, so without the role check here a marchand session left in
  // soleil mode would leak the class onto identificateur/backoffice
  // screens reached without a full reload (a role switch, a logout/login
  // as a different role in the same tab).
  useEffect(() => {
    if (soleilMode && userRole === 'marchand') {
      document.documentElement.classList.add('soleil')
      document.body.classList.add('soleil')
    } else {
      document.documentElement.classList.remove('soleil')
      document.body.classList.remove('soleil')
    }
  }, [soleilMode, userRole])

  const darkRole = darkMode && (userRole === 'marchand' || userRole === 'producteur')
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkRole)
    document.body.classList.toggle('dark', darkRole)
    return () => {
      document.documentElement.classList.remove('dark')
      document.body.classList.remove('dark')
    }
  }, [darkRole])

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
    case 'academy-course':
      return <AcademyCourseScreen />
    case 'fidelite':
      return <FideliteScreen />
    case 'protection-sociale':
      return <ProtectionSocialeScreen />
    default:
      return <HomeScreen />
  }
}

export default function JulabaApp() {
  const { isAuthenticated, hasCompletedOnboarding, showVoiceModal, voiceModalKey, userRole, currentScreen, darkMode } = useAppStore()
  const identDarkMode = useIdentificateurStore((state) => state.identDarkMode)
  const hydrated = useHydrated()
  const [splashDone, setSplashDone] = useState(false)

  const handleSplashDone = useCallback(() => {
    setSplashDone(true)
  }, [])

  // Show a short brand transition while persisted state hydrates in parallel.
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

  return (
    <div className={`min-h-dvh flex flex-col ${isIdent && identDarkMode ? 'ident-dark' : darkMode ? 'dark' : ''}`}>
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

      {/* Open caisse modal — dedicated voice-first modal for opening the cash register */}
      {isAuthenticated && userRole === 'marchand' && <OpenCaisseModal />}

      {/* Vente rapide modal — dedicated voice-first modal for quick sales */}
      {isAuthenticated && userRole === 'marchand' && <VenteRapideModal />}

      {/* Producteur has its own voice modal (navigation + récolte declaration
          by voice) — see prodIntent.ts for why it isn't sharing marchand's
          parser/component. It does share the "Julaba" wake word below — that
          listener and its pause/resume around this modal are role-agnostic
          (wake-word.ts only calls back into openVoiceModal(), it doesn't
          touch any role-specific store). */}
      {isAuthenticated && userRole === 'producteur' && showVoiceModal && <ProdVoiceModal key={voiceModalKey} />}

      {/* No voice modal for Identificateur — the "Tata" tab is present but
          permanently disabled for this role per PD-007 (product-judgment.md):
          field agents use company-issued devices and may be in formal
          settings, so voice input is inappropriate. See ident-bottom-bar.tsx. */}

      {/* Invisible wake word lifecycle manager — marchand and producteur only for now */}
      {isAuthenticated && (userRole === 'marchand' || userRole === 'producteur') && <WakeWordManager />}

      {/* Invisible notification polling/voice/local-notify watcher — all
          three actor roles, mounted at the root (not per home screen) so
          it keeps polling on every other screen too, see
          use-notifications-watcher.ts. */}
      {isAuthenticated && (userRole === 'marchand' || userRole === 'producteur' || userRole === 'identificateur') && <NotificationsWatcher />}

      {/* Invisible offline-sync lifecycle (handler registration + flush on
          reconnect/focus/launch) — same root-level reasoning as the
          notifications watcher above: queued writes must flush no matter
          which screen the user is on. */}
      {isAuthenticated && (userRole === 'marchand' || userRole === 'producteur' || userRole === 'identificateur') && <SyncFlusher />}
    </div>
  )
}
