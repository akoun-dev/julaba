import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requirePresident, erreurServeur } from '@/lib/cooperatives/resolver'

// MODE-921 (§3.2) — actions du responsable sur un membre :
//   PATCH { statut } : suspendre | réactiver | exclure (motif requis
//     pour suspendu/exclu — une sanction sans pourquoi n'est pas traçable,
//     même principe que l'annulation de vente MODE-909) ;
//   PATCH { role } : promouvoir/rétrograder un chef de groupe
//     ('president' dans cooperative_membres.role — le responsable de la
//     coopérative reste cooperatives.responsable_id, jamais modifié ici) ;
//   DELETE : exclusion définitive (suppression de la ligne d'adhésion).

const STATUTS_AUTORISES = ['actif', 'suspendu', 'en_attente', 'exclu'] as const
type Statut = (typeof STATUTS_AUTORISES)[number]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { cooperateurId, statut, role, motif } = body as {
      cooperateurId?: string
      statut?: string
      role?: string
      motif?: string
    }
    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur

    const supabase = createSupabaseAdminClient()

    // Le membre doit appartenir à MA coopérative — un président ne peut pas
    // opérer sur l'adhésion d'une autre coopérative par id forgé.
    const { data: membre } = await supabase
      .from('cooperative_membres')
      .select('id, membre_id, statut')
      .eq('id', id)
      .eq('cooperative_id', garde.ctx.cooperative.id)
      .maybeSingle()
    if (!membre) {
      return NextResponse.json({ erreur: 'Membre non trouvé dans votre coopérative' }, { status: 404 })
    }

    if (typeof statut === 'string') {
      if (!STATUTS_AUTORISES.includes(statut as Statut)) {
        return NextResponse.json({ erreur: 'Statut invalide' }, { status: 400 })
      }
      if (statut === 'suspendu' || statut === 'exclu') {
        const motifTrim = typeof motif === 'string' ? motif.trim() : ''
        if (motifTrim.length < 3 || motifTrim.length > 200) {
          return NextResponse.json(
            { erreur: 'Motif requis (3-200 caractères)' },
            { status: 400 }
          )
        }
      }
      const { error } = await supabase
        .from('cooperative_membres')
        .update({ statut })
        .eq('id', id)
      if (error) throw error
    }

    if (typeof role === 'string') {
      if (role !== 'membre' && role !== 'president') {
        return NextResponse.json({ erreur: 'Rôle invalide' }, { status: 400 })
      }
      const { error } = await supabase
        .from('cooperative_membres')
        .update({ role })
        .eq('id', id)
      if (error) throw error
    }

    if (typeof statut !== 'string' && typeof role !== 'string') {
      return NextResponse.json({ erreur: 'Aucune modification fournie' }, { status: 400 })
    }

    const { data: misAJour } = await supabase
      .from('cooperative_membres')
      .select('id, statut, role')
      .eq('id', id)
      .single()
    return NextResponse.json({ membre: misAJour })
  } catch (error) {
    return erreurServeur('membres/[id] PATCH', error)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const cooperateurId = searchParams.get('cooperateurId')
    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur

    const supabase = createSupabaseAdminClient()
    const { error } = await supabase
      .from('cooperative_membres')
      .delete()
      .eq('id', id)
      .eq('cooperative_id', garde.ctx.cooperative.id)
    if (error) throw error
    return NextResponse.json({ supprime: true })
  } catch (error) {
    return erreurServeur('membres/[id] DELETE', error)
  }
}
