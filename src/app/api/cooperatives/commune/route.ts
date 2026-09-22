import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requirePresident, erreurServeur } from '@/lib/cooperatives/resolver'

// MODE-979 (DET-COOP-008) — le président choisit la commune de SA
// coopérative dans le référentiel GPS (41 communes). Route étroite et
// dédiée (pas de PATCH général réintroduit — MODE-946 avait retiré
// PATCH /cooperatives sans appelant) : commune_id valide obligatoire
// (FK + 400 lisible si inconnu), texte libre `commune` conservé tel quel
// (rétrocompatibilité — la commune liée devient la source de position).
//
// Réponse : la commune écrite (id, nom, region, lat, lng) — l'écran
// affiche un choix réel, jamais une saisie texte libre.

export async function PATCH(req: NextRequest) {
  try {
    const { searchParams, } = new URL(req.url)
    const cooperateurId = searchParams.get('cooperateurId')
    const body = (await req.json()) as { communeId?: unknown }
    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur

    const communeId = typeof body.communeId === 'string' ? body.communeId : ''
    if (!communeId) {
      return NextResponse.json(
        { erreur: 'communeId requis — choisissez une commune dans la liste' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseAdminClient()

    // 400 AVANT écriture si la commune n'existe pas (le FK retournerait
    // une erreur SQL brute 23503 — on préfère un 400 lisible).
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

    const { error: errEcriture } = await supabase
      .from('cooperatives')
      .update({ commune_id: communeId, updated_at: new Date().toISOString() })
      .eq('id', garde.ctx.cooperative.id)
    if (errEcriture) throw errEcriture

    return NextResponse.json({ commune })
  } catch (error) {
    return erreurServeur('[API cooperatives/commune PATCH]', error)
  }
}
