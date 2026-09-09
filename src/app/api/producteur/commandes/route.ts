import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'
import { createNotification } from '@/lib/notifications'
import { formatFCFA } from '@/lib/voice/localIntent'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const producteurId = searchParams.get('producteurId')

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    const { data: commandes, error } = await supabase
      .from('legacy_producteur_commandes')
      .select('*')
      .eq('producteur_id', producteurId!)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ commandes: commandes ?? [] })
  } catch (error) {
    console.error('[API producteur/commandes GET]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// A commande isn't authored by the producteur it's addressed to (unlike
// recoltes/journal), so there's no producteur device session to check it
// against — the real identity here is whoever is placing the order on the
// producteur's behalf, which today is backoffice staff recording a buyer's
// order (see bo-producteurs-screen.tsx), hence requireBackofficePermission
// rather than requireDeviceOwner.
export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'producteurs', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const {
      id,
      producteurId,
      reference,
      acheteurNom,
      produit,
      quantiteKg,
      montant,
      dateLivraisonSouhaitee,
      statut,
      urgent,
      transporteur,
    } = body

    if (!id || !producteurId || !reference || !acheteurNom || !produit) {
      return NextResponse.json(
        { error: 'Champs requis manquants (id, producteurId, reference, acheteurNom, produit)' },
        { status: 400 },
      )
    }

    const supabase = createSupabaseAdminClient()

    const { data: existing } = await supabase
      .from('legacy_producteur_commandes')
      .select('*')
      .eq('id', id)
      .single()

    if (existing) {
      return NextResponse.json(existing, { status: 200 })
    }

    const { data: refConflict } = await supabase
      .from('legacy_producteur_commandes')
      .select('*')
      .eq('reference', reference)
      .single()

    if (refConflict) {
      return NextResponse.json(refConflict, { status: 200 })
    }

    // FCFA amount is stored as an integer.
    const montantInt = Math.round(Number(montant) || 0)
    if (montantInt < 0) {
      return NextResponse.json({ error: 'Le montant ne peut pas être négatif' }, { status: 400 })
    }

    const { data: commande, error: insertError } = await supabase
      .from('legacy_producteur_commandes')
      .insert({
        id,
        producteur_id: producteurId,
        reference,
        acheteur_nom: acheteurNom,
        produit,
        quantite_kg: quantiteKg || 0,
        montant: montantInt,
        date_livraison_souhaitee: dateLivraisonSouhaitee
          ? new Date(dateLivraisonSouhaitee).toISOString()
          : new Date().toISOString(),
        statut: statut || 'a_traiter',
        urgent: urgent || false,
        transporteur: transporteur || null,
      })
      .select()
      .single()

    if (insertError) throw insertError

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'commande_create', module: 'producteurs',
      details: `Commande ${commande.reference} pour producteur ${producteurId} (${acheteurNom})`, request,
    })

    await createNotification({
      subjectType: 'producteur', subjectId: producteurId, type: 'commande_recue',
      title: 'Nouvelle commande',
      body: `${acheteurNom} a commandé ${quantiteKg || 0} kg de ${produit}${urgent ? ' — urgent' : ''} (${formatFCFA(montantInt)}).`,
      data: { commandeId: commande.id },
    })

    return NextResponse.json(commande, { status: 201 })
  } catch (error) {
    console.error('[API producteur/commandes POST]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, statut, transporteur } = body

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const { data: existing, error: findError } = await supabase
      .from('legacy_producteur_commandes')
      .select('*')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }
    const auth = await requireDeviceOwner(request, 'producteur', existing.producteur_id)
    if (auth) return auth

    const updateData: Record<string, unknown> = {}
    if (statut) updateData.statut = statut
    if (transporteur !== undefined) updateData.transporteur = transporteur

    const { data: commande, error: updateError } = await supabase
      .from('legacy_producteur_commandes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    return NextResponse.json(commande)
  } catch (error) {
    console.error('[API producteur/commandes PATCH]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
