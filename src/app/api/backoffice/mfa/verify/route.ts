import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { verifyMfaChallenge, createSession, sessionCookieOptions, SESSION_COOKIE, isIpRateLimited, logAudit } from '@/lib/backoffice-auth'

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (isIpRateLimited(ip)) {
      return NextResponse.json({ erreur: 'Trop de tentatives. Réessayez plus tard.' }, { status: 429 })
    }

    const { challengeId, code } = await request.json()
    if (!challengeId || !code) {
      return NextResponse.json({ erreur: 'Code de vérification requis' }, { status: 400 })
    }

    const result = await verifyMfaChallenge(challengeId, String(code))
    if (!result.ok) {
      const messages: Record<string, string> = {
        expired: 'Code expiré, veuillez vous reconnecter.',
        locked: 'Trop de tentatives, veuillez vous reconnecter.',
        invalid: 'Code de vérification incorrect.',
      }
      return NextResponse.json({ erreur: messages[result.reason] }, { status: 401 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: user } = await supabase.from('bo_users').select('*').eq('id', result.userId).single()
    if (!user || !user.is_active) {
      return NextResponse.json({ erreur: 'Compte introuvable ou désactivé' }, { status: 401 })
    }

    const { data: updated } = await supabase.from('bo_users').update({ last_login: new Date().toISOString() }).eq('id', user.id).select().single()
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
    })
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
    return response
  } catch (error) {
    console.error('Erreur vérification MFA:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la vérification' }, { status: 500 })
  }
}
