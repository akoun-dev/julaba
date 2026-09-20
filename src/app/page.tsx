'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore, type ScreenRoute } from '@/lib/stores/app-store'
import { OnboardingScreen } from '@/components/marchand/onboarding-screen'
import { AuthScreen } from '@/components/marchand/auth-screen'
import { HomeScreen } from '@/components/marchand/home-screen'
import { MarketModeScreen } from '@/components/marchand/market-mode-screen'
import { CaisseScreen } from '@/components/marchand/caisse-screen'
import { StockScreen } from '@/components/marchand/stock-screen'
import { DepensesScreen } from '@/components/marchand/depenses-screen'
import { CreditsScreen } from '@/components/marchand/credits-screen'
import { FournisseursScreen } from '@/components/marchand/fournisseurs-screen'
import { PointsVenteScreen } from '@/components/marchand/points-vente-screen'
import TransfertsScreen from '@/components/marchand/transferts-screen'
import { VentesScreen } from '@/components/marchand/ventes-screen'
import { BottomBar } from '@/components/marchand/bottom-bar'
import { VoiceModal } from '@/components/marchand/voice-modal'
import { OpenCaisseModal } from '@/components/marchand/open-caisse-modal'
import { CloseDayModal } from '@/components/marchand/close-day-modal'
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
import { IdentDossierDetailScreen } from '@/components/identificateur/ident-dossier-detail-screen'
import { IdentMissionsScreen } from '@/components/identificateur/ident-missions-screen'
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
import { useProducteurStore } from '@/lib/stores/producteur-store'

// Backoffice imports
import { BoAuthScreen } from '@/components/backoffice/bo-auth-screen'
import { BoLayout } from '@/components/backoffice/bo-layout'
import { BoScreenRouter } from '@/components/backoffice/bo-screen-router'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'

// Coopérative imports (MODE-921)
import { CoopAuthScreen } from '@/components/cooperative/coop-auth-screen'
import { CoopHomeScreen } from '@/components/cooperative/coop-home-screen'
import { CoopMembresScreen } from '@/components/cooperative/coop-membres-screen'
import { CoopTresorerieScreen } from '@/components/cooperative/coop-tresorerie-screen'
import { CoopStockScreen } from '@/components/cooperative/coop-stock-screen'
import { CoopBesoinsScreen } from '@/components/cooperative/coop-besoins-screen'
import { CoopProfilScreen } from '@/components/cooperative/coop-profil-screen'
import { CoopBottomBar } from '@/components/cooperative/coop-bottom-bar'
import { MarchandCoopScreen } from '@/components/cooperative/marchand-coop-screen'

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

// Helper to check if a screen route belongs to the Coopérative module (MODE-921)
const isCoopScreen = (screen: ScreenRoute) => screen.startsWith('coop-')

