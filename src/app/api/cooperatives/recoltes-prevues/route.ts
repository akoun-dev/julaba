import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireMembreActif, erreurServeur } from '@/lib/cooperatives/resolver'
import { trierRecoltesParProximite, type Coords } from '@/lib/cooperatives/proximite'
import { resoudreUrlsPhotosLignes } from '@/lib/producteur/photo-urls-server'

// MODE-979 (DET-COOP-008) — « Récoltes prévues » du membre grossiste
// (parité julaba-app §4.3 RecettesPrevues) : les récoltes des producteurs
// en état publiee|disponible, triées par DISTANCE HAVERSINE depuis la
// commune de la coopérative du membre.
//
// Contrat d'honnêteté (module pur proximite.ts) :
//   - la coopérative n'a PAS de commune liée  → tri par date seule,
//     chaque récolte distanceKm = null (JAMAIS de distance approximée) ;
//   - un producteur n'a PAS de commune        → sa récolte est listée en
//     fin de liste, distanceKm = null ;
//   - la distance est le centre-à-centre du référentiel `communes`
//     (précision ~1 km, rendue « ~N km » à l'écran).
//
// La garde requireMembreActif protège la donnée producteur : seules les
// adhésions actives voient le marché des récoltes (la session marchand
// seule n'y suffit pas). Les photos suivent le même contrat PF-04 que le
// reste des récoltes (URLs signées batch, rétrocompatible DataURL).

const STATUTS_VISIBLES = ['publiee', 'disponible'] as const
const PLAFOND_RECOLTES = 200

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const merchantId = searchParams.get('merchantId')
    const garde = await requireMembreActif(req, merchantId)
    if ('erreur' in garde) return garde.erreur

    const supabase = createSupabaseAdminClient()

    // Coordonnées de la coopérative via SA commune liée (nullable).
    const { data: coopRow } = await supabase
      .from('cooperatives')
      .select('id, nom, commune_id, commune:communes(id, nom, region, lat, lng)')
      .eq('id', garde.ctx.cooperative.id)
      .maybeSingle()
    if (!coopRow) throw new Error('Lecture coopérative impossible')

    const communeCoop = (coopRow as { commune: Coords & { id: string; nom: string; region: string } | null } | null)
      ?.commune ?? null
    const coordsCoop: Coords | null = communeCoop
      ? { lat: communeCoop.lat, lng: communeCoop.lng }
      : null

    // Récoltes visibles (borne 200 assumée et documentée — même lecture
    // bornée que le reste de l'espace coopératif, cf. MODE-951).
    const { data: recoltes, error: errRecoltes } = await supabase
      .from('legacy_producteur_recoltes')
      .select('id, producteur_id, produit, quantite_kg, qualite, date_recolte, parcelle, prix_souhaite_par_kg, photos, statut')
      .in('statut', [...STATUTS_VISIBLES])
      .order('created_at', { ascending: false })
      .limit(PLAFOND_RECOLTES)
    if (errRecoltes) throw errRecoltes

    const liste = (recoltes ?? []) as Record<string, unknown>[]
    if (liste.length === 0) {
      return NextResponse.json({
        recoltes: [],
        coop: { id: garde.ctx.cooperative.id, nom: garde.ctx.cooperative.nom },
        commune: communeCoop ? { id: communeCoop.id, nom: communeCoop.nom, region: communeCoop.region } : null,
        tri: coordsCoop ? 'proximite' : 'date',
      })
    }

    // Jointure batchée des producteurs + leurs communes (2 requêtes,
    // jamais de N+1).
    const producteurIds = [...new Set(liste.map((r) => String(r.producteur_id)))]
    const { data: producteurs } = await supabase
      .from('producers')
      .select('id, first_name, commune_id, commune:communes(id, nom, region, lat, lng)')
      .in('id', producteurIds)

    const parProducteur = new Map<
      string,
      { prenom: string | null; commune: { id: string; nom: string; region: string; lat: number; lng: number } | null }
    >()
    for (const p of (producteurs ?? []) as {
      id: string
      first_name: string | null
      commune: { id: string; nom: string; region: string; lat: number; lng: number } | null
    }[]) {
      parProducteur.set(p.id, { prenom: p.first_name, commune: p.commune })
    }

    // Enrichissement + tri Haversine (module pur testé).
    const enrichies = trierRecoltesParProximite(
      liste.map((r) => {
        const prod = parProducteur.get(String(r.producteur_id))
        return {
          dateRecolte: String(r.date_recolte ?? ''),
          ...r,
          producteur: {
            id: String(r.producteur_id),
            prenom: prod?.prenom ?? null,
            commune: prod?.commune
              ? { id: prod.commune.id, nom: prod.commune.nom, region: prod.commune.region }
              : null,
          },
          commune: prod?.commune ? { lat: prod.commune.lat, lng: prod.commune.lng } : null,
          distanceKm: null,
          tranche: null,
        }
      }),
      coordsCoop
    )

    // Photos : URLs signées batch (contrat PF-04), jamais bloquant.
    const avecPhotos = await resoudreUrlsPhotosLignes(
      supabase,
      enrichies as unknown as Record<string, unknown>[]
    )

    return NextResponse.json({
      recoltes: avecPhotos,
      coop: { id: garde.ctx.cooperative.id, nom: garde.ctx.cooperative.nom },
      commune: communeCoop ? { id: communeCoop.id, nom: communeCoop.nom, region: communeCoop.region } : null,
      tri: coordsCoop ? 'proximite' : 'date',
    })
  } catch (error) {
    return erreurServeur('[API cooperatives/recoltes-prevues GET]', error)
  }
}
