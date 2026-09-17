import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getDeviceSubject } from '@/lib/device-session'

// Enregistrement du token de notifications push d'un appareil (Task 29).
// Le client natif (@capacitor/push-notifications) obtient un token FCM
// (Android) ou APNs (iOS) et le poste ici ; le serveur le rattache au
// subject dérivé du cookie de session appareil — un appareil n'enregistre
// QUE son propre token, la même frontière de confiance que
// /api/notifications (jamais de subject fourni par le client).
//
// Le token est UNIQUE : si le même appareil se (re)connecte sous un autre
// compte, l'upsert sur token réattribue la ligne — les push suivants partent
// au compte courant, jamais à l'ancien propriétaire du device.
//
// Repli gracieux : si la table device_push_tokens n'existe pas encore
// (migration 20260918120000 non appliquée sur la DB cible), la route répond
// 200 { ok: true, stored: false } — le client garde son token marqué
// « en attente » localement et le renverra au prochain registration
// (FCM régénère un événement à chaque lancement). Aucun 500 pour une
// infrastructure push pas encore déployée : l'app entière fonctionne sans.
//
// L'ENVOI réel des push (FCM HTTP v1 / APNs) n'est pas dans cette route :
// il exige des credentials serveur (compte de service Firebase) et un
// déclencheur (BO/cron). Voir docs/CAPACITOR.md § Notifications push.

const PLATFORMS = ['android', 'ios', 'web'] as const

/** La migration Task 29 crée device_push_tokens. Tant qu'elle n'est pas
 * appliquée, PostgREST répond avec 42P01 (relation inexistante) ou
 * PGRST205 (table introuvable) — détecté pour replier sans 500. */
function isMissingTableError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  return (
    e?.code === '42P01' ||
    e?.code === 'PGRST205' ||
    /relation .* does not exist|Could not find the table/i.test(e?.message ?? '')
  )
}

export async function POST(request: NextRequest) {
  try {
    const subject = await getDeviceSubject(request)
    if (!subject) {
      return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    const platform = typeof body?.platform === 'string' && (PLATFORMS as readonly string[]).includes(body.platform)
      ? body.platform
      : null
    if (!token || token.length > 4096) {
      return NextResponse.json({ erreur: 'token requis (≤ 4096 caractères)' }, { status: 400 })
    }
    if (!platform) {
      return NextResponse.json({ erreur: 'platform invalide (android|ios|web)' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { error } = await supabase
      .from('device_push_tokens')
      .upsert(
        {
          subject,
          token,
          platform,
          // updated_at reposé explicitement : l'upsert ne touche pas les
          // defaults qui ne s'appliquent qu'aux INSERT.
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' },
      )

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ ok: true, stored: false })
      }
      console.error('[API push-tokens POST]', error)
      return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, stored: true })
  } catch (error) {
    console.error('[API push-tokens POST]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}

// DELETE ?token=<token> : désenregistre le token de CE subject uniquement
// (la ligne correspondante, si elle appartient à un autre subject, n'est
// pas touchée — deleteMany ne révèle rien).
export async function DELETE(request: NextRequest) {
  try {
    const subject = await getDeviceSubject(request)
    if (!subject) {
      return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    if (!token) {
      return NextResponse.json({ erreur: 'token requis' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { error } = await supabase
      .from('device_push_tokens')
      .delete()
      .eq('token', token)
      .eq('subject', subject)

    if (error && !isMissingTableError(error)) {
      console.error('[API push-tokens DELETE]', error)
      return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[API push-tokens DELETE]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
