import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'
import { formatZodError } from '@/lib/validation/marchand'

// MODE-1007 — portes Zod POST/PATCH. name/cronExpression (POST) et le
// couple id/statut|action (PATCH) ont déjà leurs 400 manuels (« Le nom et
// l'expression cron sont obligatoires », « L'identifiant et un statut ou
// une action sont obligatoires ») → nullish pour que CES messages
// continuent de sortir (null compris) ; action n'est que comparée à 'run'
// sans autre garde → z.unknown().
const createCronJobSchema = z.object({
  name: z.string().nullish(),
  cronExpression: z.string().nullish(),
  description: z.string().nullish(),
})

const updateCronJobSchema = z.object({
  id: z.string().nullish(),
  status: z.string().nullish(),
  action: z.unknown().optional(),
})

// legacy_bo_cron_jobs stores status in French ('actif'/'pause'/'erreur' — see
// supabase/seed.sql), but the backoffice screen's CronStatus type is English
// ('active'/'paused'/'error'). Translate at the boundary so both sides can
// keep their own vocabulary.
const STATUS_DB_TO_UI: Record<string, string> = { actif: 'active', pause: 'paused', erreur: 'error' }
const STATUS_UI_TO_DB: Record<string, string> = { active: 'actif', paused: 'pause', error: 'erreur' }

function mapJob(j: Record<string, unknown>) {
  const durMs = (j.duration_ms as number) ?? 0
  const durMin = Math.floor(durMs / 60000)
  const durSec = Math.round((durMs % 60000) / 1000)
  const lastDuration = durMs === 0 ? '-' : durMin > 0 ? `${durMin}m ${durSec}s` : `${durSec}s`
  const status = STATUS_DB_TO_UI[j.status as string] || (j.status as string)
  return {
    id: j.id,
    name: j.name,
    description: j.name,
    schedule: j.schedule,
    cronExpression: j.schedule,
    lastRun: j.last_run_at ?? '',
    lastDuration,
    nextRun: j.next_run_at ?? '',
    status,
    lastResult: status === 'error' ? 'error' as const : 'success' as const,
    totalRunsToday: j.run_count,
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'cron', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('legacy_bo_cron_jobs')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    return NextResponse.json((data ?? []).map(mapJob))
  } catch (error) {
    console.error('Erreur listage taches planifiees:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des taches planifiees' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'cron', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const parsed = createCronJobSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { name, cronExpression, description } = body

    if (!name || !cronExpression) {
      return NextResponse.json({ erreur: 'Le nom et l\'expression cron sont obligatoires' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('legacy_bo_cron_jobs')
      .insert({
        name,
        schedule: cronExpression,
        command: description || null,
        status: 'actif',
        run_count: 0,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(mapJob(data), { status: 201 })
  } catch (error) {
    console.error('Erreur creation tache planifiee:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la tache' }, { status: 500 })
  }
}

// No real scheduler executes these jobs (nothing in this app dequeues
// legacy_bo_cron_jobs and runs `command`) — "Exécuter maintenant" simulates a
// run with a randomized duration, same as it always displayed, except the
// result is now computed once, server-side, and actually persisted.
export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'cron', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const parsed = updateCronJobSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { id, status, action } = body

    if (!id || (!status && !action)) {
      return NextResponse.json({ erreur: "L'identifiant et un statut ou une action sont obligatoires" }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (status) data.status = STATUS_UI_TO_DB[status] || status
    if (action === 'run') {
      const durationMs = Math.round((0.3 + Math.random() * 3) * 1000)
      data.last_run_at = new Date().toISOString()
      data.duration_ms = durationMs
      data.next_run_at = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    }

    const supabase = createSupabaseAdminClient()

    let updated
    if (action === 'run') {
      const { data: current, error: fetchError } = await supabase
        .from('legacy_bo_cron_jobs')
        .select('run_count')
        .eq('id', id)
        .single()
      if (fetchError) throw fetchError
      data.run_count = ((current?.run_count as number) || 0) + 1
    }

    const { data: result, error } = await supabase
      .from('legacy_bo_cron_jobs')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    updated = result

    return NextResponse.json(mapJob(updated))
  } catch (error) {
    console.error('Erreur mise a jour tache:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de la tache' }, { status: 500 })
  }
}
