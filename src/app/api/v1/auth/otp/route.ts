import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const otpSchema = z.object({
  channel: z.enum(['sms', 'email']),
  value: z.string().trim().min(3).max(254),
})

export async function POST(request: Request) {
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

  if (error) return NextResponse.json({ error: 'Impossible d envoyer le code' }, { status: 429 })
  return NextResponse.json({ ok: true })
}
