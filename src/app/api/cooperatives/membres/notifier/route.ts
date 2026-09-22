import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requirePresident, erreurServeur } from '@/lib/cooperatives/resolver'
import { createNotification } from '@/lib/notifications/server'

// MODE-982 (DET-COOP-011, parité julaba-app §4) — « Notifier un membre » :
// le président envoie un message libre qui tombe dans le centre de
// notifications du marchand (type dédié 'cooperative_info', MODE-931).
//
// Garde : requirePresident (session appareil + coopérative active) — le
// membreId est VERIFIÉ appartenir à LA coopérative résolue serveur : un
// président ne peut pas notifier un marchand hors de sa coopérative en
// forgeant un id (même invariant que toutes les routes du résolveur).
//
// Hors ligne : pas de file — la notification est un effet serveur
// best-effort ; un rejeu offline la dupliquerait (pas de clientId sur ce
// flux, contrairement aux écritures). L'écran affiche le refus honnête.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const { cooperateurId, membreId, message } = (body ?? {}) as {
      cooperateurId?: string
      membreId?: string
      message?: string
    }

    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur
    const { cooperative } = garde.ctx

    if (!membreId || typeof membreId !== 'string') {
      return NextResponse.json({ erreur: 'Membre requis' }, { status: 400 })
    }
    const texte = typeof message === 'string' ? message.trim() : ''
    if (texte.length < 3 || texte.length > 200) {
      return NextResponse.json(
        { erreur: 'Message requis (3 à 200 caractères)' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseAdminClient()
    const { data: adhesion, error } = await supabase
      .from('cooperative_membres')
      .select('id, membre_id')
      .eq('id', membreId)
      .eq('cooperative_id', cooperative.id)
      .maybeSingle()
    if (error) throw error
    if (!adhesion) {
      return NextResponse.json(
        { erreur: "Ce membre n'appartient pas à votre coopérative" },
        { status: 404 }
      )
    }

    // Best-effort historique : une notification ne bloque jamais l'action
    // qui la porte (ici elle EST l'action — un échec sort en 500 honnête
    // via erreurServeur, l'écran propose de réessayer).
    await createNotification({
      subjectType: 'merchant',
      subjectId: (adhesion as { membre_id: string }).membre_id,
      type: 'cooperative_info',
      title: `Message de ${cooperative.nom}`,
      body: texte,
      severity: 'reminder',
      data: { cooperativeId: cooperative.id, adhesionId: (adhesion as { id: string }).id },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return erreurServeur('membres/notifier POST', error)
  }
}
