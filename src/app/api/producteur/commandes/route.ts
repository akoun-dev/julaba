import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDeviceOwner } from '@/lib/require-owner'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const producteurId = searchParams.get('producteurId')

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    const commandes = await db.producteurCommande.findMany({
      where: { producteurId: producteurId! },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ commandes })
  } catch (error) {
    console.error('[API producteur/commandes GET]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// Not called by any client today (no buyer/backoffice module creates
// commandes yet — the producteur app only ever PATCHes an existing one to
// respond/deliver). Left without a device-owner check: unlike recoltes/
// journal, a commande isn't authored by the producteur it's addressed to, so
// there's no producteur device session to check it against — the real fix is
// a buyer/backoffice identity for this endpoint, out of scope here.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      id,
      producteurId,
      reference,
      acheteurNom,
      produit,
      quantiteKg,
      montant,
      dateLivraisonSouhaitee,
      statut,
      urgent,
      transporteur,
    } = body

    if (!id || !producteurId || !reference || !acheteurNom || !produit) {
      return NextResponse.json(
        { error: 'Champs requis manquants (id, producteurId, reference, acheteurNom, produit)' },
        { status: 400 },
      )
    }

    const existing = await db.producteurCommande.findUnique({ where: { id } })
    if (existing) {
      return NextResponse.json(existing, { status: 200 })
    }

    const refConflict = await db.producteurCommande.findUnique({ where: { reference } })
    if (refConflict) {
      return NextResponse.json(refConflict, { status: 200 })
    }

    const commande = await db.producteurCommande.create({
      data: {
        id,
        producteurId,
        reference,
        acheteurNom,
        produit,
        quantiteKg: quantiteKg || 0,
        montant: montant || 0,
        dateLivraisonSouhaitee: new Date(dateLivraisonSouhaitee),
        statut: statut || 'a_traiter',
        urgent: urgent || false,
        transporteur: transporteur || null,
      },
    })

    return NextResponse.json(commande, { status: 201 })
  } catch (error) {
    console.error('[API producteur/commandes POST]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, statut, transporteur } = body

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    const existing = await db.producteurCommande.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }
    const auth = await requireDeviceOwner(request, 'producteur', existing.producteurId)
    if (auth) return auth

    const commande = await db.producteurCommande.update({
      where: { id },
      data: {
        ...(statut && { statut }),
        ...(transporteur !== undefined && { transporteur }),
      },
    })

    return NextResponse.json(commande)
  } catch (error) {
    console.error('[API producteur/commandes PATCH]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
