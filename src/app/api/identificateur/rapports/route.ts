import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'

// IDF-RAP-001 (AUDIT_MATRICE_47_CAS I-03) — résumé des compteurs d'enrôlement
// du MOIS COURANT pour l'identificateur. Route OPTIONNELLE : l'écran
// Statistiques est 100 % local (store), offline-first et ne l'attend PAS.
// Ce serveur répond pour réaffirmer les chiffres (GROUP BY sur le mois),
// filtré identificateur_id — jamais bloquant côté client.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const identificateurId = searchParams.get('identificateurId')

    const auth = await requireDeviceOwner(request, 'identificateur', identificateurId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    const now = new Date()
    const mois = now.getMonth()
    const annee = now.getFullYear()
    const debut = new Date(annee, mois, 1).toISOString()
    const fin = new Date(annee, mois + 1, 1).toISOString()

    const { data, error } = await supabase
      .from('legacy_bo_enrolments')
      .select('status')
      .eq('identificateur_id', identificateurId!)
      .gte('submitted_at', debut)
      .lt('submitted_at', fin)

    if (error) throw error

    // GROUP BY status sur les lignes du mois (PostgREST ne le fait pas
    // nativement sur un select réduit — l'agrégation est locale et le
    // volume mensuel d'un agent reste faible).
    const rows = data ?? []
    const parStatut = {
      en_attente: rows.filter((r) => (r.status ?? 'en_attente') === 'en_attente').length,
      valide: rows.filter((r) => r.status === 'valide').length,
      rejete: rows.filter((r) => r.status === 'rejete').length,
    }
    const verdicts = parStatut.valide + parStatut.rejete

    return NextResponse.json({
      mois,
      annee,
      total: rows.length,
      parStatut,
      tauxAcceptation: verdicts > 0 ? Math.round((parStatut.valide / verdicts) * 100) : 0,
    })
  } catch (error) {
    console.error('[API identificateur/rapports GET]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
