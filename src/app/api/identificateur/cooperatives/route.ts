import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'

// DET-COOP-007 (MODE-978) — annuaire minimal des coopératives pour le
// wizard d'identification : quand l'agent coche « adhésion coopérative »,
// il choisit la coopérative dans CETTE liste. Aucune donnée personnelle
// (id + nom des coopératives actives seulement) ; la session appareil
// identificateur est vérifiée (même garde que /api/identificateur/dossiers,
// les appareils ident n'ont pas de session backoffice).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const identificateurId = searchParams.get('identificateurId')

    const auth = await requireDeviceOwner(request, 'identificateur', identificateurId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    const { data, error } = await supabase
      .from('cooperatives')
      .select('id, nom')
      .eq('actif', true)
      .order('nom', { ascending: true })

    if (error) throw error

    return NextResponse.json({ cooperatives: data ?? [] })
  } catch (error) {
    console.error('[API identificateur/cooperatives GET]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
