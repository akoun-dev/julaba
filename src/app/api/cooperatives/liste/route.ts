import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireMarchandSession, erreurServeur } from '@/lib/cooperatives/resolver'

// MODE-921 (§2.4) — annuaire des coopératives actives : alimente le
// menu « Rejoindre » de l'écran marchand « Ma coopérative ». Données
// réellement en base : nom, commune, nom du responsable (jointure
// cooperateurs), nombre de membres actifs.
// MODE-922 : la garde de session appareil promise par le commentaire
// d'origine est désormais réelle (requireMarchandSession) — l'annuaire
// n'est plus lisible par un appelant anonyme.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const merchantId = searchParams.get('merchantId')
    const garde = await requireMarchandSession(req, merchantId)
    if (garde) return garde

    const supabase = createSupabaseAdminClient()

    const { data: cooperatives, error } = await supabase
      .from('cooperatives')
      .select('id, nom, commune, responsable_id, created_at')
      .eq('actif', true)
      .order('nom', { ascending: true })
    if (error) throw error

    const liste = cooperatives ?? []
    if (liste.length === 0) {
      return NextResponse.json({ cooperatives: [] })
    }

    // Noms des responsables + compteurs de membres actifs en batch (2
    // requêtes totales, pas de N+1 — le modèle est le chargement batché
    // des scores de julaba-app).
    const responsableIds = Array.from(new Set(liste.map((c) => c.responsable_id)))
    const { data: responsables } = await supabase
      .from('cooperateurs')
      .select('id, first_name')
      .in('id', responsableIds)
    const nomsResponsables = new Map((responsables ?? []).map((r) => [r.id, r.first_name]))

    const { data: comptesMembres } = await supabase
      .from('cooperative_membres')
      .select('cooperative_id')
      .in(
        'cooperative_id',
        liste.map((c) => c.id)
      )
      .eq('statut', 'actif')
    const nbMembres = ((comptesMembres ?? []) as { cooperative_id: string }[]).reduce<Record<string, number>>(
      (acc, m) => {
        acc[m.cooperative_id] = (acc[m.cooperative_id] || 0) + 1
        return acc
      },
      {}
    )

    return NextResponse.json({
      cooperatives: liste.map((c) => ({
        id: c.id,
        nom: c.nom,
        commune: c.commune,
        responsableNom: nomsResponsables.get(c.responsable_id) ?? null,
        membresActifs: nbMembres[c.id] || 0,
        createdAt: c.created_at,
      })),
    })
  } catch (error) {
    return erreurServeur('liste', error)
  }
}
