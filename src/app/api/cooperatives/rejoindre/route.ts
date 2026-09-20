import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireMarchandSession, erreurServeur } from '@/lib/cooperatives/resolver'
import { createNotification } from '@/lib/notifications/server'

// MODE-921 (§3.2) — demande d'adhésion d'un MARCHAND à une coopérative de
// l'annuaire : la ligne naît 'en_attente' ; le responsable l'accepte
// (PATCH membres/[id] statut 'actif') ou la refuse (DELETE). Idempotence
// de demande : un marchand ne peut pas déposer DEUX demandes actives
// (en_attente) ni être membre de deux coopératives à la fois.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { merchantId, cooperativeId } = body as {
      merchantId?: string
      cooperativeId?: string
    }
    const garde = await requireMarchandSession(req, merchantId)
    if (garde) return garde

    if (!cooperativeId) {
      return NextResponse.json({ erreur: 'Coopérative requise' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    // La coopérative visée doit exister et être active — un id forgé ne
    // crée pas une adhésion fantôme.
    const { data: cooperative } = await supabase
      .from('cooperatives')
      .select('id, nom, responsable_id')
      .eq('id', cooperativeId)
      .eq('actif', true)
      .maybeSingle()
    if (!cooperative) {
      return NextResponse.json({ erreur: 'Coopérative non trouvée ou inactive' }, { status: 404 })
    }

    // Une seule adhésion active / une seule demande en cours à la fois.
    const { data: adhesions } = await supabase
      .from('cooperative_membres')
      .select('id, statut, cooperative_id')
      .eq('membre_id', merchantId!)
      .in('statut', ['actif', 'en_attente'])
    const existante = (adhesions ?? []).find((a) => a.cooperative_id === cooperativeId)
    if (existante) {
      const dejaActif = existante.statut === 'actif'
      return NextResponse.json(
        {
          erreur: dejaActif
            ? 'Vous êtes déjà membre de cette coopérative'
            : 'Votre demande d\u2019adhésion à cette coopérative est déjà en attente',
        },
        { status: 409 }
      )
    }
    const autre = (adhesions ?? [])[0]
    if (autre) {
      return NextResponse.json(
        {
          erreur:
            autre.statut === 'actif'
              ? 'Vous êtes déjà membre d\u2019une autre coopérative'
              : 'Vous avez déjà une demande en attente ailleurs',
        },
        { status: 409 }
      )
    }

    const { data: membre, error } = await supabase
      .from('cooperative_membres')
      .insert({
        cooperative_id: cooperativeId,
        membre_id: merchantId!,
        statut: 'en_attente',
        role: 'membre',
        date_adhesion: new Date().toISOString().slice(0, 10),
      })
      .select('id, statut')
      .single()
    if (error) throw error

    // Le responsable est prévenu (notification réelle, priorité haute).
    await createNotification({
      subjectType: 'cooperateur',
      subjectId: cooperative.responsable_id,
      type: 'cooperative_info',
      title: 'Nouvelle demande d\u2019adhésion',
      body: `Un marchand a demandé à rejoindre ${cooperative.nom}. Ouvrez l'espace Membres pour accepter ou refuser.`,
    })

    return NextResponse.json({ membre }, { status: 201 })
  } catch (error) {
    return erreurServeur('rejoindre', error)
  }
}
