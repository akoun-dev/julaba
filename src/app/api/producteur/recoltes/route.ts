import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const producteurId = searchParams.get('producteurId')

    if (!producteurId) {
      return NextResponse.json({ error: 'producteurId requis' }, { status: 400 })
    }

    const recoltes = await db.producteurRecolte.findMany({
      where: { producteurId },
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

    if (!id || !producteurId || !produit || quantiteKg == null || !qualite) {
      return NextResponse.json(
        { error: 'Champs requis manquants (id, producteurId, produit, quantiteKg, qualite)' },
        { status: 400 },
      )
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
        prixSouhaiteParKg: prixSouhaiteParKg || 0,
        photos: JSON.stringify(photos || []),
        statut: statut || 'brouillon',
        acheteur: acheteur || null,
        montantVente: montantVente || null,
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

    const recolte = await db.producteurRecolte.update({
      where: { id },
      data: {
        ...(statut && { statut }),
        ...(acheteur !== undefined && { acheteur }),
        ...(montantVente !== undefined && { montantVente }),
      },
    })

    return NextResponse.json(recolte)
  } catch (error) {
    console.error('[API producteur/recoltes PATCH]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
