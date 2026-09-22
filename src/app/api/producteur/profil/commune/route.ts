import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'

// MODE-979 (DET-COOP-008) — le producteur déclare SA commune (profil
// producteur). Condition de la parité julaba-app §4.3 : sans commune
// producteur, ses récoltes n'ont pas de distance dans la vue
// « Récoltes prévues » de la coopérative (elles restent listées, en fin
// de liste, sans distance inventée).
//
// GET  : la commune courante (null = jamais choisie — l'écran affiche
//        « non définie », pas de valeur inventée).
// PATCH : commune_id valide obligatoire (400 lisible si inconnu),
//         aucune autre colonne de profil n'est écrivable ici.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const producteurId = searchParams.get('producteurId')

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    const { data } = await supabase
      .from('producers')
      .select('commune:communes(id, nom, region)')
      .eq('id', producteurId!)
      .maybeSingle()
    if (!data) {
      return NextResponse.json({ erreur: 'Compte introuvable' }, { status: 404 })
    }

    return NextResponse.json({ commune: (data as { commune: { id: string; nom: string; region: string } | null }).commune })
  } catch (error) {
    console.error('[API producteur/profil/commune GET]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const producteurId = searchParams.get('producteurId')

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    const body = (await request.json()) as { communeId?: unknown }
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
      .from('producers')
      .update({ commune_id: communeId, updated_at: new Date().toISOString() })
      .eq('id', producteurId!)
    if (error) throw error

    return NextResponse.json({ commune })
  } catch (error) {
    console.error('[API producteur/profil/commune PATCH]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
