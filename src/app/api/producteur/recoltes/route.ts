import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner, requireDeviceSubjectType } from '@/lib/require-owner'
import { transitionRecolteValide } from '@/lib/producteur/statuts'
import { awardLoyaltyForEvent } from '@/lib/loyalty/evaluator'
import { resoudreUrlsPhotosLignes } from '@/lib/producteur/photo-urls-server'
import { formatZodError } from '@/lib/validation/marchand'

// MODE-979 : la résolution d'URLs de photos (PF-04) est partagée avec
// GET /api/cooperatives/recoltes-prevues via photo-urls-server.ts.
// Comportement identique : batch unique createSignedUrls (1 h), DataURL
// et URL absolues intactes, aucune erreur de signature ne fait échouer
// le GET.

// MODE-1007 — payloads de producteur-store (recolte-create / recolte-update,
// rejeu verbatim ; le PATCH updateRecolte envoie { id, ...updates }).
// Contrats préservés : les champs requis par truthiness ont leur 400 testé
// (« Champs requis manquants (id, produit, quantiteKg, qualite) » / « id requis »)
// → .nullable().optional() ; quantiteKg (== null → 400 testé),
// prixSouhaiteParKg/montantVente (coercés Number() — « Montant de vente
// invalide » quand non-finite au PATCH) et statut (typeof + machine à états →
// 409 « Transition de statut interdite ») restent à la validation manuelle →
// z.unknown(). photos peut être null (repli JSON.stringify(photos || [])) et
// part en Storage côté sync-handler (références string) → tableau libre.
const recolteCreateSchema = z.object({
  id: z.string().nullable().optional(),
  producteurId: z.string().optional(),
  produit: z.string().nullable().optional(),
  quantiteKg: z.unknown().optional(),
  qualite: z.string().nullable().optional(),
  dateRecolte: z.string().nullable().optional(),
  parcelle: z.string().nullable().optional(),
  prixSouhaiteParKg: z.unknown().optional(),
  photos: z.array(z.unknown()).nullable().optional(),
  statut: z.string().nullable().optional(),
  acheteur: z.string().nullable().optional(),
  montantVente: z.unknown().optional(),
  notes: z.string().nullable().optional(),
})

const recolteUpdateSchema = z.object({
  id: z.string().nullable().optional(),
  statut: z.unknown().optional(),
  acheteur: z.string().nullable().optional(),
  montantVente: z.unknown().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const producteurId = searchParams.get('producteurId')

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    const { data: recoltes, error } = await supabase
      .from('legacy_producteur_recoltes')
      .select('*')
      .eq('producteur_id', producteurId!)
      .order('created_at', { ascending: false })

    if (error) throw error

    const resolved = await resoudreUrlsPhotosLignes(
      supabase,
      (recoltes ?? []) as unknown as Record<string, unknown>[]
    )

    return NextResponse.json({ recoltes: resolved })
  } catch (error) {
    console.error('[API producteur/recoltes GET]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsedCreate = recolteCreateSchema.safeParse(body)
    if (!parsedCreate.success) {
      return NextResponse.json({ erreur: formatZodError(parsedCreate.error) }, { status: 400 })
    }
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

    // FCFA amounts are stored as integers — round to avoid float issues.
    const prix = Math.round(Number(prixSouhaiteParKg) || 0)
    const montant = montantVente == null ? null : Math.round(Number(montantVente) || 0)
    if (prix < 0 || (montant !== null && montant < 0)) {
      return NextResponse.json({ error: 'Les montants ne peuvent pas être négatifs' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const { data: existing } = await supabase
      .from('legacy_producteur_recoltes')
      .select('*')
      .eq('id', id)
      .single()

    if (existing) {
      return NextResponse.json(existing, { status: 200 })
    }

    const { data: recolte, error: insertError } = await supabase
      .from('legacy_producteur_recoltes')
      .insert({
        id,
        producteur_id: producteurId,
        produit,
        quantite_kg: quantiteKg,
        qualite,
        date_recolte: new Date(dateRecolte).toISOString(),
        parcelle: parcelle || '',
        prix_souhaite_par_kg: prix,
        photos: JSON.stringify(photos || []),
        statut: statut || 'brouillon',
        acheteur: acheteur || null,
        montant_vente: montant,
        notes: notes || null,
      })
      .select()
      .single()

    if (insertError) throw insertError

    void awardLoyaltyForEvent(supabase, {
      subjectId: producteurId,
      subjectRole: 'producteur',
      actionType: 'harvest',
      source: 'harvest',
      sourceId: String(recolte.id),
      metadata: { product: produit, quantityKg: quantiteKg, clientId: id },
    }).catch((error) => console.error('[loyalty] attribution récolte', error))

    return NextResponse.json(recolte, { status: 201 })
  } catch (error) {
    console.error('[API producteur/recoltes POST]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const parsedUpdate = recolteUpdateSchema.safeParse(body)
    if (!parsedUpdate.success) {
      return NextResponse.json({ erreur: formatZodError(parsedUpdate.error) }, { status: 400 })
    }
    const { id, statut, acheteur, montantVente } = body

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    // MODE-935 (S-13) — auth AVANT lookup : la session doit exister et
    // appartenir au royaume producteur avant toute recherche. Un appelant
    // sans session reçoit 401 (et non un 404 qui masque l'authentification).
    const typeAuth = await requireDeviceSubjectType(request, 'producteur')
    if (typeAuth) return typeAuth

    const { data: existing, error: findError } = await supabase
      .from('legacy_producteur_recoltes')
      .select('*')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ error: 'Récolte introuvable' }, { status: 404 })
    }
    const auth = await requireDeviceOwner(request, 'producteur', existing.producteur_id)
    if (auth) return auth

    if (montantVente !== undefined && montantVente !== null) {
      const rounded = Math.round(Number(montantVente))
      if (!Number.isFinite(rounded) || rounded < 0) {
        return NextResponse.json({ error: 'Montant de vente invalide' }, { status: 400 })
      }
    }

    const updateData: Record<string, unknown> = {}
    if (statut) {
      // MODE-935 (I-12) — transition validée (machine à états pur testée,
      // CHECK SQL en base). Un rejeu du même statut reste idempotent.
      if (typeof statut !== 'string' || !transitionRecolteValide(existing.statut, statut)) {
        return NextResponse.json(
          { error: `Transition de statut interdite (${existing.statut} → ${String(statut)})` },
          { status: 409 },
        )
      }
      if (statut !== existing.statut) updateData.statut = statut
    }
    if (acheteur !== undefined) updateData.acheteur = acheteur
    if (montantVente !== undefined) {
      updateData.montant_vente = montantVente === null ? null : Math.round(Number(montantVente))
    }

    // Rien à écrire (rejeu strictement identique) : état courant rendu.
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(existing)
    }

    const { data: recolte, error: updateError } = await supabase
      .from('legacy_producteur_recoltes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    return NextResponse.json(recolte)
  } catch (error) {
    console.error('[API producteur/recoltes PATCH]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
