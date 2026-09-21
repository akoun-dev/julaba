import type { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { nextActeurId, type ActeurPrefix } from './actor-id'

// MODE-941 (AUDIT-003 I-09) — côté serveur : création d'un acteur avec un
// actor_id séquentiel et RÉESSAI en cas de course concurrente (23505 sur
// la colonne UNIQUE) — la séquence est recalculée après chaque collision
// (max 3 essais), comme le pipeline JID. La lecture des actor_id
// existants précède chaque tentative : pas de compteur lire-modifier-
// écrire local, la base fait foi.

type SupabaseLike = ReturnType<typeof createSupabaseAdminClient>
type InsertError = { code?: string; message: string } | null

export async function createActeurAvecIdUnique(
  supabase: SupabaseLike,
  payload: Record<string, unknown>,
  prefix: ActeurPrefix,
): Promise<{ data: Record<string, unknown> | null; error: InsertError }> {
  const DERNIER_ESSAI = 3
  for (let essai = 1; essai <= DERNIER_ESSAI; essai++) {
    const { data: rows, error: readError } = await supabase
      .from('legacy_bo_actors')
      .select('actor_id')
    if (readError) return { data: null, error: readError as { code?: string; message: string } }

    const ids = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => r.actor_id as string)
    const actorId = nextActeurId(ids, prefix)

    const { data, error } = await supabase
      .from('legacy_bo_actors')
      .insert({ ...payload, actor_id: actorId })
      .select()
      .single()

    if (!error) return { data, error: null }
    const code = (error as { code?: string }).code
    if (code === '23505' && essai < DERNIER_ESSAI) continue
    return { data: null, error: error as { code?: string; message: string } }
  }
  return {
    data: null,
    error: { code: '23505', message: `actor_id ${prefix} toujours en conflit après ${DERNIER_ESSAI} essais` },
  }
}
