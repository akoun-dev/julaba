'use client'

import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoDashboardScreen } from './bo-dashboard-screen'
import { BoActeursScreen } from './bo-acteurs-screen'
import { BoEnrolementScreen } from './bo-enrolement-screen'
import { BoZonesScreen } from './bo-zones-screen'
import { BoMissionsScreen } from './bo-missions-screen'
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

export function BoScreenRouter() {
  const { boCurrentScreen } = useBackofficeStore()

  switch (boCurrentScreen) {
    case 'bo-dashboard':
      return <BoDashboardScreen />
    case 'bo-acteurs':
      return <BoActeursScreen />
    case 'bo-enrolement':
      return <BoEnrolementScreen />
    case 'bo-zones':
      return <BoZonesScreen />
    case 'bo-missions':
      return <BoMissionsScreen />
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
    default:
      return <BoDashboardScreen />
  }
}
