// Canaux de notification Android (Task 29) — mapping pur sévérité → canal.
//
// Android 8+ (API 26) exige des canaux ; l'utilisateur les gère dans les
// réglages système par canal (son, vibration, bannière). On en expose
// exactement trois, alignés sur les dimensions du système in-app (Task 28)
// pour que le comportement natif reflète les mêmes attentes :
//   • julaba-critical  — erreurs d'action et priorité critique : heads-up,
//     vibration, LED (l'équivalent de « passes quoi qu'il arrive ») ;
//   • julaba-important — avertissements et rappels : son, pas de heads-up
//     agressif ;
//   • julaba-info      — le reste : silencieux, juste présent dans le centre
//     système.
//
// Module volontairement PUR (aucun import de plugin) : importable depuis
// notification-local.ts sans cycle, et directement testable.

import type { NotificationPriority, NotificationSeverity } from './types'

export const CRITICAL_CHANNEL_ID = 'julaba-critical'
export const IMPORTANT_CHANNEL_ID = 'julaba-important'
export const INFO_CHANNEL_ID = 'julaba-info'

/** Définitions des canaux (type Channel des plugins Capacitor, commun à
 * push et local). Créés de façon idempotente au démarrage (native.ts) —
 * createChannel écrase silencieusement une définition existante. */
export const NOTIFICATION_CHANNELS = [
  {
    id: CRITICAL_CHANNEL_ID,
    name: 'Alertes urgentes',
    description: 'Erreurs et alertes de sécurité — affichage immédiat avec vibration.',
    importance: 4, // HIGH : bannière heads-up
    visibility: 1 as const, // PUBLIC : contenu visible sur l'écran verrouillé
    lights: true,
    lightColor: '#E11D48',
    vibration: true,
  },
  {
    id: IMPORTANT_CHANNEL_ID,
    name: 'Notifications importantes',
    description: 'Avertissements et rappels (caisse, tontines, stock).',
    importance: 3, // DEFAULT : son, dans le centre, sans heads-up
    visibility: 1 as const,
    lights: false,
    vibration: true,
  },
  {
    id: INFO_CHANNEL_ID,
    name: 'Informations',
    description: 'Confirmations et informations générales — silencieux.',
    importance: 2, // LOW : pas de son
    visibility: 1 as const,
    lights: false,
    vibration: false,
  },
] as const

/** Canal à utiliser pour une notification donnée. La priorité critique
 * force le canal critique même si la sévérité est discrète (une info de
 * sécurité critique doit faire du bruit), conformément à la règle Task 28
 * « les critiques passent quoi qu'il arrive ». */
export function channelIdFor(severity: NotificationSeverity, priority: NotificationPriority = 'normal'): string {
  if (priority === 'critical' || severity === 'error') return CRITICAL_CHANNEL_ID
  if (severity === 'warning' || severity === 'reminder') return IMPORTANT_CHANNEL_ID
  return INFO_CHANNEL_ID
}
