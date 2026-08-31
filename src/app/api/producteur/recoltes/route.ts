import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDeviceOwner } from '@/lib/require-owner'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const producteurId = searchParams.get('producteurId')

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    const recoltes = await db.producteurRecolte.findMany({
      where: { producteurId: producteurId! },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ recoltes })
  } catch (error) {
    console.error('[API producteur/recoltes GET]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      id,
      producteurId,
      produit,
      quantiteKg,
      qualite,
      dateRecolte,
      parcelle,
      prixSouhaiteParKg,
      photos,
      statut,
      acheteur,
      montantVente,
      notes,
    } = body

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    if (!id || !produit || quantiteKg == null || !qualite) {
      return NextResponse.json(
        { error: 'Champs requis manquants (id, produit, quantiteKg, qualite)' },
        { status: 400 },
      )
    }

    // FCFA amounts are integers (see ProducteurRecolte.prixSouhaiteParKg in
    // schema.prisma) — round rather than let Prisma throw on a float.
    const prix = Math.round(Number(prixSouhaiteParKg) || 0)
    const montant = montantVente == null ? null : Math.round(Number(montantVente) || 0)
    if (prix < 0 || (montant !== null && montant < 0)) {
      return NextResponse.json({ error: 'Les montants ne peuvent pas être négatifs' }, { status: 400 })
    }

    const existing = await db.producteurRecolte.findUnique({ where: { id } })
    if (existing) {
      return NextResponse.json(existing, { status: 200 })
    }

    const recolte = await db.producteurRecolte.create({
      data: {
        id,
        producteurId,
        produit,
        quantiteKg,
        qualite,
        dateRecolte: new Date(dateRecolte),
        parcelle: parcelle || '',
        prixSouhaiteParKg: prix,
        photos: JSON.stringify(photos || []),
        statut: statut || 'brouillon',
        acheteur: acheteur || null,
        montantVente: montant,
        notes: notes || null,
      },
    })

    return NextResponse.json(recolte, { status: 201 })
  } catch (error) {
    console.error('[API producteur/recoltes POST]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, statut, acheteur, montantVente } = body

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    const existing = await db.producteurRecolte.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Récolte introuvable' }, { status: 404 })
    }
    const auth = await requireDeviceOwner(request, 'producteur', existing.producteurId)
    if (auth) return auth

    if (montantVente !== undefined && montantVente !== null) {
      const rounded = Math.round(Number(montantVente))
      if (!Number.isFinite(rounded) || rounded < 0) {
        return NextResponse.json({ error: 'Montant de vente invalide' }, { status: 400 })
      }
    }

    const recolte = await db.producteurRecolte.update({
      where: { id },
      data: {
        ...(statut && { statut }),
        ...(acheteur !== undefined && { acheteur }),
        ...(montantVente !== undefined && {
          montantVente: montantVente === null ? null : Math.round(Number(montantVente)),
        }),
      },
    })

    return NextResponse.json(recolte)
  } catch (error) {
    console.error('[API producteur/recoltes PATCH]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
