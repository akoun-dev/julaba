import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/backoffice-auth'

/** Returns the currently authenticated Backoffice user for this session cookie, or 401. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) {
    return NextResponse.json({ erreur: 'Aucune session active' }, { status: 401 })
  }
  return NextResponse.json(user)
}
