import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'

// Admin visibility + recovery path for the device-claim security model
// (src/lib/device-session.ts): first device to claim a subject
// ("merchant:<id>" etc) owns it permanently, with no other way to recover a
// lost or stolen phone. Until now there was no way for an admin to even see
// which devices were claimed, let alone revoke one to unblock a user.
export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'device-sessions', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('device_sessions')
      .select('id, subject, created_at, expires_at, revoked_at')
      .order('created_at', { ascending: false })
      .limit(300)

    if (error) throw error

    const sessions = data ?? []
    const merchantIds = sessions.filter((s) => s.subject.startsWith('merchant:')).map((s) => s.subject.slice('merchant:'.length))
    const producteurIds = sessions.filter((s) => s.subject.startsWith('producteur:')).map((s) => s.subject.slice('producteur:'.length))

    let merchantActors: { merchant_id: string; first_name: string; phone: string }[] = []
    let producteurActors: { producteur_id: string; first_name: string; phone: string }[] = []

    if (merchantIds.length) {
      const { data: mData } = await supabase
        .from('legacy_bo_actors')
        .select('merchant_id, first_name, phone')
        .in('merchant_id', merchantIds)
      merchantActors = mData ?? []
    }
    if (producteurIds.length) {
      const { data: pData } = await supabase
        .from('legacy_bo_actors')
        .select('producteur_id, first_name, phone')
        .in('producteur_id', producteurIds)
      producteurActors = pData ?? []
    }

    const byMerchantId = Object.fromEntries(merchantActors.map((a) => [a.merchant_id, a]))
    const byProducteurId = Object.fromEntries(producteurActors.map((a) => [a.producteur_id, a]))

    const enriched = sessions.map((s) => {
      const [type, id] = s.subject.split(':')
      const actor = type === 'merchant' ? byMerchantId[id] : type === 'producteur' ? byProducteurId[id] : undefined
      // Dates normalisées en camelCase : l'écran lit createdAt/expiresAt —
      // renvoyer les colonnes brutes created_at/expires_at donnait
      // « Invalid Date » sur chaque ligne.
      return {
        id: s.id,
        subject: s.subject,
        type,
        subjectId: id,
        actorName: actor ? `${actor.first_name}` : null,
        actorPhone: actor?.phone ?? null,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
        revokedAt: s.revoked_at ?? null,
      }
    })

    return NextResponse.json({ sessions: enriched })
  } catch (error) {
    console.error('[API backoffice/device-sessions GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des sessions appareil' }, { status: 500 })
  }
}

// DELETE - revoke a device claim so the account can be re-claimed by a new
// device (account recovery after a lost/stolen phone). ?id=<DeviceSession.id>
export async function DELETE(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'device-sessions', 'delete')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ erreur: 'Identifiant requis' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: existing, error: findError } = await supabase
      .from('device_sessions')
      .select('subject')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ erreur: 'Session introuvable' }, { status: 404 })
    }

    // MODE-949 (AUDIT-003 S-11) — révocation DOUCE : la ligne est marquée
    // revoked_at = now() au lieu d'être supprimée (fin de la révocation sans
    // trace). getDeviceSubject refuse immédiatement toute session révoquée ;
    // le claim d'un nouvel appareil (code de liaison) remet revoked_at à NULL.
    const { error: revokeError } = await supabase
      .from('device_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)

    if (revokeError) throw revokeError

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'device_session_revoke', module: 'device-sessions',
      details: `Session appareil révoquée pour ${existing.subject}`, request,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[API backoffice/device-sessions DELETE]', error)
    return NextResponse.json({ erreur: 'Erreur lors de la révocation' }, { status: 500 })
  }
}
