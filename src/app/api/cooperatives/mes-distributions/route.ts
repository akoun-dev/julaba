import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireMarchandSession, erreurServeur } from '@/lib/cooperatives/resolver'

// MODE-921 (§3.4) — historique des distributions REÇUES par le marchand
// (30 dernières, même contrat que mes-distributions de julaba-app).
// Accessible à tout marchand connecté : l'historique survit à une
// suspension d'adhésion (ce qui a été reçu a été reçu).

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const merchantId = searchParams.get('merchantId')
    const garde = await requireMarchandSession(req, merchantId)
    if (garde) return garde

    const supabase = createSupabaseAdminClient()
    const { data: mouvements, error } = await supabase
      .from('cooperative_stock_mouvements')
      .select('id, produit, unite, quantite, cooperative_id, created_at')
      .eq('membre_id', merchantId!)
      .eq('type', 'distribution')
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) throw error

    return NextResponse.json({
      distributions: (mouvements ?? []).map((m) => ({
        id: m.id,
        produit: m.produit,
        unite: m.unite,
        quantite: Number(m.quantite),
        cooperativeId: m.cooperative_id,
        date: m.created_at,
      })),
    })
  } catch (error) {
    return erreurServeur('mes-distributions', error)
  }
}
