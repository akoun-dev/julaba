import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'
import { issueLiaisonCode } from '@/lib/device-session'
import { LIAISON_TTL_BACKOFFICE_MS } from '@/lib/liaison-code'

// MODE-937 (AUDIT-003 S-04) — création/régénération d'un code de liaison
// one-shot pour un identificateur (30 jours). L'agent n'a AUCUN credential
// serveur (PIN local uniquement) : ce code est le seul moyen, pour un
// appareil neuf, de prouver la possession du compte et de se lier
// (/api/session/claim { code }). Régénérer n'invalide pas un code précédent
// non consommé (il reste one-shot et borné par son TTL) — le code
// fraîchement émis est celui communiqué à l'agent.
export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'identificateurs', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const identificateurId = typeof body?.identificateurId === 'string' ? body.identificateurId.trim() : ''
    if (!identificateurId) {
      return NextResponse.json({ erreur: 'identificateurId requis' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: agent } = await supabase
      .from('legacy_bo_identificateurs')
      .select('id, name, is_active')
      .eq('id', identificateurId)
      .single()
    if (!agent) {
      return NextResponse.json({ erreur: 'Identificateur introuvable' }, { status: 404 })
    }
    if (agent.is_active === false) {
      return NextResponse.json({ erreur: 'Identificateur désactivé — réactivez le compte avant d\u2019émettre un code' }, { status: 409 })
    }

    const { code, expiresAt } = await issueLiaisonCode('identificateur', agent.id, LIAISON_TTL_BACKOFFICE_MS, 'backoffice')

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'liaison_code_issue', module: 'identificateurs', details: `Code de liaison émis pour ${agent.name}`, request,
    })

    return NextResponse.json({ codeLiaison: code, expiresAt: expiresAt.toISOString() })
  } catch (error) {
    console.error('[API backoffice/identificateurs/liaison]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
