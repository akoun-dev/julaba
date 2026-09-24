import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requirePresident, erreurServeur } from '@/lib/cooperatives/resolver'

// MODE-921 (§3.5) — consolidation des besoins en attente.
//
// Passe les besoins 'en_attente' de la coopérative à 'consolide' :
//   • soit pour UN groupe produit+unité (body { produit, unite }) ;
//   • soit pour TOUS (body vide de ce champ) — c'est le « tout grouper »
//     du président avant l'achat groupé.
//
// Retourne le nombre de besoins consolidés — l'UI ne doit jamais afficher
// un succès inventé (contrat persisted des écrans produit/julaba-app).

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { cooperateurId, produit, unite } = body as {
      cooperateurId?: string
      produit?: string
      unite?: string
    }
    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur

    const supabase = createSupabaseAdminClient()

    let query = supabase
      .from('cooperative_besoins')
      .update({ statut: 'consolide' })
      .eq('cooperative_id', garde.ctx.cooperative.id)
      .eq('statut', 'en_attente')

    const produitTrim = typeof produit === 'string' ? produit.trim() : ''
    const uniteTrim = typeof unite === 'string' ? unite.trim() : ''
    if (produitTrim && uniteTrim) {
      // Postgres text comparison : on cible insensible à la casse via ilike
      // exact (échappé) — l'agrégation basse-casse du module PUR guide le
      // groupe ; la base conserve la casse d'origine.
      // A11-F16 (AUDIT-011) : le backslash est échappé EN PREMIER — sinon un
      // produit contenant « \ » produisait un LIKE pattern malformé (500) et
      // un backslash non échappé se comportait comme un caractère d'échappement.
      const ilikeExact = (valeur: string): string =>
        valeur.replace(/\\/g, '\\\\').replace(/[%_]/g, (c) => `\\${c}`)
      query = query
        .ilike('produit', ilikeExact(produitTrim))
        .ilike('unite', ilikeExact(uniteTrim))
    }

    const { data: consolides, error } = await query.select('id')
    if (error) throw error

    return NextResponse.json({ nbConsolides: (consolides ?? []).length, persisted: true })
  } catch (error) {
    return erreurServeur('besoins/consolider', error)
  }
}
