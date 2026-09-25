import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireMembreActif, requireMembreActifOuPresident, requirePresident, erreurServeur } from '@/lib/cooperatives/resolver'

// MODE-921 (§3.4) — le pot commun de stock.
//
// GET : lecture OUVERTE aux deux côtés — le membre actif (merchantId) ou
// le président (cooperateurId). La coopérative est résolue serveur dans
// les deux cas ; aucun appelant ne lit le pot commun d'un autre.
//
// POST : apport au pot commun — MEMBRE actif OU PRÉSIDENT (MODE-931 : la
// garde duale règle le 403 du président ; le mouvement est signé par
// l'opérateur réel). Implémentation transactionnelle via la RPC
// coop_apporter_stock (voir migration 20260920100100 + 20260921010000) :
// upsert de la ligne courante + UN mouvement 'apport' dans le journal
// append-only, idempotent sur clientId (rejeu offline reconnu, rien
// re-compté).

// DET-008/NORM-305 — le client admin Supabase est volontairement non typé
// (any) : type de ligne minimal pour le pot commun (MODE-980, cf. VenteRow).
type StockCommunRow = {
  id: string
  produit: string | null
  categorie: string | null
  quantite: number | null
  unite: string | null
  updated_at: string | null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const merchantId = searchParams.get('merchantId')
    const cooperateurId = searchParams.get('cooperateurId')

    let cooperativeId: string
    let cooperativeNom: string
    if (cooperateurId) {
      // Lecture par le président (espace coopérative).
      const garde = await requirePresident(req, cooperateurId)
      if ('erreur' in garde) return garde.erreur
      cooperativeId = garde.ctx.cooperative.id
      cooperativeNom = garde.ctx.cooperative.nom
    } else {
      // Lecture par un membre actif (écran marchand / apport).
      const garde = await requireMembreActif(req, merchantId)
      if ('erreur' in garde) return garde.erreur
      cooperativeId = garde.ctx.cooperative.id
      cooperativeNom = garde.ctx.cooperative.nom
    }

    const supabase = createSupabaseAdminClient()
    const { data: stock, error } = await supabase
      .from('cooperative_stock')
      .select('id, produit, categorie, quantite, unite, updated_at')
      .eq('cooperative_id', cooperativeId)
      .order('produit', { ascending: true })
    if (error) throw error

    return NextResponse.json({
      cooperative: { id: cooperativeId, nom: cooperativeNom },
      stock: ((stock ?? []) as StockCommunRow[]).map((s) => ({
        id: s.id,
        produit: s.produit,
        categorie: s.categorie,
        quantite: Number(s.quantite),
        unite: s.unite,
        misAJour: s.updated_at,
      })),
    })
  } catch (error) {
    return erreurServeur('stock GET', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { merchantId, cooperateurId, produit, categorie, quantite, unite, clientId } = body as {
      merchantId?: string
      cooperateurId?: string
      produit?: string
      categorie?: string
      quantite?: number
      unite?: string
      clientId?: string
    }
    // MODE-931 — garde duale : membre actif (merchantId) OU président
    // (cooperateurId). L'opérateur signe le mouvement (membre_id text).
    const garde = await requireMembreActifOuPresident(req, { merchantId, cooperateurId })
    if ('erreur' in garde) return garde.erreur
    const operateurId = garde.ctx.type === 'president' ? garde.ctx.cooperateurId : garde.ctx.merchantId

    const produitTrim = typeof produit === 'string' ? produit.trim() : ''
    if (!produitTrim || produitTrim.length > 120) {
      return NextResponse.json({ erreur: 'Produit requis (120 caractères max)' }, { status: 400 })
    }
    const quantiteNum = Number(quantite)
    if (!Number.isFinite(quantiteNum) || quantiteNum <= 0) {
      return NextResponse.json({ erreur: 'Quantité invalide — strictement positive requise' }, { status: 400 })
    }
    const uniteTrim = typeof unite === 'string' && unite.trim() ? unite.trim() : 'kg'

    const supabase = createSupabaseAdminClient()
    const { data: resultat, error } = await supabase.rpc('coop_apporter_stock', {
      p_cooperative_id: garde.ctx.cooperative.id,
      p_membre_id: operateurId,
      p_produit: produitTrim,
      p_categorie: typeof categorie === 'string' && categorie.trim() ? categorie.trim() : null,
      p_quantite: quantiteNum,
      p_unite: uniteTrim,
      p_client_id: typeof clientId === 'string' && clientId ? clientId : null,
    })
    if (error) {
      // QUANTITE_INVALIDE / violation de contrainte : rejet définitif
      // lisible (le rejeu offline ne doit pas tourner en boucle).
      const message = (error as { message?: string }).message || ''
      if (message.includes('QUANTITE_INVALIDE') || message.includes('check')) {
        return NextResponse.json({ erreur: 'Quantité invalide' }, { status: 422 })
      }
      // MODE-935 (I-05) — l'unité d'une ligne existante est verrouillée :
      // un apport dans une autre unité est refusé lisiblement (409, pas
      // d'écrasement silencieux ni d'addition inter-unités).
      if (message.includes('UNITE_DIFFERENTE')) {
        const unite = message.split('unite=')[1]?.trim()
        return NextResponse.json(
          {
            erreur: unite
              ? `Unité incompatible — ce produit est déjà compté en « ${unite} ». Apportez la même unité.`
              : 'Unité incompatible avec la ligne existante du pot commun',
          },
          { status: 409 }
        )
      }
      throw error
    }

    return NextResponse.json({ persisted: resultat !== null, stock: resultat }, { status: 201 })
  } catch (error) {
    return erreurServeur('stock POST', error)
  }
}
