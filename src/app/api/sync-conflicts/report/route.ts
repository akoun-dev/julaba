import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getDeviceSubject } from '@/lib/device-session'
import { createNotificationForSubject } from '@/lib/notifications'

// Keep in sync with every queuePendingSync(...) call site across the app
// (marchand, producteur, identificateur) — a label missing here just falls
// back to "Une donnée", so this isn't load-bearing, but an accurate label
// makes the notification's body actually useful to the reader.
const ENTITY_LABEL: Record<string, string> = {
  sale: 'une vente',
  expense: 'une dépense',
  product: 'un produit',
  'product-update': 'une mise à jour de produit',
  merchant: 'votre inscription',
  enrolment: 'un dossier',
  'tontine-contribution': 'une cotisation de tontine',
  'recolte-create': 'une récolte',
  'recolte-update': 'une mise à jour de récolte',
  'commande-update': 'une mise à jour de commande',
  journal: 'une entrée de journal',
  'device-claim': 'la connexion de votre appareil',
}

// Server-side mirror of a device's local sync_conflicts table
// (src/lib/offline-db.ts): a mutation the server definitively rejected and
// that will never succeed on retry. Previously these only ever existed on
// the originating device — invisible to any admin. recordSyncConflict()
// best-effort POSTs each one here so the backoffice can see them too.
// Identity comes from the device-session cookie (never a client-supplied
// id), so a report can't be forged as coming from another account.
export async function POST(request: NextRequest) {
  try {
    const subject = await getDeviceSubject(request)
    if (!subject) {
      return NextResponse.json({ error: 'Session appareil requise' }, { status: 401 })
    }

    const body = await request.json()
    const { entity, payload, message, clientCreatedAt } = body as {
      entity?: string
      payload?: unknown
      message?: string
      clientCreatedAt?: number
    }

    if (!entity || !message || !clientCreatedAt) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    await supabase.from('legacy_sync_conflict_reports').insert({
      subject,
      entity,
      payload: JSON.stringify(payload ?? null),
      message,
      client_created_at: new Date(clientCreatedAt).toISOString(),
    })

    await createNotificationForSubject({
      subject,
      type: 'sync_conflict',
      title: 'Une action n\'a pas pu être synchronisée',
      body: `${ENTITY_LABEL[entity] ?? 'Une donnée'} enregistrée hors-ligne n'a pas pu être envoyée au serveur : ${message}`,
      data: { entity },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[API sync-conflicts/report]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
