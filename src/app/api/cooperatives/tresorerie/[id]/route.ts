import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requirePresident, erreurServeur } from '@/lib/cooperatives/resolver'

// MODE-921 (§3.3) — validation ou annulation d'une transaction de
// trésorerie (réservée au responsable, double validation). Règles :
//   • seule une transaction 'en_attente' change d'état (validee|annulee) ;
//   • une transaction déjà validée/annulée est immuable (409) — l'état
//     courant est renvoyé, jamais réécrit ;
//   • la validation/annulation est faite par le MÊME responsable qui a
//     créé la coopérative — un second regard (un trésorier distinct)
//     est un chantier futur, noté dans .ai/TASKS.md.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { cooperateurId, statut } = body as { cooperateurId?: string; statut?: string }
    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur

    if (statut !== 'validee' && statut !== 'annulee') {
      return NextResponse.json(
        { erreur: 'Statut invalide (validee|annulee)' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseAdminClient()
    const { data: transaction } = await supabase
      .from('cooperative_transactions')
      .select('id, statut')
      .eq('id', id)
      .eq('cooperative_id', garde.ctx.cooperative.id)
      .maybeSingle()
    if (!transaction) {
      return NextResponse.json({ erreur: 'Transaction non trouvée dans votre coopérative' }, { status: 404 })
    }
    if (transaction.statut !== 'en_attente') {
      return NextResponse.json(
        { erreur: `Transaction déjà ${transaction.statut}`, transaction },
        { status: 409 }
      )
    }

    const { error } = await supabase
      .from('cooperative_transactions')
      .update({ statut })
      .eq('id', id)
    if (error) throw error

    return NextResponse.json({ transaction: { ...transaction, statut } })
  } catch (error) {
    return erreurServeur('tresorerie/[id] PATCH', error)
  }
}
