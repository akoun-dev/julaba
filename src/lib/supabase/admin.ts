import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { supabasePublicEnv, supabaseServiceRoleKey } from './env'

let adminClient: any | undefined

/**
 * Use only from trusted server jobs. This client bypasses every RLS policy.
 *
 * Typed as `any` so `.from()` accepts any table name, including the legacy_*
 * tables. When `supabase gen types typescript` is re-run with the full schema,
 * restore proper typing. (DET-008 : la garde `server-only` en tête de fichier
 * fait échouer le build Next si un composant client importe ce module — le
 * typage `any`, lui, reste couvert par A5-F15, régénération des types via
 * schéma live, credential DB requis.)
 *
 * Procédure de regénération (NORM-305 — le CLI v2.117 est fonctionnel mais
 * son introspection de schéma exige Docker/Podman, absents de la sandbox de
 * code ; constaté : « docker: command not found ») :
 *
 *   npx supabase gen types typescript \
 *     --db-url "postgresql://<proj>.<host>.pooler.supabase.com:5432/postgres" \
 *     --schema public > src/lib/supabase/database.types.ts
 *
 * Écart constaté au 2026-09-19 : 47 des 64 tables utilisées par le code
 * manquent au fichier commité (merchants, producers, legacy_*, bo_*,
 * device_*, tables merchant_stock_ / purchases / transfers…). Toute
 * régénération DOIT passer par le schéma live — ne jamais compléter à la
 * main (fidélité des nullabilités et défauts impossible à garantir).
 */
export function createSupabaseAdminClient() {
  if (adminClient) return adminClient
  const { url } = supabasePublicEnv()
  adminClient = createClient(url, supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return adminClient
}
