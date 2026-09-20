import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const producteurId = searchParams.get('producteurId')
    const cycleId = searchParams.get('cycleId')

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    if (!cycleId) {
      return NextResponse.json({ error: 'cycleId requis' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const { data: entries, error } = await supabase
      .from('legacy_producteur_journals')
      .select('*')
      .eq('producteur_id', producteurId!)
      .eq('cycle_id', cycleId)
      .order('date', { ascending: false })

    if (error) throw error

    return NextResponse.json({ entries: entries ?? [] })
  } catch (error) {
    console.error('[API producteur/journal GET]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, producteurId, cycleId, date, texte, photoUrl } = body

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    if (!id || !cycleId || !date || !texte) {
      return NextResponse.json(
        { error: 'Champs requis manquants (id, cycleId, date, texte)' },
        { status: 400 },
      )
    }

    const supabase = createSupabaseAdminClient()

    // Idempotence : une entrée déjà enregistrée avec cet id est renvoyée
    // telle quelle (rejeu offline reconnu, rien re-créé).
    const { data: existing } = await supabase
      .from('legacy_producteur_journals')
      .select('*')
      .eq('id', id)
      .single()

    if (existing) {
      return NextResponse.json(existing, { status: 200 })
    }

    // MODE-935 (audit #003, I-10) — le cycleId du body est vérifié : le
    // cycle doit exister ET appartenir au producteur authentifié (aucune
    // FK vers les cycles en base — c'est ici que l'appartenance se joue).
    // L'appelant est déjà gardé requireDeviceOwner : un cycle étranger
    // répond 404, sans révéler plus que nécessaire.
    const { data: cycle } = await supabase
      .from('legacy_producteur_cycles')
      .select('id, producteur_id')
      .eq('id', cycleId)
      .single()
    if (!cycle || cycle.producteur_id !== producteurId) {
      return NextResponse.json({ error: 'Cycle introuvable pour ce producteur' }, { status: 404 })
    }

    const { data: entry, error: insertError } = await supabase
      .from('legacy_producteur_journals')
      .insert({
        id,
        producteur_id: producteurId,
        cycle_id: cycleId,
        date: new Date(date).toISOString(),
        texte,
        photo_url: photoUrl || null,
      })
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('[API producteur/journal POST]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
