// Signal Realtime côté serveur (Task 28) — quand le serveur crée une
// notification, il émet un broadcast {id} sur le canal
// `julaba-notif:<subject>` pour que l'appareil ouvert re-fetch son feed en
// moins d'une seconde (le polling 45 s reste le filet).
//
// ⚠ Limite de sécurité assumée et documentée : le subject (« merchant:xx »)
// est prévisible, donc n'importe qui peut S'ABONNER au canal — c'est
// pourquoi le payload ne transporte AUCUN contenu (juste un id opaque).
// Le contenu réel passe exclusivement par GET /api/notifications, protégé
// par le cookie de session appareil. Un faux signal déclenche au pire un
// fetch inutile (le client déduplique par knownIds).
//
// Best-effort total : un échec WebSocket n'est jamais propagé — le polling
// rattrapera. Les canaux sont mis en cache par subject pour éviter un
// handshake par notification.

import type { RealtimeChannel } from '@supabase/supabase-js'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

const NOTIF_CHANNEL_PREFIX = 'julaba-notif:'

const channels = new Map<string, Promise<RealtimeChannel | null>>()

async function getChannel(subject: string): Promise<RealtimeChannel | null> {
  let promise = channels.get(subject)
  if (!promise) {
    promise = (async () => {
      try {
        const supabase = createSupabaseAdminClient()
        const channel = supabase.channel(`${NOTIF_CHANNEL_PREFIX}${subject}`)
        const status = await new Promise<'SUBSCRIBED' | 'TIMED_OUT' | 'CHANNEL_ERROR' | 'CLOSED'>((resolve) => {
          const timer = setTimeout(() => resolve('TIMED_OUT'), 3000)
          // MODE-1006 (noImplicitAny) — le client admin est volontairement
          // non typé (DET-008) : le callback est annoté avec l'union des
          // états attendus (valeurs de REALTIME_SUBSCRIBE_STATES).
          channel.subscribe((state: 'SUBSCRIBED' | 'TIMED_OUT' | 'CHANNEL_ERROR' | 'CLOSED') => {
            if (state === 'SUBSCRIBED' || state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
              clearTimeout(timer)
              resolve(state)
            }
          })
        })
        return status === 'SUBSCRIBED' ? channel : null
      } catch {
        return null
      }
    })()
    channels.set(subject, promise)
  }
  return promise
}

/** Émet le signal « une notification est arrivée » — jamais de throw. */
export async function sendNotificationSignal(subject: string): Promise<void> {
  try {
    const channel = await getChannel(subject)
    if (!channel) return
    await channel.send({
      type: 'broadcast',
      event: 'new',
      payload: { t: Date.now() },
    })
  } catch {
    // Best-effort : le polling 45 s et le catch-up visibility/reseau
    // rattrapent toujours.
  }
}
