import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

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

    const jobs = data ?? []
    const mapped = jobs.map(j => {
      const durMs = j.duration_ms ?? 0
      const durMin = Math.floor(durMs / 60000)
      const durSec = Math.round((durMs % 60000) / 1000)
      const lastDuration = durMs === 0 ? '-' : durMin > 0 ? `${durMin}m ${durSec}s` : `${durSec}s`
      return {
        id: j.id,
        name: j.name,
        description: j.name,
        schedule: j.schedule,
        cronExpression: j.schedule,
        lastRun: j.last_run_at ?? '',
        lastDuration,
        nextRun: j.next_run_at ?? '',
        status: j.status,
        lastResult: j.status === 'error' ? 'error' as const : 'success' as const,
        totalRunsToday: j.run_count,
      }
    })
    return NextResponse.json(mapped)
  } catch (error) {
    console.error('Erreur listage taches planifiees:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des taches planifiees' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'cron', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json({ erreur: "L'identifiant et le statut sont obligatoires" }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('legacy_bo_cron_jobs')
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Erreur mise a jour tache:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de la tache' }, { status: 500 })
  }
}
