import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getDeviceSubject } from '@/lib/device-session'
import { formatZodError } from '@/lib/validation/marchand'

// Centre de notifications in-app des acteurs (marchand/producteur/
// identificateur). L'identité vient entièrement du cookie de session
// appareil (jamais d'un subject fourni par le client — Task 28, §11 de la
// spec) : un appareil ne lit, modifie, crée et supprime QUE ses propres
// notifications, la même frontière de confiance que toutes les routes
// acteurs.
//
// Task 28 : GET filtre par catégorie / non-lus, exclut expirées et
// archivées ; POST crée une notification d'origine appareil (action faite
// hors ligne, historisée à la reconnexion, dédupliquée par
// (subject, deduplication_key)) ; PATCH marque lu et/ou archive ; DELETE
// supprime.

const SEVERITIES = ['info', 'success', 'warning', 'error', 'reminder']
const PRIORITIES = ['low', 'normal', 'high', 'critical']

/** La migration Task 28 (20260917160000) ajoute les colonnes enrichies.
 * Tant qu'elle n'est pas appliquée sur la DB cible, les requêtes qui les
 * mentionnent échouent avec 42703 (undefined column) — on détecte ce cas
 * pour replier sur le comportement legacy au lieu d'un 500. */
function isMissingColumnError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  return e?.code === '42703' || /column .* does not exist/i.test(e?.message ?? '')
}

// MODE-1007 — POST : payload du client notifications (client.ts —
// historisation d'une notification d'origine appareil, rejeu verbatim au
// retour réseau). Chaque champ a DÉJÀ un garde/typeof avec repli défini ou
// un 400 à message spécifique du handler (« title et body requis », « titre
// ou corps trop long ») → tous les champs restent à la validation manuelle
// (z.unknown()) ; le schéma n'apporte que la garantie « corps = objet JSON »
// et documente la forme (deviceId, envoyé par le client, n'est pas consommé).
const deviceNotificationSchema = z.object({
  title: z.unknown().optional(),
  body: z.unknown().optional(),
  type: z.unknown().optional(),
  category: z.unknown().optional(),
  severity: z.unknown().optional(),
  priority: z.unknown().optional(),
  deduplicationKey: z.unknown().optional(),
  actionLabel: z.unknown().optional(),
  actionRoute: z.unknown().optional(),
  actionData: z.unknown().optional(),
  metadata: z.unknown().optional(),
  expiresAt: z.unknown().optional(),
  createdAt: z.unknown().optional(),
})

