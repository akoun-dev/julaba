import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'cron', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const jobs = await db.boCronJob.findMany({
      orderBy: { name: 'asc' },
    })
    const mapped = jobs.map(j => {
      const durMs = j.durationMs ?? 0
      const durMin = Math.floor(durMs / 60000)
      const durSec = Math.round((durMs % 60000) / 1000)
      const lastDuration = durMs === 0 ? '-' : durMin > 0 ? `${durMin}m ${durSec}s` : `${durSec}s`
      return {
        id: j.id,
        name: j.name,
        description: j.name,
        schedule: j.schedule,
        cronExpression: j.schedule,
        lastRun: j.lastRunAt?.toISOString() ?? '',
        lastDuration,
        nextRun: j.nextRunAt?.toISOString() ?? '',
        status: j.status,
        lastResult: j.status === 'error' ? 'error' as const : 'success' as const,
        totalRunsToday: j.runCount,
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

    const job = await db.boCronJob.update({
      where: { id },
      data: { status },
    })
    return NextResponse.json(job)
  } catch (error) {
    console.error('Erreur mise a jour tache:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de la tache' }, { status: 500 })
  }
}
