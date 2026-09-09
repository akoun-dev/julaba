import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'institutions', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('legacy_bo_institutions')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Erreur listage institutions:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des institutions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'institutions', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const body = await request.json()
    const { name, type, contactName, contactEmail, contactPhone, address } = body

    if (!name || !type) {
      return NextResponse.json({ erreur: 'Le nom et le type sont obligatoires' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('legacy_bo_institutions')
      .insert({
        name,
        type,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        address,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Erreur creation institution:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de l\'institution' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'institutions', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const body = await request.json()
    const { id, ...rawData } = body

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (rawData.name !== undefined) data.name = rawData.name
    if (rawData.type !== undefined) data.type = rawData.type
    if (rawData.contactName !== undefined) data.contact_name = rawData.contactName
    if (rawData.contactEmail !== undefined) data.contact_email = rawData.contactEmail
    if (rawData.contactPhone !== undefined) data.contact_phone = rawData.contactPhone
    if (rawData.address !== undefined) data.address = rawData.address

    const { data: updated, error } = await supabase
      .from('legacy_bo_institutions')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Erreur mise a jour institution:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de l\'institution' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'institutions', 'delete')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    const { error } = await supabase
      .from('legacy_bo_institutions')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ succes: 'Institution supprimee' })
  } catch (error) {
    console.error('Erreur suppression institution:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la suppression de l\'institution' }, { status: 500 })
  }
}
