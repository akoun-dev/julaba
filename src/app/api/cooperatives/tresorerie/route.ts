import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requirePresident, erreurServeur } from '@/lib/cooperatives/resolver'
import { agregerTresorerieValidee } from '@/lib/cooperatives/tresorerie'

// MODE-921 (§3.3) — trésorerie coopérative.
//
// GET : solde = Σ entrées validées − Σ sorties validées (le workflow
// en_attente → validee/annulee est la SEULE source de vérité du solde) +
// transactions récentes. En side-request : le total des cotisations
// validées (catégorie 'cotisation') pour le KPI d'accueil.
//
// MODE-986 (DET-COOP-003) — chaque écriture expose son canal :
// 'especes' (déclaration honnête, aucun mouvement wallet) ou 'keiwa'
// (portefeuille du marchand DÉBITÉ dans la même transaction SQL). Le
// président voit enfin comment l'argent est réellement passé.
//
// POST : création d'une transaction (entree|sortie) par le responsable —
// elle démarre 'en_attente' et doit être validée (même double validation
// que la trésorerie de julaba-app). La catégorie 'cotisation' est refusée
// ici : la cotisation d'un membre passe par POST /cooperatives/cotisation
// (elle nait 'validee', posée par le membre lui-même, pas par le président).

const CATEGORIES = ['cotisation', 'vente_groupee', 'achat_groupe', 'commission', 'frais', 'subvention', 'autre'] as const
type Categorie = (typeof CATEGORIES)[number]

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const cooperateurId = searchParams.get('cooperateurId')
    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur

    const supabase = createSupabaseAdminClient()
    const { data: transactions, error } = await supabase
      .from('cooperative_transactions')
      .select('id, type, categorie, montant, membre_id, description, statut, canal, created_at')
      .eq('cooperative_id', garde.ctx.cooperative.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error

    // MODE-935 (I-04) — solde et cotisations agrégés sur TOUTES les
    // écritures validées via le module partagé (l'ancien code les dérivait
    // des 100 dernières lignes : deux soldes différents au-delà de 100
    // écritures selon l'écran consulté). La liste ci-dessus reste bornée
    // à 100 pour l'AFFICHAGE uniquement.
    const { solde, totalCotisations } = await agregerTresorerieValidee(
      supabase,
      garde.ctx.cooperative.id
    )
    const liste = transactions ?? []
    const enAttente = liste.filter((t) => t.statut === 'en_attente').length

    return NextResponse.json({
      solde,
      totalCotisations,
      enAttente,
      transactions: liste.map((t) => ({
        id: t.id,
        type: t.type,
        categorie: t.categorie,
        montant: Number(t.montant),
        membreId: t.membre_id,
        description: t.description,
        statut: t.statut,
        // MODE-986 — canal de l'écriture ('especes' par défaut : les
        // écritures antérieures à la migration sont des déclarations
        // espèces, jamais des mouvements wallet).
        canal: (t.canal ?? 'especes') as 'especes' | 'keiwa',
        date: t.created_at,
      })),
    })
  } catch (error) {
    return erreurServeur('tresorerie GET', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { cooperateurId, type, categorie, montant, description, membreId, clientId } = body as {
      cooperateurId?: string
      type?: string
      categorie?: string
      montant?: number
      description?: string
      membreId?: string
      clientId?: string
    }
    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur

    if (type !== 'entree' && type !== 'sortie') {
      return NextResponse.json({ erreur: 'Type invalide (entree|sortie)' }, { status: 400 })
    }
    const montantNum = Number(montant)
    if (!Number.isFinite(montantNum) || montantNum <= 0 || !Number.isInteger(montantNum)) {
      return NextResponse.json(
        { erreur: 'Montant invalide — un montant en FCFA est un entier strictement positif' },
        { status: 400 }
      )
    }
    const cat = (typeof categorie === 'string' && categorie ? categorie : 'autre') as Categorie
    if (!CATEGORIES.includes(cat)) {
      return NextResponse.json({ erreur: 'Catégorie invalide' }, { status: 400 })
    }
    if (cat === 'cotisation') {
      return NextResponse.json(
        { erreur: 'La cotisation est enregistrée par le membre lui-même (POST /cooperatives/cotisation)' },
        { status: 400 }
      )
    }
    const descTrim = typeof description === 'string' ? description.trim() : ''
    if (!descTrim) {
      return NextResponse.json({ erreur: 'Description requise' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    // MODE-935 (I-08) — idempotence du rejeu offline : un client_id déjà
    // enregistré pour CETTE coopérative renvoie l'écriture existante sans
    // rien re-compter (crash entre le commit serveur et le dequeue). Un
    // index unique partiel (migration 20260921120000) ferme la course
    // entre deux rejeus concurrents.
    const clientTrim = typeof clientId === 'string' && clientId ? clientId.slice(0, 64) : null
    if (clientTrim) {
      const { data: dejaLa } = await supabase
        .from('cooperative_transactions')
        .select('id, statut')
        .eq('cooperative_id', garde.ctx.cooperative.id)
        .eq('client_id', clientTrim)
        .maybeSingle()
      if (dejaLa) {
        return NextResponse.json({ transaction: dejaLa, rejeu: true }, { status: 200 })
      }
    }

    const { data: transaction, error } = await supabase
      .from('cooperative_transactions')
      .insert({
        cooperative_id: garde.ctx.cooperative.id,
        type,
        categorie: cat,
        montant: montantNum,
        membre_id: typeof membreId === 'string' && membreId ? membreId : null,
        description: descTrim,
        statut: 'en_attente',
        created_by: garde.ctx.cooperateurId,
        client_id: clientTrim,
      })
      .select('id, statut')
      .single()
    if (error) {
      // 23505 = course de rejeus perdue : l'autre commit a gagné, on rend
      // son écriture (idempotence, jamais d'erreur pour le rejeu).
      if ((error as { code?: string }).code === '23505' && clientTrim) {
        const { data: gagnante } = await supabase
          .from('cooperative_transactions')
          .select('id, statut')
          .eq('cooperative_id', garde.ctx.cooperative.id)
          .eq('client_id', clientTrim)
          .maybeSingle()
        if (gagnante) {
          return NextResponse.json({ transaction: gagnante, rejeu: true }, { status: 200 })
        }
      }
      throw error
    }

    return NextResponse.json({ transaction }, { status: 201 })
  } catch (error) {
    return erreurServeur('tresorerie POST', error)
  }
}
