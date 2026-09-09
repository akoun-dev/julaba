import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const inputSchema = z.object({
  bucket: z.enum(['actor-photos', 'harvest-photos', 'voice-exports']),
  organizationId: z.string().uuid(),
  fileName: z.string().regex(/^[a-zA-Z0-9._-]{1,120}$/),
})

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return NextResponse.json({ error: 'Authentification requise' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400 }) }
  const parsed = inputSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Paramètres de fichier invalides' }, { status: 422 })

  const path = `${parsed.data.organizationId}/${authData.user.id}/${crypto.randomUUID()}-${parsed.data.fileName}`
  const { data, error } = await supabase.storage.from(parsed.data.bucket).createSignedUploadUrl(path)
  if (error) return NextResponse.json({ error: 'URL de dépôt indisponible' }, { status: 500 })
  return NextResponse.json({ path, token: data.token })
}
