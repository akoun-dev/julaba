import { NextRequest, NextResponse } from 'next/server'
import { revokeSession, getSessionUser, clearedSessionCookieOptions, SESSION_COOKIE, logAudit } from '@/lib/backoffice-auth'

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request)
  await revokeSession(request)
  if (user) {
    await logAudit({
      userId: user.id, userName: user.name, userEmail: user.email,
      action: 'logout', module: 'auth', request,
    })
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', clearedSessionCookieOptions())
  return response
}
