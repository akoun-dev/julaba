import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

// MODE-946 (AUDIT-003 D-2, DET-COOP-010) — Tableau coopératif du
// back-office. Avant ce endpoint, le BO ne voyait AUCUNE statistique du
// module coopérative (7 tables sans aucune lecture BO). Le tableau donne
// les faits agrégés : coopératives actives, membres actifs, trésorerie
// agrégée (MÊME sémantique que l'agrégat unique MODE-935 — Σ entrées
// validées − Σ sorties validées, cotisations comprises), besoins par
// statut de la machine réelle (en_attente/consolide/en_cours/livre).

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'dashboard', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()

    // Coopératives actives / inactives (petite table : lecture directe).
    const { data: coops, error: coopsError } = await supabase
      .from('cooperatives')
      .select('id, actif')
    if (coopsError) throw coopsError
    const listeCoops = coops ?? []
    const actives = listeCoops.filter((c) => c.actif === true).length

    // Membres actifs — COUNT exact côté Postgres (head:true, pas de rows).
    const { count: membresActifs } = await supabase
      .from('cooperative_membres')
      .select('id', { count: 'exact', head: true })
      .eq('actif', true)

    // Trésorerie agrégée — un seul balayage des écritures validées,
    // même sémantique que l'agrégat unique par coopérative (MODE-935,
    // src/lib/cooperatives/tresorerie.ts) appliqué à TOUTES les coops.
    const { data: tx, error: txError } = await supabase
      .from('cooperative_transactions')
      .select('type, categorie, montant')
      .eq('statut', 'validee')
    if (txError) throw txError
    let solde = 0
    let totalCotisations = 0
    for (const row of (tx ?? []) as { type: string; categorie: string; montant: number | string }[]) {
      const montant = Number(row.montant) || 0
      if (row.type === 'entree') {
        solde += montant
        if (row.categorie === 'cotisation') totalCotisations += montant
      } else {
        solde -= montant
      }
    }

    // Besoins par statut (machine réelle : en_attente/consolide/en_cours/livre).
    const { data: besoinsRows, error: besoinsError } = await supabase
      .from('cooperative_besoins')
      .select('statut')
    if (besoinsError) throw besoinsError
    const besoins: Record<string, number> = {
      en_attente: 0,
      consolide: 0,
      en_cours: 0,
      livre: 0,
    }
    for (const row of (besoinsRows ?? []) as { statut: string }[]) {
      if (row.statut in besoins) besoins[row.statut] += 1
    }

    return NextResponse.json({
      cooperatives: { actives, inactives: listeCoops.length - actives },
      membresActifs: membresActifs ?? 0,
      tresorerie: { solde: Math.round(solde), totalCotisations: Math.round(totalCotisations) },
      besoins,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[API backoffice/cooperatives/stats]', error)
    return NextResponse.json({ erreur: 'Statistiques coopératives indisponibles' }, { status: 500 })
  }
}
