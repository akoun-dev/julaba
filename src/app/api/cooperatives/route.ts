import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requirePresident, erreurServeur } from '@/lib/cooperatives/resolver'

// MODE-921 (§2.3) — la coopérative du président.
//
// GET : la coopérative dont le compte appelant est responsable + un résumé
// (nombre de membres par statut, solde trésorerie validée, volume du pot
// commun). Toutes les données sont réelles — aucune valeur de démonstration.
// PATCH : renommer / changer la commune (responsable uniquement).

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const cooperateurId = searchParams.get('cooperateurId')
    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur
    const { cooperative } = garde.ctx

    const supabase = createSupabaseAdminClient()

    const [membresAgg, tresorerieAgg, stockAgg] = await Promise.all([
      supabase
        .from('cooperative_membres')
        .select('statut')
        .eq('cooperative_id', cooperative.id),
      supabase
        .from('cooperative_transactions')
        .select('type, montant')
        .eq('cooperative_id', cooperative.id)
        .eq('statut', 'validee'),
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

    const transactions = ((tresorerieAgg.data ?? []) as { type: string; montant: number | string }[])
    const solde = transactions.reduce(
      (total, t) => total + (t.type === 'entree' ? Number(t.montant) : -Number(t.montant)),
      0
    )

    // Cotisations réelles : catégorie 'cotisation' validée uniquement.
    const { data: cotisations } = await supabase
      .from('cooperative_transactions')
      .select('montant')
      .eq('cooperative_id', cooperative.id)
      .eq('statut', 'validee')
      .eq('categorie', 'cotisation')
    const totalCotisationsReelles = ((cotisations ?? []) as { montant: number | string }[]).reduce(
      (s, t) => s + Number(t.montant),
      0
    )

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
        soldeTresorerie: Math.round(solde),
        totalCotisations: Math.round(totalCotisationsReelles),
        produitsEnStock,
        articlesEnStock,
      },
    })
  } catch (error) {
    return erreurServeur('GET', error)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { cooperateurId, nom, commune } = body as {
      cooperateurId?: string
      nom?: string
      commune?: string
    }
    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur

    const updates: { nom?: string; commune?: string | null } = {}
    if (typeof nom === 'string') {
      const nomTrim = nom.trim()
      if (nomTrim.length < 2 || nomTrim.length > 120) {
        return NextResponse.json(
          { erreur: 'Nom de coopérative invalide (2-120 caractères)' },
          { status: 400 }
        )
      }
      updates.nom = nomTrim
    }
    if (commune !== undefined) {
      const communeTrim = typeof commune === 'string' ? commune.trim() : null
      updates.commune = communeTrim ? communeTrim : null
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ erreur: 'Aucune modification fournie' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('cooperatives')
      .update(updates)
      .eq('id', garde.ctx.cooperative.id)
      .select('id, nom, commune')
      .single()
    if (error) throw error
    return NextResponse.json({ cooperative: data })
  } catch (error) {
    return erreurServeur('PATCH', error)
  }
}
