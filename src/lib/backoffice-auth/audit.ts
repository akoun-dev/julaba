import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'

interface LogAuditParams {
  userId: string
  userName: string
  userEmail: string
  action: string
  module: string
  details?: string
  request?: NextRequest
}

/** Best-effort audit log write — never throws, never blocks the response. */
export async function logAudit({ userId, userName, userEmail, action, module, details, request }: LogAuditParams): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        userName,
        userEmail,
        action,
        module,
        details,
        ipAddress: request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        userAgent: request?.headers.get('user-agent') || null,
      },
    })
  } catch (err) {
    console.error('Erreur écriture audit log:', err)
  }
}
