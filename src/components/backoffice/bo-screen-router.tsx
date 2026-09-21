'use client'

import { ShieldAlert } from 'lucide-react'
import {
  useBackofficeStore,
  hasModuleAccess,
  MODULE_LABELS,
  type ModuleName,
  type BoRole,
  type BoScreenRoute,
} from '@/lib/stores/backoffice-store'
import { BoDashboardScreen } from './bo-dashboard-screen'
import { BoActeursScreen } from './bo-acteurs-screen'
import { BoCarteActeursScreen } from './bo-carte-acteurs-screen'
import { BoEnrolementScreen } from './bo-enrolement-screen'
import { BoProducteursScreen } from './bo-producteurs-screen'
import { BoZonesScreen } from './bo-zones-screen'
import { BoMissionsScreen } from './bo-missions-screen'
import { BoIdentificateursScreen } from './bo-identificateurs-screen'
import { BoObjectifsScreen } from './bo-objectifs-screen'
import { BoAlertesScreen } from './bo-alertes-screen'
import { BoSupervisionScreen } from './bo-supervision-screen'
import { BoUtilisateursScreen } from './bo-utilisateurs-screen'
import { BoRapportsScreen } from './bo-rapports-screen'
import { BoAuditScreen } from './bo-audit-screen'
import { BoInstitutionsScreen } from './bo-institutions-screen'
import { BoModerationScreen } from './bo-moderation-screen'
import { BoMutationsScreen } from './bo-mutations-screen'
import { BoContenusScreen } from './bo-contenus-screen'
import { BoMonitoringIaScreen } from './bo-monitoring-ia-screen'
import { BoEventsScreen } from './bo-events-screen'
import { BoAnalyticsScreen } from './bo-analytics-screen'
import { BoScoresScreen } from './bo-scores-screen'
import { BoApiKeysScreen } from './bo-api-keys-screen'
import { BoMarketplaceScreen } from './bo-marketplace-screen'
import { BoLivraisonScreen } from './bo-livraison-screen'
import { BoCommunicationScreen } from './bo-communication-screen'
import { BoCronScreen } from './bo-cron-screen'
import { BoConfigInstitutionScreen } from './bo-config-institution-screen'
import { BoKeiwaScreen } from './bo-keiwa-screen'
import { BoVentesScreen } from './bo-ventes-screen'
import { BoAdministrationScreen } from './bo-administration-screen'
import { BoTontinesScreen } from './bo-tontines-screen'
import { BoDeviceSessionsScreen } from './bo-device-sessions-screen'
import { BoSyncConflictsScreen } from './bo-sync-conflicts-screen'
import { BoNotificationsScreen } from './bo-notifications-screen'
import { BoAcademieScreen } from './bo-academie-screen'
import { BoCooperativesScreen } from './bo-cooperatives-screen'
import { BoInformationRequestsScreen } from './bo-information-requests-screen'
import { BoLoyaltyScreen } from './bo-loyalty-screen'

// 'bo-administration' is a meta screen (a set of links into other, individually
// gated modules) with no MODULE_ACCESS entry of its own, so it has no separate
// access check here — only what it links to is gated.
function isScreenAccessible(role: BoRole, screen: BoScreenRoute): boolean {
  if (screen === 'bo-administration') return true
  return hasModuleAccess(role, screen.replace(/^bo-/, '') as ModuleName)
}

function AccessDeniedScreen({ screen }: { screen: BoScreenRoute }) {
  const { boNavigate, boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const moduleName = MODULE_LABELS[screen.replace(/^bo-/, '') as ModuleName] ?? screen

  return (
    <div className="animate-in fade-in zoom-in-95 duration-300 flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className={`flex h-14 w-14 items-center justify-center rounded-full ${isDark ? 'bg-red-500/10' : 'bg-red-50'}`}>
        <ShieldAlert className={`h-7 w-7 ${isDark ? 'text-red-400' : 'text-red-600'}`} aria-hidden="true" />
      </div>
      <h2 className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Accès non autorisé</h2>
      <p className={`max-w-sm text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        Votre rôle ne permet pas d&rsquo;accéder au module {moduleName}.
      </p>
      <button
        type="button"
        onClick={() => boNavigate('bo-dashboard')}
        className={`mt-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
          isDark ? 'bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-slate-900 text-white hover:bg-slate-800'
        }`}
      >
        Retour au tableau de bord
      </button>
    </div>
  )
}

function renderScreen(boCurrentScreen: BoScreenRoute) {
  switch (boCurrentScreen) {
    case 'bo-administration':
      return <BoAdministrationScreen />
    case 'bo-dashboard':
      return <BoDashboardScreen />
    case 'bo-acteurs':
      return <BoActeursScreen />
    case 'bo-carte-acteurs':
      return <BoCarteActeursScreen />
    case 'bo-enrolement':
      return <BoEnrolementScreen />
    case 'bo-producteurs':
      return <BoProducteursScreen />
    case 'bo-zones':
      return <BoZonesScreen />
    case 'bo-missions':
      return <BoMissionsScreen />
    case 'bo-identificateurs':
      return <BoIdentificateursScreen />
    case 'bo-objectifs':
      return <BoObjectifsScreen />
    case 'bo-alertes':
      return <BoAlertesScreen />
    case 'bo-supervision':
      return <BoSupervisionScreen />
    case 'bo-utilisateurs':
      return <BoUtilisateursScreen />
    case 'bo-rapports':
      return <BoRapportsScreen />
    case 'bo-audit':
      return <BoAuditScreen />
    case 'bo-institutions':
      return <BoInstitutionsScreen />
    case 'bo-moderation':
      return <BoModerationScreen />
    case 'bo-mutations':
      return <BoMutationsScreen />
    case 'bo-contenus':
      return <BoContenusScreen />
    case 'bo-monitoring-ia':
      return <BoMonitoringIaScreen />
    case 'bo-events':
      return <BoEventsScreen />
    case 'bo-analytics':
      return <BoAnalyticsScreen />
    case 'bo-scores':
      return <BoScoresScreen />
    case 'bo-api-keys':
      return <BoApiKeysScreen />
    case 'bo-marketplace':
      return <BoMarketplaceScreen />
    case 'bo-livraison':
      return <BoLivraisonScreen />
    case 'bo-communication':
      return <BoCommunicationScreen />
    case 'bo-cron':
      return <BoCronScreen />
    case 'bo-config-institution':
      return <BoConfigInstitutionScreen />
    case 'bo-keiwa':
      return <BoKeiwaScreen />
    case 'bo-ventes':
      return <BoVentesScreen />
    case 'bo-tontines':
      return <BoTontinesScreen />
    case 'bo-device-sessions':
      return <BoDeviceSessionsScreen />
    case 'bo-sync-conflicts':
      return <BoSyncConflictsScreen />
    case 'bo-notifications':
      return <BoNotificationsScreen />
    case 'bo-academie':
      return <BoAcademieScreen />
    case 'bo-cooperatives':
      return <BoCooperativesScreen />
    case 'bo-demandes-info':
      return <BoInformationRequestsScreen />
    case 'bo-loyalty':
      return <BoLoyaltyScreen />
    default:
      return <BoDashboardScreen />
  }
}

export function BoScreenRouter() {
  const { boCurrentScreen, boUserRole } = useBackofficeStore()

  if (!isScreenAccessible(boUserRole, boCurrentScreen)) {
    return <AccessDeniedScreen screen={boCurrentScreen} />
  }

  return (
    <div key={boCurrentScreen} className="animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out">
      {renderScreen(boCurrentScreen)}
    </div>
  )
}
