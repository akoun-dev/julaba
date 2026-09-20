import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireMembreActif, requirePresident, erreurServeur } from '@/lib/cooperatives/resolver'
import { agregerBesoins } from '@/lib/cooperatives/agregation'

// MODE-921 (§3.5) — besoins d'achat groupé.
//
// POST (marchand membre) : dépôt d'un besoin — la coopérative est résolue
// SERVEUR depuis l'adhésion active, jamais acceptée du client.
//
// GET (président) : les besoins de SA coopérative, bruts + agrégés par
// produit::unité (quantité totale, nombre de membres, priorité max) —
// l'agrégation est le module PUR agregerBesoins (testé).

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const cooperateurId = searchParams.get('cooperateurId')
    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur

    const supabase = createSupabaseAdminClient()
    const { data: besoins, error } = await supabase
      .from('cooperative_besoins')
      .select('id, marchand_id, produit, categorie, quantite, unite, prix_max, priorite, statut, notes, date_besoin, created_at')
      .eq('cooperative_id', garde.ctx.cooperative.id)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error

    const liste = besoins ?? []
    return NextResponse.json({
      besoins: liste.map((b) => ({
        id: b.id,
        marchandId: b.marchand_id,
        produit: b.produit,
        categorie: b.categorie,
        quantite: Number(b.quantite),
        unite: b.unite,
        prixMax: b.prix_max == null ? null : Number(b.prix_max),
        priorite: b.priorite,
        statut: b.statut,
        notes: b.notes,
        dateBesoin: b.date_besoin,
        date: b.created_at,
      })),
      groupes: agregerBesoins(
        liste.map((b) => ({
          id: b.id,
          marchandId: b.marchand_id,
          produit: b.produit,
          categorie: b.categorie,
          quantite: Number(b.quantite),
          unite: b.unite,
          prixMax: b.prix_max == null ? null : Number(b.prix_max),
          priorite: b.priorite,
          statut: b.statut,
          date: b.created_at,
        }))
      ),
    })
  } catch (error) {
    return erreurServeur('besoins GET', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { merchantId, produit, categorie, quantite, unite, prixMax, priorite, notes, dateBesoin } =
      body as {
        merchantId?: string
        produit?: string
        categorie?: string
        quantite?: number
        unite?: string
        prixMax?: number
        priorite?: string
        notes?: string
        dateBesoin?: string
      }
    const garde = await requireMembreActif(req, merchantId)
    if ('erreur' in garde) return garde.erreur

    const produitTrim = typeof produit === 'string' ? produit.trim() : ''
    if (!produitTrim || produitTrim.length > 120) {
      return NextResponse.json({ erreur: 'Produit requis (120 caractères max)' }, { status: 400 })
    }
    const quantiteNum = Number(quantite)
    if (!Number.isFinite(quantiteNum) || quantiteNum <= 0) {
      return NextResponse.json({ erreur: 'Quantité invalide — strictement positive requise' }, { status: 400 })
    }
    if (prixMax !== undefined && prixMax !== null) {
      const prixNum = Number(prixMax)
      if (!Number.isFinite(prixNum) || prixNum <= 0 || !Number.isInteger(prixNum)) {
        return NextResponse.json({ erreur: 'Prix maximum invalide — entier FCFA positif' }, { status: 400 })
      }
    }
    const prio = priorite === 'urgente' ? 'urgente' : 'normale'

    const supabase = createSupabaseAdminClient()
    const { data: besoin, error } = await supabase
      .from('cooperative_besoins')
      .insert({
        cooperative_id: garde.ctx.cooperative.id,
        marchand_id: merchantId!,
        produit: produitTrim,
        categorie: typeof categorie === 'string' && categorie.trim() ? categorie.trim() : null,
        quantite: quantiteNum,
        unite: typeof unite === 'string' && unite.trim() ? unite.trim() : 'kg',
        prix_max: prixMax ?? null,
        priorite: prio,
        statut: 'en_attente',
        notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
        date_besoin: typeof dateBesoin === 'string' && dateBesoin ? dateBesoin : null,
      })
      .select('id, statut')
      .single()
    if (error) throw error

    return NextResponse.json({ besoin }, { status: 201 })
  } catch (error) {
    return erreurServeur('besoins POST', error)
  }
}
