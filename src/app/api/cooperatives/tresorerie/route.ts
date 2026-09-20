import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requirePresident, erreurServeur } from '@/lib/cooperatives/resolver'

// MODE-921 (§3.3) — trésorerie coopérative.
//
// GET : solde = Σ entrées validées − Σ sorties validées (le workflow
// en_attente → validee/annulee est la SEULE source de vérité du solde) +
// transactions récentes. En side-request : le total des cotisations
// validées (catégorie 'cotisation') pour le KPI d'accueil.
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
      .select('id, type, categorie, montant, membre_id, description, statut, created_at')
      .eq('cooperative_id', garde.ctx.cooperative.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error

    const liste = transactions ?? []
    const solde = liste
      .filter((t) => t.statut === 'validee')
      .reduce(
        (total, t) => total + (t.type === 'entree' ? Number(t.montant) : -Number(t.montant)),
        0
      )
    const totalCotisations = liste
      .filter((t) => t.statut === 'validee' && t.categorie === 'cotisation')
      .reduce((total, t) => total + Number(t.montant), 0)
    const enAttente = liste.filter((t) => t.statut === 'en_attente').length

    return NextResponse.json({
      solde: Math.round(solde),
      totalCotisations: Math.round(totalCotisations),
      enAttente,
      transactions: liste.map((t) => ({
        id: t.id,
        type: t.type,
        categorie: t.categorie,
        montant: Number(t.montant),
        membreId: t.membre_id,
        description: t.description,
        statut: t.statut,
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
    const { cooperateurId, type, categorie, montant, description, membreId } = body as {
      cooperateurId?: string
      type?: string
      categorie?: string
      montant?: number
      description?: string
      membreId?: string
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
      })
      .select('id, statut')
      .single()
    if (error) throw error

    return NextResponse.json({ transaction }, { status: 201 })
  } catch (error) {
    return erreurServeur('tresorerie POST', error)
  }
}
