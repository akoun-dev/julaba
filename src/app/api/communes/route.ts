import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceSessionAny } from '@/lib/require-owner'

// MODE-979 (DET-COOP-008) — annuaire du référentiel `communes`
// (41 communes GPS, migration 20260922100000). Consommé par :
//   - le président (paramètres de la coopérative → choisir sa commune) ;
//   - le producteur (profil → déclarer sa commune, condition du tri
//     Haversine des « Récoltes prévues » côté coopérative).
// Aucune donnée personnelle : id + nom + région + coords de référence.
// La session appareil (quel que soit le royaume) est vérifiée —
// l'annuaire n'est pas une ressource publique anonyme.

export async function GET(request: NextRequest) {
  try {
    const garde = await requireDeviceSessionAny(request, [
      'merchant',
      'producteur',
      'cooperateur',
      'identificateur',
    ])
    if (garde) return garde

    const supabase = createSupabaseAdminClient()

    const { data, error } = await supabase
      .from('communes')
      .select('id, nom, region, lat, lng')
      .order('nom', { ascending: true })

    if (error) throw error

    return NextResponse.json({ communes: data ?? [] })
  } catch (error) {
    console.error('[API communes GET]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
