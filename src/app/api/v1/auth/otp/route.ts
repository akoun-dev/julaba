import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  checkIpLock,
  ipGuardMessage,
  ipGuardRetryAfter,
  recordIpFailure,
} from '@/lib/auth-lookup-guard'

const otpSchema = z.object({
  channel: z.enum(['sms', 'email']),
  value: z.string().trim().min(3).max(254),
})

export async function POST(request: Request) {
  // A11-F06 (AUDIT-011) : envoi OTP pré-auth avec shouldCreateUser — sans
  // borne, cette route pompe des SMS (coût réel) et crée des identités
  // Supabase en masse. La garde IP partagée sert ici de QUOTA d'envoi :
  // verrou à l'entrée puis chaque tentative d'envoi consomme le quota
  // (20/5 min/IP → verrou 15 min, fail-open si la base de verrous est
  // injoignable — contrat auth-lookup-guard).
  const ipLock = await checkIpLock(request)
  if (ipLock.locked) {
    return NextResponse.json(
      { error: ipGuardMessage(ipLock.retryAfterSeconds) },
      { status: 429, headers: ipGuardRetryAfter(ipLock) }
    )
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }
  const parsed = otpSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Canal ou identifiant invalide' }, { status: 422 })

  const supabase = await createSupabaseServerClient()
  const options = parsed.data.channel === 'sms'
    ? { phone: parsed.data.value }
    : { email: parsed.data.value }
  const { error } = await supabase.auth.signInWithOtp({
    ...options,
    options: { shouldCreateUser: true },
  })

  // A11-F06 : la tentative d'envoi consomme le quota, succès OU échec
  // (répéter un envoi en échec est du pompage autant qu'un succès).
  await recordIpFailure(request)
  if (error) return NextResponse.json({ error: 'Impossible d envoyer le code' }, { status: 429 })
  return NextResponse.json({ ok: true })
}
