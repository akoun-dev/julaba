import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requirePresident, erreurServeur } from '@/lib/cooperatives/resolver'
import { agregerTresorerieValidee } from '@/lib/cooperatives/tresorerie'

// MODE-921 (§2.3) — la coopérative du président.
//
// GET : la coopérative dont le compte appelant est responsable + un résumé
// (nombre de membres par statut, solde trésorerie validée, volume du pot
// commun). Toutes les données sont réelles — aucune valeur de démonstration.
//
// MODE-946 (AUDIT-003 F-14) : le PATCH (renommer / changer la commune) est
// RETIRÉ — il n'avait AUCUN appelant (zone morte, même traitement que les
// endpoints morts du MODE-940). Une future édition de coopérative viendra
// avec son écran et sa décision produit.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const cooperateurId = searchParams.get('cooperateurId')
    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur
    const { cooperative } = garde.ctx

    const supabase = createSupabaseAdminClient()

    const [membresAgg, stockAgg] = await Promise.all([
      supabase
        .from('cooperative_membres')
        .select('statut')
        .eq('cooperative_id', cooperative.id),
      supabase
        .from('cooperative_stock')
        .select('quantite')
        .eq('cooperative_id', cooperative.id),
    ])

    const membres = ((membresAgg.data ?? []) as { statut: string }[])
    const parStatut = membres.reduce<Record<string, number>>((acc, m) => {
      acc[m.statut] = (acc[m.statut] || 0) + 1
      return acc
    }, {})

    // MODE-935 (I-04) — MÊME agrégat que GET /cooperatives/tresorerie
    // (module partagé) : l'accueil et la trésorerie affichent désormais
    // un solde et des cotisations identiques, calculés sur TOUTES les
    // écritures validées.
    const { solde, totalCotisations } = await agregerTresorerieValidee(supabase, cooperative.id)

    const stock = ((stockAgg.data ?? []) as { quantite: number | string }[])
    const produitsEnStock = stock.length
    const articlesEnStock = stock.reduce((s, p) => s + Number(p.quantite), 0)

    return NextResponse.json({
      cooperative: {
        id: cooperative.id,
        nom: cooperative.nom,
        commune: cooperative.commune,
        responsableId: cooperative.responsable_id,
        actif: cooperative.actif,
      },
      resume: {
        membresTotal: membres.length,
        membresActifs: parStatut['actif'] || 0,
        adhesionsEnAttente: parStatut['en_attente'] || 0,
        membresSuspendus: parStatut['suspendu'] || 0,
        soldeTresorerie: solde,
        totalCotisations: totalCotisations,
        produitsEnStock,
        articlesEnStock,
      },
    })
  } catch (error) {
    return erreurServeur('GET', error)
  }
}
