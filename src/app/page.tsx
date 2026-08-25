'use client'

import { useEffect, useState } from 'react'
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
import {
  MarcheScreen,
  CommandesScreen,
  TontinesScreen,
  ProfilScreen,
  KeiwaScreen,
  AcademyScreen,
  SupportScreen,
  FideliteScreen,
  ProtectionSocialeScreen,
} from '@/components/marchand/secondary-screens'

/**
 * Waits for Zustand persist to rehydrate from localStorage.
 * Prevents flash of wrong screen (onboarding/auth) on page load.
 */
function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    // Use requestAnimationFrame to ensure localStorage has been read
    const timer = requestAnimationFrame(() => {
      setHydrated(true)
    })
    return () => cancelAnimationFrame(timer)
  }, [])
  return hydrated
}

function ScreenRouter() {
  const { currentScreen, soleilMode, isAuthenticated } = useAppStore()

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
  const { isAuthenticated, hasCompletedOnboarding, showVoiceModal, voiceModalKey } = useAppStore()
  const hydrated = useHydrated()

  // Show a minimal loading state until stores have rehydrated
  // This prevents the flash of onboarding/auth on refresh
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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Main content */}
      <main className="flex-1">
        <ScreenRouter />
      </main>

      {/* Bottom navigation bar (only when authenticated) */}
      {isAuthenticated && <BottomBar />}

      {/* Global voice modal — key forces remount on each open for clean state */}
      {isAuthenticated && showVoiceModal && <VoiceModal key={voiceModalKey} />}

      {/* Invisible wake word lifecycle manager */}
      {isAuthenticated && <WakeWordManager />}
    </div>
  )
}
