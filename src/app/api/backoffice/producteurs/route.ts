import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
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

    const [recoltes, commandes] = await Promise.all([
      db.producteurRecolte.findMany({
        where: statut ? { statut } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      db.producteurCommande.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ])

    const producteurIds = [...new Set([...recoltes.map((r) => r.producteurId), ...commandes.map((c) => c.producteurId)])]

    const actors = producteurIds.length
      ? await db.boActor.findMany({
          where: { producteurId: { in: producteurIds } },
          select: { producteurId: true, firstName: true, lastName: true, phone: true, zone: true },
        })
      : []
    const actorByProducteurId = Object.fromEntries(actors.map((a) => [a.producteurId as string, a]))

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
