/**
 * Purge les liaisons d'appareil obsolètes pour les comptes de test
 * marchand-1 (0701020304) et producteur-1 (0744444444), afin de permettre
 * la connexion depuis l'appareil de test actuel.
 * Usage : bun scripts/clear-device-sessions.ts
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Variables Supabase manquantes (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}

const supabase = createClient(url, key)

const subjects = ['merchant:merchant-1', 'producteur:producteur-1']
const { data: before, error: selErr } = await supabase
  .from('device_sessions')
  .select('subject, token_hash, expires_at')
  .in('subject', subjects)

if (selErr) {
  console.error('Erreur SELECT:', selErr.message)
  process.exit(1)
}
console.log('Sessions trouvées:', JSON.stringify(before, null, 2))

const { data: deleted, error: delErr } = await supabase
  .from('device_sessions')
  .delete()
  .in('subject', subjects)
  .select('subject')

if (delErr) {
  console.error('Erreur DELETE:', delErr.message)
  process.exit(1)
}
console.log('Supprimées:', deleted?.length ?? 0)
