'use client'

import { useEffect } from 'react'
import { useAppStore, type ScreenRoute } from '@/lib/stores/app-store'
import { AuthScreen } from '@/components/marchand/auth-screen'
import { HomeScreen } from '@/components/marchand/home-screen'
import { CaisseScreen } from '@/components/marchand/caisse-screen'
import { StockScreen } from '@/components/marchand/stock-screen'
import { DepensesScreen } from '@/components/marchand/depenses-screen'
import { VentesScreen } from '@/components/marchand/ventes-screen'
import { BottomBar } from '@/components/marchand/bottom-bar'
import { VoiceModal } from '@/components/marchand/voice-modal'
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

function ScreenRouter() {
  const { currentScreen, soleilMode } = useAppStore()

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
  const { isAuthenticated } = useAppStore()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Main content */}
      <main className="flex-1">
        <ScreenRouter />
      </main>

      {/* Bottom navigation bar (only when authenticated) */}
      {isAuthenticated && <BottomBar />}

      {/* Global voice modal */}
      {isAuthenticated && <VoiceModal />}
    </div>
  )
}
