import type { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

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
    const supabase = createSupabaseAdminClient()
    await supabase.from('legacy_audit_logs').insert({
      user_id: userId,
      user_name: userName,
      user_email: userEmail,
      action,
      module,
      details: details || null,
      ip_address: request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: request?.headers.get('user-agent') || null,
    })
  } catch (err) {
    console.error('Erreur écriture audit log:', err)
  }
}
