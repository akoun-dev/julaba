import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireMembreActif, erreurServeur } from '@/lib/cooperatives/resolver'

// MODE-921 (§3.3) — cotisation d'un membre MARCHAND. Le membre pose
// lui-même sa cotisation : une entrée catégorie 'cotisation' posée
// DIRECTEMENT 'validee' (convention julaba-app : la cotisation déclarée
// est aussitôt comptée) + le flag cotisation_payee de l'adhésion passe à
// vrai. Idempotence annuelle : si le marchand a déjà payé une cotisation
// validee cette année civile, 409 avec l'état courant (pas de double
// comptage par rejeu).

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { merchantId, montant, description } = body as {
      merchantId?: string
      montant?: number
      description?: string
    }
    const garde = await requireMembreActif(req, merchantId)
    if ('erreur' in garde) return garde.erreur

    const montantNum = Number(montant)
    if (!Number.isFinite(montantNum) || montantNum <= 0 || !Number.isInteger(montantNum)) {
      return NextResponse.json(
        { erreur: 'Montant invalide — la cotisation est un entier FCFA strictement positif' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseAdminClient()
    const annee = new Date().getFullYear()

    // Idempotence par année civile : une cotisation validee existe déjà ?
    const debutAnnee = `${annee}-01-01T00:00:00Z`
    const { data: dejaPayee } = await supabase
      .from('cooperative_transactions')
      .select('id')
      .eq('membre_id', merchantId!)
      .eq('categorie', 'cotisation')
      .eq('statut', 'validee')
      .gte('created_at', debutAnnee)
      .maybeSingle()
    if (dejaPayee) {
      return NextResponse.json(
        { erreur: `Cotisation ${annee} déjà enregistrée` },
        { status: 409 }
      )
    }

    const { data: transaction, error: errTx } = await supabase
      .from('cooperative_transactions')
      .insert({
        cooperative_id: garde.ctx.cooperative.id,
        type: 'entree',
        categorie: 'cotisation',
        montant: montantNum,
        membre_id: merchantId!,
        description:
          typeof description === 'string' && description.trim()
            ? description.trim()
            : `Cotisation ${annee}`,
        statut: 'validee',
        created_by: null,
      })
      .select('id, statut, montant')
      .single()
    if (errTx) throw errTx

    const { error: errMembre } = await supabase
      .from('cooperative_membres')
      .update({ cotisation_payee: true })
      .eq('id', garde.ctx.membre.id)
    if (errMembre) throw errMembre

    return NextResponse.json(
      { transaction, cotisationPayee: true },
      { status: 201 }
    )
  } catch (error) {
    return erreurServeur('cotisation', error)
  }
}
