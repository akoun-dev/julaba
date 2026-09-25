import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * AUDIT-012 P1-11 — probe de PRÊT (readiness) : les dépendances nécessaires
 * au trafic répondent. Un simple head-count sur une table de référence
 * suffit (pas de lecture de données, pas de secret dans la réponse).
 * 200 = prêt à servir · 503 = dépendance indisponible (l'orchestrateur peut
 * retirer l'instance du trafic sans la tuer, contrairement à /api/healthz).
 */
export async function GET() {
  try {
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase
      .from('bo_users')
      .select('id', { count: 'exact', head: true })
    if (error) throw error
    return NextResponse.json({ status: 'ready', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[readyz] dépendance indisponible:', error)
    return NextResponse.json(
      { status: 'unavailable', timestamp: new Date().toISOString() },
      { status: 503 }
    )
  }
}
