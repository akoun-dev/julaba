import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner, requireDeviceSubjectType } from '@/lib/require-owner'

// Task 98-B (audit producteur 97-B1 #2) — API des cycles culturaux.
//
// GET : liste des cycles du producteur (tous statuts). Le carnet de champ
// (journal) reste servi par GET /api/producteur/journal?cycleId=….
//
// POST : démarrage d'un cycle { id, producteurId, produit, parcelle,
// dateSemis, dateRecoltePrevue }. Statut posé 'en_cours' par la base ;
// aucun champ au-delà n'est accepté du client (pas de statut/quantité
// forgés). Idempotence naturelle sur id fourni par l'appareil.
//
// MODE-935 (audit #003, I-03) :
//   • POST refuse un second cycle 'en_cours' (409) — l'UI n'en affiche
//     qu'un : des cycles concurrents devenaient invisibles ET inclosables ;
//   • PATCH clôture le cycle { id, producteurId, statut: 'termine',
//     quantiteRecolteeKg ≥ 0 } — la quantité réellement récoltée est un
//     chiffre saisi par le producteur, jamais déduit du prévisionnel.

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

    // MODE-935 (I-03) — garde « un seul cycle en cours » : le producteur
    // doit clôturer le cycle courant avant d'en démarrer un autre. Le
    // rejeu offline reste possible : un cycle retrouvé par son id est
    // déjà reconnu au-dessus.
    const { data: cycleOuvert } = await supabase
      .from('legacy_producteur_cycles')
      .select('id')
      .eq('producteur_id', producteurId)
      .eq('statut', 'en_cours')
      .maybeSingle()
    if (cycleOuvert) {
      return NextResponse.json(
        { error: 'Un cycle est déjà en cours — terminez-le avant d’en démarrer un autre.' },
        { status: 409 },
      )
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

// MODE-935 (I-03) — clôture d'un cycle. S-13 : la session est vérifiée
// (existence + royaume producteur) AVANT la recherche du cycle — un
// appelant non authentifié reçoit 401, pas un 404 mensonger.
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, producteurId, statut, quantiteRecolteeKg } = body as {
      id?: string
      producteurId?: string
      statut?: string
      quantiteRecolteeKg?: number
    }

    const typeAuth = await requireDeviceSubjectType(request, 'producteur')
    if (typeAuth) return typeAuth

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    if (!id || !producteurId) {
      return NextResponse.json({ error: 'Champs requis manquants (id, producteurId)' }, { status: 400 })
    }
    // Seule transition supportée : la clôture. Le CHECK SQL
    // (20260921020000) borne déjà l'union à en_cours|termine.
    if (statut !== 'termine') {
      return NextResponse.json(
        { error: 'Seule la clôture est supportée (statut: "termine")' },
        { status: 400 },
      )
    }
    const quantite = Number(quantiteRecolteeKg)
    if (!Number.isFinite(quantite) || quantite < 0) {
      return NextResponse.json(
        { error: 'quantiteRecolteeKg requis — nombre de kilogrammes ≥ 0' },
        { status: 422 },
      )
    }

    const supabase = createSupabaseAdminClient()

    const { data: cycle, error: findError } = await supabase
      .from('legacy_producteur_cycles')
      .select('*')
      .eq('id', id)
      .single()
    if (findError || !cycle) {
      return NextResponse.json({ error: 'Cycle introuvable' }, { status: 404 })
    }
    // Le cycle doit appartenir AU producteur authentifié (I-10 du même
    // audit, appliqué ici aussi : un id forgé ne traverse jamais).
    if (cycle.producteur_id !== producteurId) {
      return NextResponse.json({ error: 'Cycle introuvable' }, { status: 404 })
    }

    // Idempotence : un rejeu d'une clôture déjà enregistrée renvoie
    // l'état courant (le rejeu offline ne doit pas tourner en conflit).
    if (cycle.statut === 'termine') {
      return NextResponse.json(cycle, { status: 200 })
    }

    const { data: clos, error: updateError } = await supabase
      .from('legacy_producteur_cycles')
      .update({ statut: 'termine', quantite_recoltee_kg: quantite })
      .eq('id', id)
      .select('*')
      .single()
    if (updateError) throw updateError

    return NextResponse.json(clos)
  } catch (error) {
    console.error('[API producteur/cycles PATCH]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
