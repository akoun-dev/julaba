import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner, requireDeviceSubjectType } from '@/lib/require-owner'
import { transitionRecolteValide } from '@/lib/producteur/statuts'
import { awardLoyaltyForEvent } from '@/lib/loyalty/evaluator'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const producteurId = searchParams.get('producteurId')

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    const { data: recoltes, error } = await supabase
      .from('legacy_producteur_recoltes')
      .select('*')
      .eq('producteur_id', producteurId!)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ recoltes: recoltes ?? [] })
  } catch (error) {
    console.error('[API producteur/recoltes GET]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      id,
      producteurId,
      produit,
      quantiteKg,
      qualite,
      dateRecolte,
      parcelle,
      prixSouhaiteParKg,
      photos,
      statut,
      acheteur,
      montantVente,
      notes,
    } = body

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    if (!id || !produit || quantiteKg == null || !qualite) {
      return NextResponse.json(
        { error: 'Champs requis manquants (id, produit, quantiteKg, qualite)' },
        { status: 400 },
      )
    }

    // FCFA amounts are stored as integers — round to avoid float issues.
    const prix = Math.round(Number(prixSouhaiteParKg) || 0)
    const montant = montantVente == null ? null : Math.round(Number(montantVente) || 0)
    if (prix < 0 || (montant !== null && montant < 0)) {
      return NextResponse.json({ error: 'Les montants ne peuvent pas être négatifs' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const { data: existing } = await supabase
      .from('legacy_producteur_recoltes')
      .select('*')
      .eq('id', id)
      .single()

    if (existing) {
      return NextResponse.json(existing, { status: 200 })
    }

    const { data: recolte, error: insertError } = await supabase
      .from('legacy_producteur_recoltes')
      .insert({
        id,
        producteur_id: producteurId,
        produit,
        quantite_kg: quantiteKg,
        qualite,
        date_recolte: new Date(dateRecolte).toISOString(),
        parcelle: parcelle || '',
        prix_souhaite_par_kg: prix,
        photos: JSON.stringify(photos || []),
        statut: statut || 'brouillon',
        acheteur: acheteur || null,
        montant_vente: montant,
        notes: notes || null,
      })
      .select()
      .single()

    if (insertError) throw insertError

    void awardLoyaltyForEvent(supabase, {
      subjectId: producteurId,
      subjectRole: 'producteur',
      actionType: 'harvest',
      source: 'harvest',
      sourceId: String(recolte.id),
      metadata: { product: produit, quantityKg: quantiteKg, clientId: id },
    }).catch((error) => console.error('[loyalty] attribution récolte', error))

    return NextResponse.json(recolte, { status: 201 })
  } catch (error) {
    console.error('[API producteur/recoltes POST]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, statut, acheteur, montantVente } = body

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    // MODE-935 (S-13) — auth AVANT lookup : la session doit exister et
    // appartenir au royaume producteur avant toute recherche. Un appelant
    // sans session reçoit 401 (et non un 404 qui masque l'authentification).
    const typeAuth = await requireDeviceSubjectType(request, 'producteur')
    if (typeAuth) return typeAuth

    const { data: existing, error: findError } = await supabase
      .from('legacy_producteur_recoltes')
      .select('*')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ error: 'Récolte introuvable' }, { status: 404 })
    }
    const auth = await requireDeviceOwner(request, 'producteur', existing.producteur_id)
    if (auth) return auth

    if (montantVente !== undefined && montantVente !== null) {
      const rounded = Math.round(Number(montantVente))
      if (!Number.isFinite(rounded) || rounded < 0) {
        return NextResponse.json({ error: 'Montant de vente invalide' }, { status: 400 })
      }
    }

    const updateData: Record<string, unknown> = {}
    if (statut) {
      // MODE-935 (I-12) — transition validée (machine à états pur testée,
      // CHECK SQL en base). Un rejeu du même statut reste idempotent.
      if (typeof statut !== 'string' || !transitionRecolteValide(existing.statut, statut)) {
        return NextResponse.json(
          { error: `Transition de statut interdite (${existing.statut} → ${String(statut)})` },
          { status: 409 },
        )
      }
      if (statut !== existing.statut) updateData.statut = statut
    }
    if (acheteur !== undefined) updateData.acheteur = acheteur
    if (montantVente !== undefined) {
      updateData.montant_vente = montantVente === null ? null : Math.round(Number(montantVente))
    }

    // Rien à écrire (rejeu strictement identique) : état courant rendu.
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(existing)
    }

    const { data: recolte, error: updateError } = await supabase
      .from('legacy_producteur_recoltes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    return NextResponse.json(recolte)
  } catch (error) {
    console.error('[API producteur/recoltes PATCH]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
