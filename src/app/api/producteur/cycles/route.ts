import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'

// Task 98-B (audit producteur 97-B1 #2) — API des cycles culturaux.
//
// GET : liste des cycles du producteur (tous statuts). Le carnet de champ
// (journal) reste servi par GET /api/producteur/journal?cycleId=….
//
// POST : démarrage d'un cycle { id, producteurId, produit, parcelle,
// dateSemis, dateRecoltePrevue }. Statut posé 'en_cours' par la base ;
// aucun champ au-delà n'est accepté du client (pas de statut/quantité
// forgés). Idempotence naturelle sur id fourni par l'appareil.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const producteurId = searchParams.get('producteurId')

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    const { data: cycles, error } = await supabase
      .from('legacy_producteur_cycles')
      .select('*')
      .eq('producteur_id', producteurId!)
      .order('date_semis', { ascending: false })

    if (error) throw error

    return NextResponse.json({ cycles: cycles ?? [] })
  } catch (error) {
    console.error('[API producteur/cycles GET]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, producteurId, produit, parcelle, dateSemis, dateRecoltePrevue } = body

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    if (!id || !produit || !dateSemis || !dateRecoltePrevue) {
      return NextResponse.json(
        { error: 'Champs requis manquants (id, produit, dateSemis, dateRecoltePrevue)' },
        { status: 400 },
      )
    }
    if (new Date(dateRecoltePrevue) <= new Date(dateSemis)) {
      return NextResponse.json(
        { error: 'La date de récolte prévue doit être postérieure au semis' },
        { status: 422 },
      )
    }

    const supabase = createSupabaseAdminClient()

    // Idempotence : un cycle déjà enregistré avec cet id est renvoyé tel
    // quel (rejeu offline reconnu, rien re-créé).
    const { data: existing } = await supabase
      .from('legacy_producteur_cycles')
      .select('*')
      .eq('id', id)
      .single()
    if (existing) {
      return NextResponse.json(existing, { status: 200 })
    }

    const { data: cycle, error } = await supabase
      .from('legacy_producteur_cycles')
      .insert({
        id,
        producteur_id: producteurId,
        produit: String(produit).slice(0, 120),
        parcelle: typeof parcelle === 'string' ? parcelle.slice(0, 120) : '',
        date_semis: dateSemis,
        date_recolte_prevue: dateRecoltePrevue,
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json(cycle, { status: 201 })
  } catch (error) {
    console.error('[API producteur/cycles POST]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
