import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

// Read-only backoffice visibility into the producteur module's data.
// ProducteurRecolte/ProducteurCommande/ProducteurJournal previously had no
// admin-facing screen or route at all — unlike identificateur dossiers
// (visible via bo-enrolement-screen.tsx), a backoffice admin had no way to
// see or moderate anything a producteur recorded. producteurId is a bare
// client-generated id (same as merchantId); since /api/session/link-actor
// now backfills a BoActor row for self-service registrations, this joins
// against BoActor.producteurId where one exists so real names/phones show
// up instead of a truncated id — falling back to the raw id for producteurs
// who registered before that linking existed.
export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'producteurs', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const statut = searchParams.get('statut')

    const supabase = createSupabaseAdminClient()

    const [recoltesResult, commandesResult] = await Promise.all([
      statut
        ? supabase
            .from('legacy_producteur_recoltes')
            .select('*')
            .eq('statut', statut)
            .order('created_at', { ascending: false })
            .limit(200)
        : supabase
            .from('legacy_producteur_recoltes')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200),
      supabase
        .from('legacy_producteur_commandes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    if (recoltesResult.error) throw recoltesResult.error
    if (commandesResult.error) throw commandesResult.error

    const recoltes = (recoltesResult.data ?? []).map((r) => ({
      id: r.id,
      producteurId: r.producteur_id,
      produit: r.produit,
      quantiteKg: r.quantite_kg,
      qualite: r.qualite,
      statut: r.statut,
      prixSouhaiteParKg: r.prix_souhaite_par_kg,
      createdAt: r.created_at,
    }))
    const commandes = (commandesResult.data ?? []).map((c) => ({
      id: c.id,
      producteurId: c.producteur_id,
      reference: c.reference,
      acheteurNom: c.acheteur_nom,
      produit: c.produit,
      quantiteKg: c.quantite_kg,
      montant: c.montant,
      statut: c.statut,
      urgent: c.urgent,
      createdAt: c.created_at,
    }))

    const producteurIds = [...new Set([...recoltes.map((r) => r.producteurId), ...commandes.map((c) => c.producteurId)])]

    let actors: Array<{ producteur_id: string; first_name: string; last_name: string; phone: string; zone: string }> = []
    if (producteurIds.length > 0) {
      const { data, error } = await supabase
        .from('legacy_bo_actors')
        .select('producteur_id, first_name, last_name, phone, zone')
        .in('producteur_id', producteurIds)
      if (error) throw error
      actors = data ?? []
    }
    const actorByProducteurId = Object.fromEntries(actors.map((a) => [a.producteur_id, {
      firstName: a.first_name,
      lastName: a.last_name,
      phone: a.phone,
      zone: a.zone,
    }]))

    return NextResponse.json({
      recoltes,
      commandes,
      producteurCount: producteurIds.length,
      actorByProducteurId,
    })
  } catch (error) {
    console.error('[API backoffice/producteurs GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des données producteur' }, { status: 500 })
  }
}
