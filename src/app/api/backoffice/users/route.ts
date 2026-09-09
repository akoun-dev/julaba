import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, hashPassword, logAudit } from '@/lib/backoffice-auth'

const SAFE_COLUMNS = 'id, email, name, role, zone, is_active, last_login, force_password_change, created_at, updated_at'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'utilisateurs', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { data: users, error } = await supabase
      .from('bo_users')
      .select(SAFE_COLUMNS)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(users)
  } catch (error) {
    console.error('Erreur listage utilisateurs:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des utilisateurs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'utilisateurs', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { email, name, role, zone } = body

    if (!email || !name || !role) {
      return NextResponse.json({ erreur: 'L\'email, le nom et le role sont obligatoires' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const { data: existing } = await supabase
      .from('bo_users')
      .select('id')
      .eq('email', email)
      .single()

    if (existing) {
      return NextResponse.json({ erreur: 'Un utilisateur avec cet email existe deja' }, { status: 400 })
    }

    const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
    const { data: user, error } = await supabase
      .from('bo_users')
      .insert({
        email,
        password_hash: hashPassword(tempPassword),
        name,
        role,
        zone: zone || null,
        force_password_change: true,
      })
      .select(SAFE_COLUMNS)
      .single()

    if (error) throw error

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'user_create', module: 'utilisateurs', details: `Création de ${email} (${role})`, request,
    })

    return NextResponse.json({ ...user, tempPassword }, { status: 201 })
  } catch (error) {
    console.error('Erreur creation utilisateur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de l\'utilisateur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'utilisateurs', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { id, role, isActive, zone, name } = body

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const data: Record<string, unknown> = {}
    if (role) data.role = role
    if (isActive !== undefined) data.is_active = isActive
    if (zone !== undefined) data.zone = zone
    if (name) data.name = name

    const { data: user, error } = await supabase
      .from('bo_users')
      .update(data)
      .eq('id', id)
      .select(SAFE_COLUMNS)
      .single()

    if (error) throw error

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'user_update', module: 'utilisateurs', details: `Mise à jour de ${user.email}: ${JSON.stringify(data)}`, request,
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error('Erreur mise a jour utilisateur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de l\'utilisateur' }, { status: 500 })
  }
}
