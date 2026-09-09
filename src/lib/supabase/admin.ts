import { createClient } from '@supabase/supabase-js'
import { supabasePublicEnv, supabaseServiceRoleKey } from './env'

let adminClient: any | undefined

/**
 * Use only from trusted server jobs. This client bypasses every RLS policy.
 *
 * Typed as `any` so `.from()` accepts any table name, including the legacy_*
 * tables. When `supabase gen types typescript` is re-run with the full schema,
 * restore proper typing.
 */
export function createSupabaseAdminClient() {
  if (adminClient) return adminClient
  const { url } = supabasePublicEnv()
  adminClient = createClient(url, supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return adminClient
}
