import type { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * MODE-935 (audit #003, I-04) — agrégat UNIQUE du solde de trésorerie.
 *
 * Avant ce module, GET /api/cooperatives/tresorerie calculait le solde
 * sur les 100 dernières lignes (limit(100) de la liste affichée) tandis
 * que GET /api/cooperatives l'agrégeait sur TOUTES les validées — deux
 * soldes différents au-delà de 100 écritures. Les deux routes passent
 * maintenant par CETTE fonction (une seule source de vérité).
 *
 * Choix d'implémentation (ADR) : l'audit proposait une view SQL
 * (v_coop_tresorerie_solde) ou une requête de sommation. La view a été
 * ÉCARTÉE volontairement : créée dans le schéma public, elle aurait reçu
 * les GRANT par défaut de Supabase (anon/authenticated) et exposé les
 * soldes de TOUTES les coopératives via PostgREST — exactement la classe
 * de régression SEC-813 fermée au Sprint A. Un agrégat côté serveur,
 * dans une fonction partagée par les deux routes, donne la même unicité
 * sans aucune surface d'attaque nouvelle.
 */

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>

export interface TresorerieAggregate {
  /** Σ entrées validées − Σ sorties validées, sur TOUTES les écritures. */
  solde: number
  /** Σ entrées catégorie 'cotisation' validées. */
  totalCotisations: number
}

export async function agregerTresorerieValidee(
  supabase: SupabaseAdmin,
  cooperativeId: string
): Promise<TresorerieAggregate> {
  // Seules les colonnes utiles sont lues (pas de select('*')) ; aucun
  // limit : l'agrégat porte sur l'intégralité des écritures validées.
  const { data, error } = await supabase
    .from('cooperative_transactions')
    .select('type, categorie, montant')
    .eq('cooperative_id', cooperativeId)
    .eq('statut', 'validee')
  if (error) throw error

  let solde = 0
  let totalCotisations = 0
  for (const row of (data ?? []) as { type: string; categorie: string; montant: number | string }[]) {
    const montant = Number(row.montant) || 0
    if (row.type === 'entree') {
      solde += montant
      if (row.categorie === 'cotisation') totalCotisations += montant
    } else {
      solde -= montant
    }
  }
  return { solde: Math.round(solde), totalCotisations: Math.round(totalCotisations) }
}
