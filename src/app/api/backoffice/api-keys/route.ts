import { NextRequest, NextResponse } from 'next/server'
import { randomBytes, createHash } from 'crypto'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'

const SAFE_COLUMNS = 'id, name, description, key, permissions, request_count, last_used_at, expires_at, is_active, created_by, created_at, updated_at'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'api-keys', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { data: keys, error } = await supabase
      .from('legacy_bo_api_keys')
      .select(SAFE_COLUMNS)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(keys)
  } catch (error) {
    console.error('Erreur listage cles API:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des cles API' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'api-keys', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { name, description, permissions, expiresInDays } = body

    if (!name) {
      return NextResponse.json({ erreur: 'Le nom est obligatoire' }, { status: 400 })
    }

    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    const key = `jlb_${slug}_${randomBytes(9).toString('base64url')}`
    const secret = `sec_${randomBytes(32).toString('base64url')}`
    const secretHash = createHash('sha256').update(secret).digest('hex')

    const supabase = createSupabaseAdminClient()
    const { data: apiKey, error } = await supabase
      .from('legacy_bo_api_keys')
      .insert({
        name,
        description: description || null,
        key,
        secret_hash: secretHash,
        permissions: permissions || 'read',
        expires_at: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null,
        created_by: auth.user.name,
      })
      .select(SAFE_COLUMNS)
      .single()

    if (error) throw error

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'api_key_create', module: 'api-keys', details: name, request,
    })

    return NextResponse.json({ ...apiKey, secret }, { status: 201 })
  } catch (error) {
    console.error('Erreur creation cle API:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la cle API' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'api-keys', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { id, isActive } = body

    if (!id || isActive === undefined) {
      return NextResponse.json({ erreur: 'L\'identifiant et le statut sont obligatoires' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: apiKey, error } = await supabase
      .from('legacy_bo_api_keys')
      .update({ is_active: isActive })
      .eq('id', id)
      .select(SAFE_COLUMNS)
      .single()

    if (error) throw error

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: isActive ? 'api_key_enable' : 'api_key_disable', module: 'api-keys', details: apiKey.name, request,
    })

    return NextResponse.json(apiKey)
  } catch (error) {
    console.error('Erreur mise a jour cle API:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de la cle API' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'api-keys', 'delete')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const { data: deleted, error: fetchError } = await supabase
      .from('legacy_bo_api_keys')
      .select('name')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    const { error } = await supabase
      .from('legacy_bo_api_keys')
      .delete()
      .eq('id', id)

    if (error) throw error

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'api_key_delete', module: 'api-keys', details: deleted.name, request,
    })

    return NextResponse.json({ succes: 'Cle API revoquee' })
  } catch (error) {
    console.error('Erreur suppression cle API:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la revocation de la cle API' }, { status: 500 })
  }
}
