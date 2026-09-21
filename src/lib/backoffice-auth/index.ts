export { hashPassword, verifyPassword, needsRehash } from './password'
export {
  SESSION_COOKIE,
  createSession,
  getSessionUser,
  revokeSession,
  sessionCookieOptions,
  clearedSessionCookieOptions,
  type BoSessionUser,
} from './session'
// AUDIT-005 F-01 : isIpRateLimited retiré — remplacé par la garde IP
// partagée src/lib/auth-lookup-guard.ts (table auth_lockouts, RPC atomiques).
export { isLockedOut, registerFailedAttempt, resetFailedAttempts } from './lockout'
export { requireBackofficePermission, canAccessZone, type BoAction } from './permission'
export { logAudit } from './audit'
