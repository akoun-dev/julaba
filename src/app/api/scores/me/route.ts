import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { scoreCooperateur, scoreMarchand } from '@/lib/scores/scores-service'

// MODE-932 — GET /api/scores/me : le score JULABA du compte appelant.
//
// Invariant julaba-app (score-membres-cooperative.spec) : ce score est la
// MÊME SOURCE que l'enrichissement de GET /cooperatives/membres — la
// fonction batchée scores-service est partagée, sans N+1.
//
// Garde : session appareil (requireDeviceOwner) — chacun ne lit que SON
// score. Le marchand hors coopérative obtient quand même un score honnête
// (signaux coopératifs simplement absents).

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const merchantId = searchParams.get('merchantId')
    const cooperateurId = searchParams.get('cooperateurId')

    if (cooperateurId) {
      const garde = await requireDeviceOwner(req, 'cooperateur', cooperateurId)
      if (garde) return garde

      const supabase = createSupabaseAdminClient()
      const { data: coop } = await supabase
        .from('cooperatives')
        .select('id')
        .eq('responsable_id', cooperateurId)
        .eq('actif', true)
        .maybeSingle()
      if (!coop) {
        return NextResponse.json({ erreur: 'Aucune coopérative trouvée pour ce compte' }, { status: 404 })
      }
      const detail = await scoreCooperateur(supabase, (coop as { id: string }).id)
      return NextResponse.json({ role: 'cooperateur', ...detail })
    }

    const garde = await requireDeviceOwner(req, 'merchant', merchantId)
    if (garde) return garde

    const supabase = createSupabaseAdminClient()

    // Adhésion ACTIVE éventuelle — elle porte les signaux coopératifs
    // (cotisation validée, apports au pot commun).
    const { data: adhesion } = await supabase
      .from('cooperative_membres')
      .select('cooperative_id')
      .eq('membre_id', merchantId!)
      .eq('actif', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const cooperativeId = (adhesion as { cooperative_id: string } | null)?.cooperative_id ?? null
    const detail = await scoreMarchand(supabase, merchantId!, cooperativeId)
    return NextResponse.json({ role: 'marchand', ...detail })
  } catch (error) {
    console.error('[API scores/me]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
