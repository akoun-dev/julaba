import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

// Read-only backoffice visibility into the producteur module's data.
// ProducteurRecolte/ProducteurCommande/ProducteurJournal previously had no
// admin-facing screen or route at all — unlike identificateur dossiers
// (visible via bo-enrolement-screen.tsx), a backoffice admin had no way to
// see or moderate anything a producteur recorded. There's no Producteur
// account model to join against (producteurId is a bare client-generated
// id, same as merchantId), so this groups by that raw id.
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

    const producteurIds = new Set([...recoltes.map((r) => r.producteurId), ...commandes.map((c) => c.producteurId)])

    return NextResponse.json({
      recoltes,
      commandes,
      producteurCount: producteurIds.size,
    })
  } catch (error) {
    console.error('[API backoffice/producteurs GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des données producteur' }, { status: 500 })
  }
}
