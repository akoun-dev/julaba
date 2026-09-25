import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'
import { formatZodError } from '@/lib/validation/marchand'

// MODE-1007 — porte Zod du PATCH. id a déjà son 400 manuel (« L'identifiant
// est obligatoire ») → nullish pour que CE message continue de sortir (null
// compris) ; acknowledged est écrit tel quel dans la colonne boolean
// (absent = acquittement simple) → z.boolean().optional().
const updateAlertSchema = z.object({
  id: z.string().nullish(),
  acknowledged: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'dashboard', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const unacknowledgedOnly = searchParams.get('unacknowledged') === 'true'

    const supabase = createSupabaseAdminClient()
    let query = supabase.from('legacy_bo_alerts').select('*').order('created_at', { ascending: false })

    if (unacknowledgedOnly) {
      query = query.eq('acknowledged', false)
    }

    const { data: alerts, error } = await query
    if (error) throw error

    return NextResponse.json(alerts)
  } catch (error) {
    console.error('Erreur listage alertes:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des alertes' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  // MODE-941 (AUDIT-003 S-09) — la garde est réalignée : le bouton
  // « Acquitter » est visible depuis la supervision/alertes par
  // admin_general et operateur_terrain, mais l'ancienne garde
  // supervision:update leur renvoyait un 403 garanti (admin_general n'a
  // même pas l'accès au module supervision ; operateur_terrain n'a
  // l'écriture que sur acteurs/enrolement). L'acquittement est une
  // action du module alertes — 'alertes' est ajouté aux modules à
  // écriture terrain (FIELD_WRITABLE_MODULES).
  const auth = await requireBackofficePermission(request, 'alertes', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const parsed = updateAlertSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { id, acknowledged } = body

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: alert, error } = await supabase
      .from('legacy_bo_alerts')
      .update({ acknowledged: acknowledged !== undefined ? acknowledged : true })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'alert_acknowledge', module: 'alertes', details: alert.title, request,
    })

    return NextResponse.json(alert)
  } catch (error) {
    console.error('Erreur mise a jour alerte:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de l\'alerte' }, { status: 500 })
  }
}
