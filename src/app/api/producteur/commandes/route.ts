import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDeviceOwner } from '@/lib/require-owner'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'
import { createNotification } from '@/lib/notifications'
import { formatFCFA } from '@/lib/voice/localIntent'

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

// A commande isn't authored by the producteur it's addressed to (unlike
// recoltes/journal), so there's no producteur device session to check it
// against — the real identity here is whoever is placing the order on the
// producteur's behalf, which today is backoffice staff recording a buyer's
// order (see bo-producteurs-screen.tsx), hence requireBackofficePermission
// rather than requireDeviceOwner.
export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'producteurs', 'create')
  if (auth instanceof NextResponse) return auth

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
        dateLivraisonSouhaitee: dateLivraisonSouhaitee ? new Date(dateLivraisonSouhaitee) : new Date(),
        statut: statut || 'a_traiter',
        urgent: urgent || false,
        transporteur: transporteur || null,
      },
    })

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'commande_create', module: 'producteurs',
      details: `Commande ${commande.reference} pour producteur ${producteurId} (${acheteurNom})`, request,
    })

    await createNotification({
      subjectType: 'producteur', subjectId: producteurId, type: 'commande_recue',
      title: 'Nouvelle commande',
      body: `${acheteurNom} a commandé ${quantiteKg || 0} kg de ${produit}${urgent ? ' — urgent' : ''} (${formatFCFA(montant || 0)}).`,
      data: { commandeId: commande.id },
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
