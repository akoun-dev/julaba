import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { formatZodError } from '@/lib/validation/marchand'

// MODE-985 (DET-COOP-011 tranche 2) — le marchand déclare SA commune
// (profil marchand). Miroir exact de /api/producteur/profil/commune
// (MODE-979) sur la même table référentielle communes : sans commune
// déclarée, le marchand n'apparaît que dans le filtre « Toutes » de la
// liste membres de sa coopérative — les filtres région/commune ne
// devinent JAMAIS une localisation.
//
// GET   : la commune courante (null = jamais choisie — l'écran affiche
//         « non définie », pas de valeur inventée).
// PATCH : commune_id valide obligatoire (400 lisible si inconnu, AVANT
//         toute écriture), aucune autre colonne de profil n'est
//         écrivable ici (route étroite dédiée — pas de PATCH général,
//         leçon MODE-946).

// MODE-1007 — PATCH : le payload du rejeu offline est { marchandId,
// communeId } (marchand-commune.ts) ; seul communeId est consommé. Le typeof
// string alimente le 400 TESTÉ « communeId requis — choisissez une commune
// dans la liste » pour toute valeur non-string → le champ reste à la
// validation manuelle (z.unknown()) ; le schéma n'apporte que la garantie
// « corps = objet JSON ».
const communePatchSchema = z.object({
  communeId: z.unknown().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const marchandId = searchParams.get('marchandId')

    const auth = await requireDeviceOwner(request, 'merchant', marchandId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    const { data } = await supabase
      .from('merchants')
      .select('commune:communes(id, nom, region)')
      .eq('id', marchandId!)
      .maybeSingle()
    if (!data) {
      return NextResponse.json({ erreur: 'Compte introuvable' }, { status: 404 })
    }

    return NextResponse.json({ commune: (data as { commune: { id: string; nom: string; region: string } | null }).commune })
  } catch (error) {
    console.error('[API marchand/profil/commune GET]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const marchandId = searchParams.get('marchandId')

    const auth = await requireDeviceOwner(request, 'merchant', marchandId)
    if (auth) return auth

    const body = (await request.json()) as { communeId?: unknown }
    const parsed = communePatchSchema.safeParse(body ?? {})
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const communeId = typeof body.communeId === 'string' ? body.communeId : ''
    if (!communeId) {
      return NextResponse.json(
        { erreur: 'communeId requis — choisissez une commune dans la liste' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseAdminClient()

    // 400 AVANT écriture si la commune n'existe pas (FK = 23503 sinon).
    const { data: commune } = await supabase
      .from('communes')
      .select('id, nom, region, lat, lng')
      .eq('id', communeId)
      .maybeSingle()
    if (!commune) {
      return NextResponse.json(
        { erreur: 'Commune inconnue — choisissez une commune du référentiel' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('merchants')
      .update({ commune_id: communeId, updated_at: new Date().toISOString() })
      .eq('id', marchandId!)
    if (error) throw error

    return NextResponse.json({ commune })
  } catch (error) {
    console.error('[API marchand/profil/commune PATCH]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
