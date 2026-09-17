// Barrel du module notifications — le point d'import unique pour les
// composants et les déclencheurs métier.

export type {
  NotificationSeverity,
  NotificationCategory,
  NotificationPriority,
  NotificationOrigin,
  InAppNotification,
  NotificationFilter,
  NotificationInput,
  NotificationPrefs,
  CategoryPref,
} from './types'

export {
  DEFAULT_EXPIRY_MS,
  SECURITY_EXPIRY_MS,
  withDefaultExpiry,
  isExpired,
  deduplicationKeyOf,
  isDuplicateNotification,
  mergeNotifications,
  sortForDisplay,
  isCritical,
  effectiveCategoryPref,
  shouldDisplayNotification,
  toastDurationFor,
  filterNotifications,
  groupNotificationsByDate,
  groupSimilarNotifications,
  groupLabel,
  type DateGroup,
  type GroupedNotification,
} from './rules'

export {
  NOTIFICATION_CATEGORIES,
  categoriesForRole,
  categoryLabel,
  getNotificationPrefs,
  setNotificationPrefs,
  updateCategoryPref,
  setToastsEnabled,
  setKeepHistory,
  setSilentUntil,
  resetNotificationPrefs,
  isNotificationHiddenForPrefs,
} from './preferences'

export {
  buildDeviceNotification,
  getDeviceNotifications,
  addDeviceNotification,
  markDeviceNotificationRead,
  markAllDeviceNotificationsRead,
  deleteDeviceNotification,
  archiveDeviceNotification,
  pendingDeviceNotifications,
  markDeviceNotificationsSynced,
  pruneDeviceNotifications,
  clearDeviceNotifications,
} from './device-notifications'

export {
  fetchNotificationFeed,
  fetchOlderNotifications,
  createNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  archiveNotification,
  deleteNotification,
  getUnreadNotificationCount,
  syncPendingDeviceNotifications,
  subscribeToNotifications,
  mapServerRow,
  NOTIF_CHANNEL_PREFIX,
  type ServerNotificationRow,
  type FeedResult,
  type CreateResult,
  type RealtimeHandle,
} from './client'

export {
  showNotificationToast,
  executeNotificationAction,
  SEVERITY_ICON,
  resetToastStateForTests,
} from './toast'

export {
  trackNotificationMetric,
  getNotificationMetrics,
  summarizeNotificationMetrics,
  categoryUsageMetrics,
  type NotificationMetricEvent,
  type NotificationMetrics,
} from './metrics'

export * as notificationEvents from './events'
