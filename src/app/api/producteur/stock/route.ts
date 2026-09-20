import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'

// Task 98-B (audit producteur 97-B1 #1) — « Mon stock » du producteur.
//
// Avant cette route, l'écran prod-stock lisait `stock` du store jamais
// écrit par personne : « Aucun stock enregistré » à jamais et KPI
// stockDisponibleKg figé à 0.
//
// Le stock du producteur n'a PAS de table propre : il est DÉRIVÉ des
// récoltes réellement disponibles (statut posé par le serveur à la mise
// en stock), agrégées par produit. Une seule source de vérité, zéro
// double comptage, zéro donnée inventée.
//
// `etat` est dérivé honnêtement : 'bas' sous le seuil SEUIL_STOCK_BAS_KG,
// 'bon' au-dessus. L'état 'a_surveiller' (humidité) n'est pas dérivable
// des données existantes — il n'est JAMAIS posé ici (le badge restera
// absent plutôt que de mentir).

/** Sous ce seuil (kg), un produit est annoncé « stock bas » à l'écran. */
export const SEUIL_STOCK_BAS_KG = 25

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const producteurId = searchParams.get('producteurId')

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    // Agrégat par produit des récoltes disponibles uniquement.
    const { data, error } = await supabase
      .from('legacy_producteur_recoltes')
      .select('produit, quantite_kg')
      .eq('producteur_id', producteurId!)
      .eq('statut', 'disponible')

    if (error) throw error

    const parProduit = new Map<string, number>()
    for (const row of data ?? []) {
      const produit = typeof row.produit === 'string' ? row.produit : ''
      const quantite = typeof row.quantite_kg === 'number' ? row.quantite_kg : 0
      if (!produit) continue
      parProduit.set(produit, (parProduit.get(produit) ?? 0) + quantite)
    }

    const stock = [...parProduit.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([produit, quantiteKg]) => ({
        produit,
        quantiteKg: Math.round(quantiteKg * 100) / 100,
        etat: quantiteKg < SEUIL_STOCK_BAS_KG ? ('bas' as const) : ('bon' as const),
      }))

    return NextResponse.json({
      stock,
      seuilStockBasKg: SEUIL_STOCK_BAS_KG,
    })
  } catch (error) {
    console.error('[API producteur/stock GET]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