// MODE-1007 — PATCH : { all: true } ou { id, archive?, read? } — !all && !id
// → 400 « id ou all requis » (validation manuelle préservée) ; archive/read
// sont comparés à true/false (contrat booléen Task 28).
const notificationPatchSchema = z.object({
  all: z.boolean().optional(),
  id: z.string().optional(),
  archive: z.boolean().optional(),
  read: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const subject = await getDeviceSubject(request)
    if (!subject) {
      return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    // ?before=<ISO createdAt> page en arrière (cursor simple).
    const before = searchParams.get('before')
    // ?category=<catégorie> filtre le feed (le centre a des chips).
    const category = searchParams.get('category')
    // ?unread=1 renvoie seulement les non-lues.
    const unreadOnly = searchParams.get('unread') === '1'

    const supabase = createSupabaseAdminClient()

    // Les fabriques (et non des builders réutilisés) : un builder supabase
    // ne se clone pas — chaque tentative reconstruit sa propre requête.
    const enrichedQuery = () =>
      Promise.all([
        (() => {
          let q = supabase
            .from('legacy_notifications')
            .select('*')
            .eq('subject', subject)
            .is('archived_at', null)
            .or('expires_at.is.null,expires_at.gte.now()')
          if (before) q = q.lt('created_at', before)
          if (category) q = q.eq('category', category)
          if (unreadOnly) q = q.eq('read', false)
          return q.order('created_at', { ascending: false }).limit(50)
        })(),
        supabase
          .from('legacy_notifications')
          .select('*', { count: 'exact', head: true })
          .eq('subject', subject)
          .eq('read', false)
          .is('archived_at', null),
      ])
    const legacyQuery = () =>
      Promise.all([
        supabase
          .from('legacy_notifications')
          .select('*')
          .eq('subject', subject)
          .lt('created_at', before ?? '2999-12-31')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('legacy_notifications')
          .select('*', { count: 'exact', head: true })
          .eq('subject', subject)
          .eq('read', false),
      ])

    let [notificationsResult, unreadResult] = await enrichedQuery().catch(async (e) => {
      if (!isMissingColumnError(e)) throw e
      return legacyQuery()
    })

    if (notificationsResult.error) {
      if (isMissingColumnError(notificationsResult.error)) {
        ;[notificationsResult, unreadResult] = await legacyQuery()
      } else {
        throw notificationsResult.error
      }
    }
    if (unreadResult.error && !isMissingColumnError(unreadResult.error)) throw unreadResult.error

    return NextResponse.json({
      notifications: notificationsResult.data ?? [],
      unreadCount: unreadResult.count ?? 0,
    })
  } catch (error) {
    console.error('[API notifications GET]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}

// POST : création d'origine appareil. Le serveur décide de tout (subject
// dérivé du cookie, id généré) — le client ne contrôle que le contenu.
// Déduplication par (subject, deduplication_key) : un retry réseau ou une
// re-synchronisation n'entraîne pas de doublon ; une clé déjà connue
// répond 200 sans créer de ligne.
export async function POST(request: NextRequest) {
  try {
    const subject = await getDeviceSubject(request)
    if (!subject) {
      return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
    }

    const body = await request.json()
    const parsedNotif = deviceNotificationSchema.safeParse(body ?? {})
    if (!parsedNotif.success) {
      return NextResponse.json({ erreur: formatZodError(parsedNotif.error) }, { status: 400 })
    }
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const notifBody = typeof body?.body === 'string' ? body.body.trim() : ''
    if (!title || !notifBody) {
      return NextResponse.json({ erreur: 'title et body requis' }, { status: 400 })
    }
    if (title.length > 200 || notifBody.length > 1000) {
      return NextResponse.json({ erreur: 'titre ou corps trop long' }, { status: 400 })
    }

    const severity = SEVERITIES.includes(body?.severity) ? body.severity : 'info'
    const priority = PRIORITIES.includes(body?.priority) ? body.priority : 'normal'
    const category = typeof body?.category === 'string' ? body.category : 'systeme'

    const supabase = createSupabaseAdminClient()
    const payload: Record<string, unknown> = {
      subject,
      type: typeof body?.type === 'string' ? body.type.slice(0, 60) : 'device_event',
      title,
      body: notifBody,
      data: null,
      category,
      severity,
      priority,
      origin: 'device',
    }
    if (typeof body?.deduplicationKey === 'string' && body.deduplicationKey.length <= 200) {
      payload.deduplication_key = body.deduplicationKey
    }
    if (typeof body?.actionLabel === 'string') payload.action_label = body.actionLabel.slice(0, 60)
    if (typeof body?.actionRoute === 'string') payload.action_route = body.actionRoute.slice(0, 60)
    if (body?.actionData && typeof body.actionData === 'object') payload.action_data = body.actionData
    if (body?.metadata && typeof body.metadata === 'object') payload.metadata = body.metadata
    if (typeof body?.expiresAt === 'string') {
      const expiry = new Date(body.expiresAt)
      if (!Number.isNaN(expiry.getTime())) payload.expires_at = expiry.toISOString()
    }
    if (typeof body?.createdAt === 'string') {
      const created = new Date(body.createdAt)
      // L'horodatage d'origine (l'action a pu être faite hors ligne plus
      // tôt) est accepté s'il est plausible — sinon « maintenant ».
      if (!Number.isNaN(created.getTime()) && created.getTime() <= Date.now()) {
        payload.created_at = created.toISOString()
      }
    }

    let query = supabase.from('legacy_notifications').upsert(payload, {
      onConflict: payload.deduplication_key ? 'subject,deduplication_key' : undefined,
      ignoreDuplicates: Boolean(payload.deduplication_key),
    })
    if (payload.deduplication_key) query = query.select('id')
    let { data, error } = await query

    if (error && isMissingColumnError(error)) {
      // Schéma legacy (migration Task 28 non appliquée) : on insère avec
      // les colonnes d'origine, la dédup fine est assurée par le client.
      delete payload.category
      delete payload.severity
      delete payload.priority
      delete payload.deduplication_key
      delete payload.expires_at
      delete payload.action_label
      delete payload.action_route
      delete payload.action_data
      delete payload.metadata
      delete payload.origin
      delete payload.created_at
      const legacy = await supabase.from('legacy_notifications').insert(payload).select('id')
      data = legacy.data
      error = legacy.error
    }

    if (error) {
      console.error('[API notifications POST]', error)
      return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
    }

    const duplicated = Array.isArray(data) && data.length === 0
    return NextResponse.json({ ok: true, duplicated })
  } catch (error) {
    console.error('[API notifications POST]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}

// PATCH { id } marque une notification lue (read_at posé), { id, archive }
// archive/désarchive, { all: true } marque tout comme lu. updateMany pour
// qu'un id étranger matche zéro ligne sans révéler son existence.
export async function PATCH(request: NextRequest) {
  try {
    const subject = await getDeviceSubject(request)
    if (!subject) {
      return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
    }

    const body = await request.json()
    const parsedPatch = notificationPatchSchema.safeParse(body ?? {})
    if (!parsedPatch.success) {
      return NextResponse.json({ erreur: formatZodError(parsedPatch.error) }, { status: 400 })
    }
    const supabase = createSupabaseAdminClient()

    if (body.all) {
      const now = new Date().toISOString()
      let result = await supabase
        .from('legacy_notifications')
        .update({ read: true, read_at: now })
        .eq('subject', subject)
        .eq('read', false)
      if (result.error && isMissingColumnError(result.error)) {
        result = await supabase
          .from('legacy_notifications')
          .update({ read: true })
          .eq('subject', subject)
          .eq('read', false)
      }
      void result
    } else if (body.id) {
      const updates: Record<string, unknown> = {}
      if (body.archive === true) updates.archived_at = new Date().toISOString()
      if (body.archive === false) updates.archived_at = null
      if (body.read === true || body.archive === undefined) {
        updates.read = true
        updates.read_at = new Date().toISOString()
      }
      let result = await supabase
        .from('legacy_notifications')
        .update(updates)
        .eq('id', body.id)
        .eq('subject', subject)
      if (result.error && isMissingColumnError(result.error)) {
        delete updates.archived_at
        delete updates.read_at
        result = await supabase
          .from('legacy_notifications')
          .update(updates)
          .eq('id', body.id)
          .eq('subject', subject)
      }
      void result
    } else {
      return NextResponse.json({ erreur: 'id ou all requis' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[API notifications PATCH]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}

// DELETE ?id=<id> supprime une notification, ?onlyRead=true purge toutes
// les lues du subject. deleteMany pour ne rien révéler sur les ids
// étrangers.
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
