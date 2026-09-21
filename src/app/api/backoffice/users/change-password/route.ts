import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/backoffice-auth/session'
import { verifyPassword, hashPassword } from '@/lib/backoffice-auth'
import { logAudit } from '@/lib/backoffice-auth'

// MODE-941 (AUDIT-003 S-10) — changement de mot de passe back-office.
//
// Fin de l'impasse : `force_password_change` était posé à la création
// d'un compte (users POST) mais vérifié NULLE PART, et aucun endpoint ne
// permettait de changer un mot de passe BO. Ici :
//   • session BO vivante requise (cookie httpOnly — le compte est passé
//     par le login + MFA complets) ;
//   • le mot de passe ACTUEL est exigé (preuve de possession, y compris
//     depuis l'interception post-login) ;
//   • politique : 8 caractères minimum, différent de l'actuel ;
//   • `force_password_change` est effacé au succès ;
//   • l'opération est auditée (password_change / password_change_failed).

const MOT_DE_PASSE_MIN = 8

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) {
    return NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { erreur: 'Le mot de passe actuel et le nouveau sont obligatoires' },
        { status: 400 },
      )
    }
    if (newPassword.length < MOT_DE_PASSE_MIN) {
      return NextResponse.json(
        { erreur: `Le nouveau mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères` },
        { status: 400 },
      )
    }
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { erreur: 'Le nouveau mot de passe doit être différent de l’actuel' },
        { status: 400 },
      )
    }

    const supabase = createSupabaseAdminClient()
    const { data: compte } = await supabase
      .from('bo_users')
      .select('id, password_hash, is_active')
      .eq('id', user.id)
      .single()

    if (!compte || !(compte as { is_active: boolean }).is_active) {
      return NextResponse.json({ erreur: 'Compte introuvable ou désactivé' }, { status: 401 })
    }

    const hashActuel = (compte as { password_hash: string }).password_hash
    if (!verifyPassword(currentPassword, hashActuel)) {
      await logAudit({
        userId: user.id, userName: user.name, userEmail: user.email,
        action: 'password_change_failed', module: 'auth', request,
      })
      return NextResponse.json({ erreur: 'Mot de passe actuel incorrect' }, { status: 401 })
    }

    const { error } = await supabase
      .from('bo_users')
      .update({
        password_hash: hashPassword(newPassword),
        force_password_change: false,
      })
      .eq('id', user.id)
    if (error) throw error

    await logAudit({
      userId: user.id, userName: user.name, userEmail: user.email,
      action: 'password_change', module: 'auth', request,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Erreur changement de mot de passe:', error)
    return NextResponse.json({ erreur: 'Erreur lors du changement de mot de passe' }, { status: 500 })
  }
}
