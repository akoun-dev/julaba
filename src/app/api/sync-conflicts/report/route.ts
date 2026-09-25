import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getDeviceSubject } from '@/lib/device-session'
import { createNotificationForSubject } from '@/lib/notifications/server'
import { formatZodError } from '@/lib/validation/marchand'

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
  'supplier-order': 'une commande fournisseur',
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
// MODE-1007 — POST : payload de offline-db.recordSyncConflict (miroir
// serveur d'un conflit de synchro). entity/message/clientCreatedAt sont
// requis par truthiness → 400 « Champs requis manquants » (validation
// manuelle préservée → .optional()) ; payload est le JSON de la file rejoué
// verbatim (forme libre par construction) et operationId peut être absent
// (payloadString → undefined) → z.unknown()/z.string().optional().
const syncConflictReportSchema = z.object({
  entity: z.string().optional(),
  payload: z.unknown().optional(),
  operationId: z.string().optional(),
  message: z.string().optional(),
  clientCreatedAt: z.number().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const subject = await getDeviceSubject(request)
    if (!subject) {
      return NextResponse.json({ error: 'Session appareil requise' }, { status: 401 })
    }

    const body = await request.json()
    const parsedReport = syncConflictReportSchema.safeParse(body)
    if (!parsedReport.success) {
      return NextResponse.json({ erreur: formatZodError(parsedReport.error) }, { status: 400 })
    }
    const { entity, payload, operationId, message, clientCreatedAt } = body as {
      entity?: string
      payload?: unknown
      operationId?: string
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
      operation_id: operationId ?? null,
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