const MARCHAND_SCREEN_VOICE: Partial<Record<ScreenRoute, string>> = {
  home: 'Accueil. Voici votre activité du jour.',
  caisse: 'Nouvelle vente. Choisissez un produit ou dites-moi ce que vous voulez vendre.',
  stock: 'Gestion du stock. Vous pouvez ajouter, modifier ou réapprovisionner vos produits.',
  transferts: 'Transferts. Envoie du stock à un confrère ou reçois celui qu\'il t\'envoie.',
  depenses: 'Dépenses. Consultez vos dépenses ou enregistrez une nouvelle dépense.',
  ventes: 'Historique des ventes. Consultez vos ventes et votre chiffre d’affaires.',
  marche: 'Marché Jùlaba. Consultez les produits proposés par les fournisseurs.',
  'mode-marche': 'Mode Marché. Vendez et gérez votre activité même sans connexion.',
  commandes: 'Mes commandes. Consultez le suivi de vos commandes.',
  tontines: 'Tontines. Consultez vos cotisations et vos prochaines échéances.',
  keiwa: 'Keiwa. Votre portefeuille mobile. Effectuez un dépôt, un retrait ou un transfert.',
  credits: 'Mes crédits. Voici ce que tes clients te doivent.',
  fournisseurs: 'Mes fournisseurs. Voici ton annuaire et tes achats de marchandises.',
  'points-vente': 'Mes points de vente. Voici où tu vends : boutique, marchés et autres emplacements.',
  academy: 'Académie Jùlaba. Choisissez une formation pour améliorer votre commerce.',
  'academy-course': 'Lecture du cours. Je vous le lirai si vous préférez écouter.',
  fidelite: 'Fidélité. Consultez vos points et les récompenses disponibles.',
  'protection-sociale': 'Protection sociale. Découvrez les informations sur la CNPS, la CMU et les assurances.',
  'ma-cooperative': 'Ma coopérative. Rejoignez une coopérative, cotisez ou déposez un besoin.',
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
  const { currentScreen, isAuthenticated } = useAppStore()

  // UI-MP-008 — l'application NON gardée de `.soleil` ici est SUPPRIMÉE :
  // elle contredisait ScreenRouter (qui la pose/retire selon le rôle) et
  // faisait fuiter le mode soleil marchand vers l'identificateur. Le mode
  // soleil est désormais porté par ScreenRouter seul (marchand OU producteur) ;
  // l'identificateur a son propre thème `ident-dark`.

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
    case 'ident-dossier-detail':
      return <IdentDossierDetailScreen />
    case 'ident-missions':
      return <IdentMissionsScreen />
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

type CoopScreenRoute = Exclude<ScreenRoute, 'coop-auth'>

// Parité marchand/producteur : narration de navigation de l'espace
// coopérative (lecture seule — le parser vocal coopératif est un suivi).
const COOP_SCREEN_VOICE: Partial<Record<ScreenRoute, string>> = {
  'coop-home': 'Accueil de la coopérative. Voici vos membres, votre trésorerie et votre stock commun.',
  'coop-membres': 'Membres. Consultez les demandes d\u2019adhésion et gérez votre effectif.',
  'coop-tresorerie': 'Trésorerie. Voici le solde validé et le journal des écritures.',
  'coop-stock': 'Stock commun. Apportez ou distribuez les produits du pot commun.',
  'coop-besoins': 'Achats groupés. Voici les besoins des membres, groupés par produit.',
  'coop-profil': 'Votre profil coopérative.',
  'ma-cooperative': 'Ma coopérative. Rejoignez une coopérative, cotisez ou déposez un besoin.',
}

function CoopScreenRouter() {
  const { currentScreen, isAuthenticated, userRole, voiceEnabled } = useAppStore()

  // Safety net (identique aux autres espaces)
  useEffect(() => {
    if (isAuthenticated && currentScreen === 'coop-auth') {
      useAppStore.getState().navigate('coop-home')
    }
  }, [isAuthenticated, currentScreen])

  // Narration de navigation — coupée par « Son désactivé », réservée au
  // rôle coopérateur ou à l'écran marchand ma-cooperative.
  useEffect(() => {
    if (!isAuthenticated) return
    const estCoop = userRole === 'cooperateur' && isCoopScreen(currentScreen)
    const estMarchandCoop = userRole === 'marchand' && currentScreen === 'ma-cooperative'
    if (!estCoop && !estMarchandCoop) return
    if (!voiceEnabled) return
    const message = COOP_SCREEN_VOICE[currentScreen]
    if (!message) return
    tataSpeak(message)
  }, [currentScreen, isAuthenticated, userRole, voiceEnabled])

  switch (currentScreen as CoopScreenRoute) {
    case 'coop-home':
      return <CoopHomeScreen />
    case 'coop-membres':
      return <CoopMembresScreen />
    case 'coop-tresorerie':
      return <CoopTresorerieScreen />
    case 'coop-stock':
      return <CoopStockScreen />
    case 'coop-besoins':
      return <CoopBesoinsScreen />
    case 'coop-profil':
      return <CoopProfilScreen />
    case 'ma-cooperative':
      return <MarchandCoopScreen />
    default:
      return <CoopHomeScreen />
  }
}

// Parité marchand (MARCHAND_SCREEN_VOICE ci-dessus) : chaque changement
// d'écran producteur est annoncé à voix haute — l'équivalent oral du titre
// de la page pour un public qui ne lit pas (audit P1 : narration absente).
const PROD_SCREEN_VOICE: Partial<Record<ScreenRoute, string>> = {
  'prod-home': 'Accueil. Voici votre activité agricole du jour.',
  'prod-recoltes': 'Récoltes. Consultez vos récoltes ou déclarez-en une nouvelle.',
  'prod-commandes': 'Commandes. Consultez les commandes des marchands.',
  'prod-stock': 'Stock. Voici vos quantités disponibles.',
  'prod-cycles': 'Cycles de production. Suivez vos cultures saison par saison.',
  'prod-profil': 'Votre profil. Choisissez les informations ou les réglages à modifier.',
}

function ProdScreenRouter() {
  const { currentScreen, isAuthenticated, userRole, voiceEnabled } = useAppStore()
  const loadFromServer = useProducteurStore((state) => state.loadFromServer)

  // Safety net
  useEffect(() => {
    if (isAuthenticated && currentScreen === 'prod-auth') {
      useAppStore.getState().navigate('prod-home')
    }
  }, [isAuthenticated, currentScreen])

  useEffect(() => {
    if (isAuthenticated && userRole === 'producteur') void loadFromServer()
  }, [isAuthenticated, userRole, loadFromServer])

  // Narration de navigation — même contrat que l'espace marchand : coupée
  // par « Son désactivé », réservée au rôle producteur, uniquement pour les
  // routes qui ont une phrase.
  useEffect(() => {
    if (!isAuthenticated || userRole !== 'producteur') return
    if (!voiceEnabled) return
    const message = PROD_SCREEN_VOICE[currentScreen]
    if (!message) return
    tataSpeak(message)
  }, [currentScreen, isAuthenticated, userRole, voiceEnabled])

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
  const { currentScreen, soleilMode, isAuthenticated, userRole, voiceEnabled } = useAppStore()

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

  // Apply soleil mode class to body — marchand ET producteur (UI-MP-008 :
  // décision produit — l'espace producteur travaille aussi en extérieur et
  // ses écrans implémentaient déjà `soleilMode` sans que la classe ne soit
  // appliquée). soleilMode itself is a persisted, role-agnostic toggle, so
  // without the role check here a marchand session left in soleil mode
  // would leak the class onto identificateur/backoffice screens reached
  // without a full reload (a role switch, a logout/login as a different
  // role in the same tab).
  useEffect(() => {
    if (soleilMode && (userRole === 'marchand' || userRole === 'producteur')) {
      document.documentElement.classList.add('soleil')
      document.body.classList.add('soleil')
    } else {
      document.documentElement.classList.remove('soleil')
      document.body.classList.remove('soleil')
    }
  }, [soleilMode, userRole])

  // UI-MP-015 — la classe `dark` n'est plus appliquée : le réglage « sombre »
  // a été retiré de l'UI (Affichage) tant que la surface marchand/producteur
  // n'est pas convertie aux jetons sémantiques (majorité des fonds/textes en
  // dur) — un thème à moitié appliqué mentait à l'utilisateur. Le champ
  // `darkMode` reste dans le store pour la compatibilité de persistance.
  // Chantier de conversion complet : .ai/DEBT_REPORT.md (DET-UI-015).
  const darkRole = false
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

  if (currentScreen === 'coop-auth') {
    return <CoopAuthScreen />
  }

  if (isCoopScreen(currentScreen) || currentScreen === 'ma-cooperative') {
    return <CoopScreenRouter />
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
    case 'transferts':
      return <TransfertsScreen />
    case 'depenses':
      return <DepensesScreen />
    case 'credits':
      return <CreditsScreen />
    case 'fournisseurs':
      return <FournisseursScreen />
    case 'points-vente':
      return <PointsVenteScreen />
    case 'ventes':
      return <VentesScreen />
    case 'marche':
      return <MarcheScreen />
    case 'mode-marche':
      return <MarketModeScreen />
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
  const { isAuthenticated, hasCompletedOnboarding, showVoiceModal, voiceModalKey, userRole, currentScreen } = useAppStore()
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
  const identNoBarScreens = new Set(['ident-identification', 'ident-dossier-detail'])
  const showIdentBar = isAuthenticated && userRole === 'identificateur' && isIdent && !identNoBarScreens.has(currentScreen)
  // Le Mode Marché est une session de vente dédiée : aucune navigation
  // principale ne doit distraire la marchande pendant le marché.
  const showMarchandBar = isAuthenticated && userRole === 'marchand' && currentScreen !== 'mode-marche' && !isIdent && !isBo && !isProd && currentScreen !== 'ma-cooperative'
  const showProdBar = isAuthenticated && userRole === 'producteur' && isProd
  // MODE-921 — barre coopérative : uniquement les écrans coop-* du rôle
  // coopérateur (l'écran marchand ma-cooperative a son propre bouton retour).
  const showCoopBar = isAuthenticated && userRole === 'cooperateur' && isCoopScreen(currentScreen)

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
      {showCoopBar && <CoopBottomBar />}

      {/* Global voice modal — only for marchand role */}
      {isAuthenticated && userRole === 'marchand' && showVoiceModal && <VoiceModal key={voiceModalKey} />}

      {/* Open caisse modal — dedicated voice-first modal for opening the cash register */}
      {isAuthenticated && userRole === 'marchand' && <OpenCaisseModal />}

      {/* Vente rapide modal — dedicated voice-first modal for quick sales */}
      {isAuthenticated && userRole === 'marchand' && <VenteRapideModal />}

      {/* Close-day modal — global (MODE-905 §8) : « Fermer ma journée »
          fonctionne depuis n'importe quel écran (accueil, Mode Marché). */}
      {isAuthenticated && userRole === 'marchand' && <CloseDayModal />}

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
      {isAuthenticated && (userRole === 'marchand' || userRole === 'producteur' || userRole === 'identificateur' || userRole === 'cooperateur') && <NotificationsWatcher />}

      {/* Invisible offline-sync lifecycle (handler registration + flush on
          reconnect/focus/launch) — same root-level reasoning as the
          notifications watcher above: queued writes must flush no matter
          which screen the user is on. */}
      {isAuthenticated && (userRole === 'marchand' || userRole === 'producteur' || userRole === 'identificateur' || userRole === 'cooperateur') && <SyncFlusher />}
    </div>
  )
}
