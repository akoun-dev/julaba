import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// A11-F07 (AUDIT-011) : `next` est un chemin INTERNE. `startsWith('/')`
// laissait passer `//evil.com` (URL protocol-relative : new URL('//evil.com',
// origin) → https://evil.com/) et les antislashs (`/\evil.com` normalisé
// en `//` selon les clients) — open redirect vers un hôte tiers (hameçonnage
// post-login avec un code de session consommé chez lui). On n'accepte donc
// qu'un chemin relatif-racine SANS double slash initial NI antislash.
function isSafeNextPath(next: string): boolean {
  return next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') || '/'
  if (!code || !isSafeNextPath(next)) return NextResponse.redirect(new URL('/', url.origin))

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL('/?auth=error', url.origin))
  return NextResponse.redirect(new URL(next, url.origin))
}
