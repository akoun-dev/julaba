import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireMembreActif, erreurServeur } from '@/lib/cooperatives/resolver'
import { COTISATION_ANNUELLE_FCFA } from '@/lib/cooperatives/regles'
import { awardLoyaltyForEvent } from '@/lib/loyalty/evaluator'

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
    const { merchantId, montant, description, clientId } = body as {
      merchantId?: string
      montant?: number
      description?: string
      clientId?: string
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
    // MODE-935 (I-11) — le montant de la cotisation était posé par une
    // constante CLIENT sans contrepartie serveur : un client modifié
    // pouvait cotiser 1 FCFA et passer « à jour ». La constante partagée
    // (src/lib/cooperatives/regles.ts) est désormais imposée ICI.
    if (montantNum !== COTISATION_ANNUELLE_FCFA) {
      return NextResponse.json(
        {
          erreur: `Montant incorrect — la cotisation annuelle est de ${COTISATION_ANNUELLE_FCFA.toLocaleString('fr-FR')} FCFA`,
        },
        { status: 422 }
      )
    }

    const supabase = createSupabaseAdminClient()
    const annee = new Date().getFullYear()

    // MODE-935 (I-08) — idempotence du rejeu offline : un client_id déjà
    // enregistré pour cette coopérative renvoie la cotisation existante
    // (200, rien re-compté, flag membre non re-touché) — le rejeu d'une
    // cotisation déjà commitée ne devient plus un faux conflit 409.
    const clientTrim = typeof clientId === 'string' && clientId ? clientId.slice(0, 64) : null
    if (clientTrim) {
      const { data: dejaRejouee } = await supabase
        .from('cooperative_transactions')
        .select('id, statut, montant')
        .eq('cooperative_id', garde.ctx.cooperative.id)
        .eq('client_id', clientTrim)
        .maybeSingle()
      if (dejaRejouee) {
        return NextResponse.json(
          { transaction: dejaRejouee, cotisationPayee: true, rejeu: true },
          { status: 200 }
        )
      }
    }

    // Idempotence par année civile : une cotisation validee existe déjà ?
    // MODE-935 (I-11) — le test porte sur CETTE coopérative : un membre
    // exclu (ou ayant quitté) la coopérative A peut cotiser dans B la même
    // année ; l'ancienne requête, sans filtre coopérative, l'en empêchait.
    const debutAnnee = `${annee}-01-01T00:00:00Z`
    const { data: dejaPayee } = await supabase
      .from('cooperative_transactions')
      .select('id')
      .eq('membre_id', merchantId!)
      .eq('cooperative_id', garde.ctx.cooperative.id)
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
        client_id: clientTrim,
      })
      .select('id, statut, montant')
      .single()
    if (errTx) {
      // 23505 = course de rejeus perdue : rendre l'écriture gagnante.
      if ((errTx as { code?: string }).code === '23505' && clientTrim) {
        const { data: gagnante } = await supabase
          .from('cooperative_transactions')
          .select('id, statut, montant')
          .eq('cooperative_id', garde.ctx.cooperative.id)
          .eq('client_id', clientTrim)
          .maybeSingle()
        if (gagnante) {
          return NextResponse.json(
            { transaction: gagnante, cotisationPayee: true, rejeu: true },
            { status: 200 }
          )
        }
      }
      throw errTx
    }

    const { error: errMembre } = await supabase
      .from('cooperative_membres')
      .update({ cotisation_payee: true })
      .eq('id', garde.ctx.membre.id)
    if (errMembre) throw errMembre

    void awardLoyaltyForEvent(supabase, {
      subjectId: merchantId!,
      subjectRole: 'marchand',
      actionType: 'payment',
      source: 'cooperative-contribution',
      sourceId: String(transaction.id),
      amountCfa: montantNum,
      metadata: { cooperativeId: garde.ctx.cooperative.id, clientId: clientTrim },
    }).catch((error) => console.error('[loyalty] attribution cotisation', error))

    return NextResponse.json(
      { transaction, cotisationPayee: true },
      { status: 201 }
    )
  } catch (error) {
    return erreurServeur('cotisation', error)
  }
}
