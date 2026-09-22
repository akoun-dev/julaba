import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import {
  RECOLTE_PHOTOS_BUCKET,
  applySignedUrlToValue,
  collectStorageRefsFromValues,
} from '@/lib/producteur/photo-refs'

/**
 * PF-04 extension — remplace les références Storage (`harvest-photos/…`)
 * des photo_url par des URLs de lecture signées (1 h, batch : UN appel
 * createSignedUrls pour tout le GET). DataURL historiques et URL
 * absolues passent intactes ; erreur de signature → la référence reste
 * brute (jamais de 500 ni de crash d'affichage).
 */
async function withResolvedPhotoUrls(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  entries: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  const refs = collectStorageRefsFromValues(entries.map((e) => e.photo_url as string | null))
  const signed = new Map<string, string>()
  if (refs.length > 0) {
    const { data } = await supabase.storage
      .from(RECOLTE_PHOTOS_BUCKET)
      .createSignedUrls(refs.map((ref) => ref.slice(`${RECOLTE_PHOTOS_BUCKET}/`.length)), 3600)
    for (const item of data ?? []) {
      if (item && !item.error && item.signedUrl) {
        signed.set(`${RECOLTE_PHOTOS_BUCKET}/${item.path}`, item.signedUrl)
      }
    }
  }
  return entries.map((e) => ({
    ...e,
    photo_url: applySignedUrlToValue(e.photo_url as string | null, signed),
    photoUrl: applySignedUrlToValue(e.photoUrl as string | null, signed),
  }))
}

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

    const resolved = await withResolvedPhotoUrls(
      supabase,
      (entries ?? []) as unknown as Record<string, unknown>[]
    )

    return NextResponse.json({ entries: resolved })
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
