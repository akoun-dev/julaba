import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  verifyPassword,
  needsRehash,
  hashPassword,
  createSession,
  sessionCookieOptions,
  SESSION_COOKIE,
  isLockedOut,
  registerFailedAttempt,
  resetFailedAttempts,
  logAudit,
} from '@/lib/backoffice-auth'
import {
  checkIpLock,
  ipGuardMessage,
  ipGuardRetryAfter,
  recordIpFailure,
  resetIpFailures,
} from '@/lib/auth-lookup-guard'
import { formatZodError } from '@/lib/validation/marchand'

// MODE-1007 — porte Zod du POST. Elle ne concerne QUE les deux champs du
// formulaire (pas de .strict()) et reste nullish : l'absence/null de
// email/password doit continuer de sortir en 401 « Identifiants invalides »
// PAR LA GARDE MANUELLE (testé — sans recordIpFailure). Placée juste après
// request.json() — donc APRÈS le verrou IP checkIpLock (F-01) qui ne lit
// pas le body — un body malformé (mauvais type) est refusé 400 SANS
// consommer de quota anti-brute-force ; les vraies tentatives (chaînes)
// suivent le flux historique intact (isLockedOut, registerFailedAttempt,
// recordIpFailure, reset — aucun déplacement).
const loginSchema = z.object({
  email: z.string().nullish(),
  password: z.string().nullish(),
})

export async function POST(request: NextRequest) {
  try {
    // AUDIT-005 F-01 : le compteur IP vit DANS LA BASE (auth_lockouts, RPC
    // atomiques) et non plus dans une Map du process — effectif quelle que
    // soit l'instance et survivant aux redéploiements. Fail-open contractuel.
    const ipLock = await checkIpLock(request)
    if (ipLock.locked) {
      return NextResponse.json(
        { erreur: ipGuardMessage(ipLock.retryAfterSeconds) },
        { status: 429, headers: ipGuardRetryAfter(ipLock) }
      )
    }

    const body = await request.json()
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ erreur: 'Identifiants invalides' }, { status: 401 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: user } = await supabase.from('bo_users').select('*').eq('email', email).single()

    // Generic error for unknown email / wrong password / inactive account so
    // a caller cannot use this endpoint to enumerate valid emails.
    const genericError = () => NextResponse.json({ erreur: 'Identifiants invalides' }, { status: 401 })

    if (!user || !user.is_active) {
      // Échec compté au niveau IP (compteur partagé, RPC atomique) —
      // sans compter l'échec par compte (compte inconnu).
      await recordIpFailure(request)
      return genericError()
    }

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
      // MODE-964 (A5-F19) : compteur par compte incrémenté ATOMIQUEMENT en
      // base (RPC record_backoffice_auth_failure) — le compteur lu plus haut
      // n'est plus passé : sous concurrence, la base est la seule vérité.
      // AUDIT-012 P1-10 : contrat FAIL-CLOSED — si l'enregistrement de
      // l'échec échoue, la protection par compte est hors service : on
      // refuse la tentative (503) au lieu de répondre 401 (fenêtre de force
      // brute). Aucun impact UX pour les mots de passe CORRECTS (ce chemin
      // n'est jamais atteint quand le mot de passe est bon).
      const failureRecorded = await registerFailedAttempt(user.id)
      if (!failureRecorded) {
        return NextResponse.json(
          { erreur: 'Service d\'authentification temporairement indisponible. Réessayez.' },
          { status: 503 }
        )
      }
      await recordIpFailure(request)
      await logAudit({
        userId: user.id, userName: user.name, userEmail: user.email,
        action: 'login_failed', module: 'auth', request,
      })
      return genericError()
    }

    await resetFailedAttempts(user.id)
    await resetIpFailures(request)

    // Transparently upgrade legacy plaintext-stored passwords now that we
    // know the plaintext was correct.
    if (needsRehash(user.password_hash)) {
      await supabase.from('bo_users').update({ password_hash: hashPassword(password) }).eq('id', user.id)
    }

    // MODE-961 : la vérification MFA est retirée — le second facteur TOTP
    // (challenge/verify) reposait sur la migration 20260921110000_mfa_totp,
    // jamais appliquée sur la base de production, et faisait échouer CHAQUE
    // connexion en 500 (colonne totp_enrolled inconnue). La connexion est de
    // nouveau : mot de passe scrypt + verrous anti-force-brute + session.
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
      // MODE-941 (AUDIT-003 S-10) : un compte encore sous mot de passe
      // temporaire doit le changer avant d'entrer dans le back-office.
      forcePasswordChange: !!updated!.force_password_change,
    })
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
    return response
  } catch (error) {
    console.error('Erreur login:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la connexion' }, { status: 500 })
  }
}
