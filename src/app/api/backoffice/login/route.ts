import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  verifyPassword,
  needsRehash,
  hashPassword,
  createMfaChallenge,
  createSession,
  sessionCookieOptions,
  SESSION_COOKIE,
  isLockedOut,
  registerFailedAttempt,
  resetFailedAttempts,
  isIpRateLimited,
  logAudit,
} from '@/lib/backoffice-auth'
import { isMfaBypassAllowed } from '@/lib/backoffice-auth/environment'

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (isIpRateLimited(ip)) {
      return NextResponse.json({ erreur: 'Trop de tentatives. Réessayez plus tard.' }, { status: 429 })
    }

    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ erreur: 'Identifiants invalides' }, { status: 401 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: user } = await supabase.from('bo_users').select('*').eq('email', email).single()

    // Generic error for unknown email / wrong password / inactive account so
    // a caller cannot use this endpoint to enumerate valid emails.
    const genericError = () => NextResponse.json({ erreur: 'Identifiants invalides' }, { status: 401 })

    if (!user || !user.is_active) return genericError()

    if (isLockedOut(user)) {
      await logAudit({
        userId: user.id, userName: user.name, userEmail: user.email,
        action: 'login_locked', module: 'auth', request,
      })
      return NextResponse.json(
        { erreur: 'Compte temporairement verrouillé suite à plusieurs échecs. Réessayez plus tard.' },
        { status: 423 }
      )
    }

    if (!verifyPassword(password, user.password_hash)) {
      await registerFailedAttempt(user.id, user.failed_login_attempts)
      await logAudit({
        userId: user.id, userName: user.name, userEmail: user.email,
        action: 'login_failed', module: 'auth', request,
      })
      return genericError()
    }

    await resetFailedAttempts(user.id)

    // Transparently upgrade legacy plaintext-stored passwords now that we
    // know the plaintext was correct.
    if (needsRehash(user.password_hash)) {
      await supabase.from('bo_users').update({ password_hash: hashPassword(password) }).eq('id', user.id)
    }

    // Contournement réservé au développement : il est ignoré en production,
    // même si une variable de déploiement est configurée par erreur.
    if (isMfaBypassAllowed()) {
      const { data: updated } = await supabase
        .from('bo_users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', user.id)
        .select()
        .single()

      const { token, expiresAt } = await createSession(user.id, request)

      await logAudit({
        userId: user.id, userName: user.name, userEmail: user.email,
        action: 'login_success', module: 'auth', request,
      })

      const response = NextResponse.json({
        id: updated!.id,
        email: updated!.email,
        name: updated!.name,
        role: updated!.role,
        zone: updated!.zone,
        isActive: updated!.is_active,
        lastLogin: updated!.last_login,
        createdAt: updated!.created_at,
        mfaDisabled: true,
        // MODE-941 (AUDIT-003 S-10) : le contournement MFA ne contourne pas
        // le changement de mot de passe obligatoire — le client doit
        // intercepter un compte encore sous mot de passe temporaire.
        forcePasswordChange: !!updated!.force_password_change,
      })
      response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
      return response
    }

    // MODE-934 (AUDIT-003 S-02) : MFA par TOTP. En enrôlement, la réponse
    // porte le secret + l'URI otpauth + les codes de récupération (texte
    // clair, affichés une seule fois) — aucun code n'est plus « envoyé » :
    // il vit dans l'application d'authentification de l'utilisateur.
    const mfa = await createMfaChallenge(user.id, user.email)

    await logAudit({
      userId: user.id, userName: user.name, userEmail: user.email,
      action: 'login_password_ok', module: 'auth', request,
    })

    return NextResponse.json({
      challengeId: mfa.challengeId,
      expiresAt: mfa.expiresAt,
      email: user.email,
      mfaMode: mfa.mfaMode,
      secret: mfa.secret ?? null,
      otpauthUri: mfa.otpauthUri ?? null,
      recoveryCodes: mfa.recoveryCodes ?? null,
    })
  } catch (error) {
    console.error('Erreur login:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la connexion' }, { status: 500 })
  }
}
