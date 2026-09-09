import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getDeviceSubject } from '@/lib/device-session'

// In-app notification center for marchand/producteur/identificateur.
// Identity comes entirely from the device-session cookie (never a
// client-supplied subject) — a device only ever reads or marks-read its own
// notifications, same trust boundary as every other actor-facing route.
export async function GET(request: NextRequest) {
  try {
    const subject = await getDeviceSubject(request)
    if (!subject) {
      return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
    }

    // ?before=<ISO createdAt> pages further back than the initial 50 —
    // simple cursor on createdAt (unique enough here: two notifications
    // for the same subject at the exact same millisecond just page
    // together, which is harmless).
    const before = new URL(request.url).searchParams.get('before')
    const supabase = createSupabaseAdminClient()

    let query = supabase
      .from('legacy_notifications')
      .select('*')
      .eq('subject', subject)

    if (before) {
      query = query.lt('created_at', before)
    }

    const [notificationsResult, unreadResult] = await Promise.all([
      query.order('created_at', { ascending: false }).limit(50),
      supabase
        .from('legacy_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('subject', subject)
        .eq('read', false),
    ])

    if (notificationsResult.error) throw notificationsResult.error
    if (unreadResult.error) throw unreadResult.error

    return NextResponse.json({
      notifications: notificationsResult.data ?? [],
      unreadCount: unreadResult.count ?? 0,
    })
  } catch (error) {
    console.error('[API notifications GET]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}

// PATCH { id } marks one notification read, { all: true } marks every
// unread notification for this subject read. updateMany (not update) so a
// notification id that doesn't belong to this subject silently matches
// zero rows instead of leaking whether it exists.
export async function PATCH(request: NextRequest) {
  try {
    const subject = await getDeviceSubject(request)
    if (!subject) {
      return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
    }

    const body = await request.json()
    const supabase = createSupabaseAdminClient()

    if (body.all) {
      await supabase
        .from('legacy_notifications')
        .update({ read: true })
        .eq('subject', subject)
        .eq('read', false)
    } else if (body.id) {
      await supabase
        .from('legacy_notifications')
        .update({ read: true })
        .eq('id', body.id)
        .eq('subject', subject)
    } else {
      return NextResponse.json({ erreur: 'id ou all requis' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[API notifications PATCH]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}

// DELETE ?id=<id> removes one notification, ?onlyRead=true clears every
// read notification for this subject. deleteMany (not delete) for the same
// reason PATCH uses updateMany — a foreign id just matches zero rows.
export async function DELETE(request: NextRequest) {
  try {
    const subject = await getDeviceSubject(request)
    if (!subject) {
      return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const onlyRead = searchParams.get('onlyRead') === 'true'

    const supabase = createSupabaseAdminClient()

    if (onlyRead) {
      await supabase
        .from('legacy_notifications')
        .delete()
        .eq('subject', subject)
        .eq('read', true)
    } else if (id) {
      await supabase
        .from('legacy_notifications')
        .delete()
        .eq('id', id)
        .eq('subject', subject)
    } else {
      return NextResponse.json({ erreur: 'id ou onlyRead requis' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[API notifications DELETE]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
