import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requirePresident, erreurServeur } from '@/lib/cooperatives/resolver'

// MODE-921 (§3.2) — recherche d'un marchand par téléphone (réservée au
// responsable, pour l'ajout direct de membre). Renvoie le compte sanitisé
// (jamais de hash) SANS révéler si le marchand est membre — le POST
// membres fait le 409 propre. Normalisation du numéro identique à
// normalizeAuthPhone (auth-multi) : espaces/indicatif +225 tolérés.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const cooperateurId = searchParams.get('cooperateurId')
    const phone = searchParams.get('phone')
    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur

    if (!phone) {
      return NextResponse.json({ erreur: 'Téléphone requis' }, { status: 400 })
    }
    const normalise = phone.replace(/[^\d]/g, '').replace(/^225(?=\d{10})/, '')
    if (normalise.length < 10) {
      return NextResponse.json({ erreur: 'Numéro invalide' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: marchand } = await supabase
      .from('merchants')
      .select('id, first_name, last_name, phone')
      .eq('phone', normalise)
      .maybeSingle()

    if (!marchand) {
      return NextResponse.json({ erreur: 'Aucun marchand avec ce numéro' }, { status: 404 })
    }

    // Contexte d'adhésion (utile pour un libellé honnête avant l'ajout).
    const { data: adhesion } = await supabase
      .from('cooperative_membres')
      .select('id, cooperative_id, statut, cooperative:cooperatives(nom)')
      .eq('membre_id', marchand.id)
      .eq('actif', true)
      .maybeSingle()

    return NextResponse.json({
      marchand: {
        id: marchand.id,
        prenom: marchand.first_name,
        nom: marchand.last_name,
        telephone: marchand.phone,
      },
      adhesionActuelle: adhesion
        ? {
            cooperativeNom: (adhesion as { cooperative: { nom: string } | null }).cooperative?.nom ?? null,
            statut: (adhesion as { statut: string }).statut,
          }
        : null,
    })
  } catch (error) {
    return erreurServeur('search-marchand', error)
  }
}
