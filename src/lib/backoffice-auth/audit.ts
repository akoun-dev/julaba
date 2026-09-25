import type { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { normalizeIp } from '@/lib/auth-pin'

interface LogAuditParams {
  userId: string
  userName: string
  userEmail: string
  action: string
  module: string
  details?: string
  request?: NextRequest
}

/** Best-effort audit log write — never throws, never blocks the response.
 * MODE-1005 (AUDIT-012 P2) : l'erreur SUPABASE (RLS, contrainte, réseau au
 * niveau PostgREST) n'est plus avalée — elle est journalisée. Le contrat
 * reste « ne jamais bloquer la réponse métier » : une panne du journal
 * d'audit ne doit pas empêcher l'action demandée, mais elle doit laisser
 * une trace exploitable dans les logs serveur. */
export async function logAudit({ userId, userName, userEmail, action, module, details, request }: LogAuditParams): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase.from('legacy_audit_logs').insert({
      user_id: userId,
      user_name: userName,
      user_email: userEmail,
      action,
      module,
      details: details || null,
      // MODE-1005 : sémantique XFF centralisée (normalizeIp, repli null).
      ip_address: request ? normalizeIp(request.headers.get('x-forwarded-for'), null) : null,
      user_agent: request?.headers.get('user-agent') || null,
    })
    if (error) {
      console.error('Erreur écriture audit log:', error)
    }
  } catch (err) {
    console.error('Erreur écriture audit log:', err)
  }
}
