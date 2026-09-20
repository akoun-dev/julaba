import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requirePresident, erreurServeur } from '@/lib/cooperatives/resolver'
import { createNotification } from '@/lib/notifications/server'

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
      if (statut === 'actif') {
        // MODE-922 : un marchand ne peut pas être actif dans DEUX
        // coopératives (index unique partiel uniq_coop_membre_actif) —
        // le check rend le 409 lisible avant l'erreur 23505 de la base.
        const { data: autreActive } = await supabase
          .from('cooperative_membres')
          .select('id')
          .eq('membre_id', membre.membre_id)
          .eq('actif', true)
          .neq('id', id)
          .maybeSingle()
        if (autreActive) {
          return NextResponse.json(
            { erreur: 'Ce marchand est déjà actif dans une autre coopérative' },
            { status: 409 }
          )
        }
      }
      const { error } = await supabase
        .from('cooperative_membres')
        .update({ statut })
        .eq('id', id)
      if (error) {
        // Filet anti-course : deux activations simultanées → 409 lisible.
        if (error.code === '23505') {
          return NextResponse.json(
            { erreur: 'Ce marchand est déjà actif dans une autre coopérative' },
            { status: 409 }
          )
        }
        throw error
      }

      // MODE-922 : le marchand est prévenu du sort de son adhésion —
      // acceptation, suspension ou exclusion ne restent jamais un silence.
      const nomCoop = garde.ctx.cooperative.nom
      if (statut === 'actif') {
        await createNotification({
          subjectType: 'merchant',
          subjectId: membre.membre_id,
          type: 'cooperative_info',
          title: 'Adhésion acceptée',
          body: `Bienvenue — votre adhésion à « ${nomCoop} » est active.`,
        })
      } else if (statut === 'suspendu' || statut === 'exclu') {
        await createNotification({
          subjectType: 'merchant',
          subjectId: membre.membre_id,
          type: 'cooperative_info',
          title: statut === 'suspendu' ? 'Adhésion suspendue' : 'Adhésion résiliée',
          body: `Votre adhésion à « ${nomCoop} » est ${statut === 'suspendu' ? 'suspendue' : 'résiliée'}. Motif : ${motif ?? 'non précisé'}.`,
        })
      }
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

      // MODE-922 : promotion/rétrogradation notifiée au marchand.
      await createNotification({
        subjectType: 'merchant',
        subjectId: membre.membre_id,
        type: 'cooperative_info',
        title: role === 'president' ? 'Promotion : chef de groupe' : 'Rôle mis à jour',
        body:
          role === 'president'
            ? `Vous êtes désormais chef de groupe dans « ${garde.ctx.cooperative.nom} ».`
            : `Vous redevenez membre simple dans « ${garde.ctx.cooperative.nom} ».`,
      })
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

    // MODE-922 : lecture avant suppression — le marchand doit être prévenu
    // du refus de sa demande ou de son exclusion (jamais un silence).
    const { data: membre } = await supabase
      .from('cooperative_membres')
      .select('id, membre_id, statut')
      .eq('id', id)
      .eq('cooperative_id', garde.ctx.cooperative.id)
      .maybeSingle()
    if (!membre) {
      return NextResponse.json({ erreur: 'Membre non trouvé dans votre coopérative' }, { status: 404 })
    }

    const { error } = await supabase
      .from('cooperative_membres')
      .delete()
      .eq('id', id)
      .eq('cooperative_id', garde.ctx.cooperative.id)
    if (error) throw error

    await createNotification({
      subjectType: 'merchant',
      subjectId: membre.membre_id,
      type: 'cooperative_info',
      title: membre.statut === 'en_attente' ? 'Demande d’adhésion refusée' : 'Adhésion résiliée',
      body:
        membre.statut === 'en_attente'
          ? `Votre demande d'adhésion à « ${garde.ctx.cooperative.nom} » n'a pas été retenue.`
          : `Votre adhésion à « ${garde.ctx.cooperative.nom} » a été résiliée par le responsable.`,
    })

    return NextResponse.json({ supprime: true })
  } catch (error) {
    return erreurServeur('membres/[id] DELETE', error)
  }
}
