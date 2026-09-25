import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'

// MODE-947 (AUDIT-003 D-3) — Rapport cycles & récoltes du producteur.
// Préalable B-2/B-3 livré : les cycles et les récoltes sont des données
// réelles (tables legacy_producteur_cycles / legacy_producteur_recoltes,
// remplies par les écrans producteur + sync offline). Le rapport est une
// AGRÉGATION DES FAITS SERVEUR : cycles par statut et kg récoltés,
// récoltes par statut et par produit, ventes réalisées (récoltes avec un
// acheteur et un montant). Aucune projection locale, aucune invention.

const PLAFOND = 500

// DET-008/NORM-305 — le client admin Supabase est volontairement non typé
// (any) : types de ligne minimaux pour les cycles et les récoltes
// (MODE-980, cf. VenteRow).
type CycleRow = {
  statut: string | null
  quantite_recoltee_kg: number | null
}
type RecolteRow = {
  statut: string | null
  produit: string | null
  quantite_kg: number | null
  montant_vente: number | null
  acheteur: string | null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const producteurId = searchParams.get('producteurId')

  const auth = await requireDeviceOwner(request, 'producteur', producteurId)
  if (auth) return auth

  const supabase = createSupabaseAdminClient()

  // Cycles de culture (bornés, plus récents d'abord — index
  // producteur_id+statut posé par la migration producteur_cycles).
  const { data: cycles, error: cyclesError } = await supabase
    .from('legacy_producteur_cycles')
    .select('statut, quantite_recoltee_kg')
    .eq('producteur_id', producteurId as string)
    .order('created_at', { ascending: false })
    .limit(PLAFOND)
  if (cyclesError) return NextResponse.json({ erreur: 'Rapport indisponible' }, { status: 500 })
  const listeCycles = (cycles ?? []) as CycleRow[]

  // Récoltes (bornées, plus récentes d'abord — index producteur_id).
  const { data: recoltes, error: recoltesError } = await supabase
    .from('legacy_producteur_recoltes')
    .select('statut, produit, quantite_kg, montant_vente, acheteur')
    .eq('producteur_id', producteurId as string)
    .order('created_at', { ascending: false })
    .limit(PLAFOND)
  if (recoltesError) return NextResponse.json({ erreur: 'Rapport indisponible' }, { status: 500 })
  const listeRecoltes = (recoltes ?? []) as RecolteRow[]

  const parStatut = (rows: { statut: string | null }[]): Record<string, number> => {
    const acc: Record<string, number> = {}
    for (const row of rows) {
      const cle = typeof row.statut === 'string' && row.statut.length > 0 ? row.statut : 'inconnu'
      acc[cle] = (acc[cle] ?? 0) + 1
    }
    return acc
  }

  const parProduitMap = new Map<string, { nombreRecoltes: number; totalKg: number }>()
  for (const row of listeRecoltes) {
    const nom = typeof row.produit === 'string' && row.produit.trim().length > 0
      ? row.produit.trim()
      : 'Produit sans nom'
    const acc = parProduitMap.get(nom) ?? { nombreRecoltes: 0, totalKg: 0 }
    acc.nombreRecoltes += 1
    acc.totalKg += Number(row.quantite_kg) || 0
    parProduitMap.set(nom, acc)
  }
  const parProduit = [...parProduitMap.entries()]
    .map(([nom, acc]) => ({ nom, nombreRecoltes: acc.nombreRecoltes, totalKg: Math.round(acc.totalKg * 100) / 100 }))
    .sort((a, b) => b.totalKg - a.totalKg)

  const ventesRealisees = listeRecoltes.filter(
    (r) => r.acheteur != null && r.montant_vente != null
  ).length

  return NextResponse.json({
    cycles: {
      total: listeCycles.length,
      parStatut: parStatut(listeCycles as { statut: string | null }[]),
      quantiteRecolteeKg:
        Math.round(
          listeCycles.reduce((s, c) => s + (Number(c.quantite_recoltee_kg) || 0), 0) * 100
        ) / 100,
    },
    recoltes: {
      total: listeRecoltes.length,
      parStatut: parStatut(listeRecoltes as { statut: string | null }[]),
      totalKg:
        Math.round(listeRecoltes.reduce((s, r) => s + (Number(r.quantite_kg) || 0), 0) * 100) / 100,
      ventesRealisees,
      montantVentes: listeRecoltes.reduce((s, r) => s + (Number(r.montant_vente) || 0), 0),
      parProduit,
    },
    generatedAt: new Date().toISOString(),
    ...(listeCycles.length >= PLAFOND
      ? { borneCycles: `Rapport limité aux ${PLAFOND} cycles les plus récents.` }
      : {}),
    ...(listeRecoltes.length >= PLAFOND
      ? { borneRecoltes: `Rapport limité aux ${PLAFOND} récoltes les plus récentes.` }
      : {}),
  })
}
