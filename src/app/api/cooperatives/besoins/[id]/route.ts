import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requirePresident, erreurServeur } from '@/lib/cooperatives/resolver'

// MODE-921 (§3.5) — dispatch d'un besoin par le responsable : statut
// (en_attente → en_cours → livre). MODE-946 (F-14) : 'approuve' est
// RETIRÉ de la machine — jamais posé par le client ni par la RPC, la
// distribution physique clôture directement 'livre' (MODE-942). Prix
// d'achat et de dispatch. Le besoin doit appartenir à SA coopérative.
// La distribution physique du stock se fait par POST /cooperatives/
// distribution avec besoinId — le lien besoin↔distribution est posé là.

const STATUTS = ['en_attente', 'consolide', 'en_cours', 'livre'] as const
type Statut = (typeof STATUTS)[number]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { cooperateurId, statut, quantiteAttribuee, prixAchat, prixDispatch, notes } = body as {
      cooperateurId?: string
      statut?: string
      quantiteAttribuee?: number
      prixAchat?: number
      prixDispatch?: number
      notes?: string
    }
    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur

    const updates: Record<string, unknown> = {}

    if (statut !== undefined) {
      if (!STATUTS.includes(statut as Statut)) {
        return NextResponse.json({ erreur: 'Statut invalide' }, { status: 400 })
      }
      updates.statut = statut
    }
    if (quantiteAttribuee !== undefined) {
      const q = Number(quantiteAttribuee)
      if (!Number.isFinite(q) || q <= 0) {
        return NextResponse.json({ erreur: 'Quantité attribuée invalide' }, { status: 400 })
      }
      updates.quantite_attribuee = q
    }
    if (prixAchat !== undefined) {
      const p = Number(prixAchat)
      if (!Number.isFinite(p) || p <= 0 || !Number.isInteger(p)) {
        return NextResponse.json({ erreur: 'Prix d\u2019achat invalide — entier FCFA' }, { status: 400 })
      }
      updates.prix_achat = p
    }
    if (prixDispatch !== undefined) {
      const p = Number(prixDispatch)
      if (!Number.isFinite(p) || p <= 0 || !Number.isInteger(p)) {
        return NextResponse.json({ erreur: 'Prix de dispatch invalide — entier FCFA' }, { status: 400 })
      }
      updates.prix_dispatch = p
    }
    if (notes !== undefined) {
      updates.notes = typeof notes === 'string' && notes.trim() ? notes.trim() : null
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ erreur: 'Aucune modification fournie' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: besoin, error: errUpdate } = await supabase
      .from('cooperative_besoins')
      .update(updates)
      .eq('id', id)
      .eq('cooperative_id', garde.ctx.cooperative.id)
      .select('id, statut, quantite_attribuee, prix_achat, prix_dispatch')
      .single()
    if (errUpdate || !besoin) {
      return NextResponse.json({ erreur: 'Besoin non trouvé dans votre coopérative' }, { status: 404 })
    }

    return NextResponse.json({ besoin })
  } catch (error) {
    return erreurServeur('besoins/[id] PATCH', error)
  }
}
