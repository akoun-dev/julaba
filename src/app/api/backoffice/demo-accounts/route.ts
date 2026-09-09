import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('bo_users')
      .select('email, name, role, zone')
      .eq('is_active', true)
      .order('role', { ascending: true })

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Erreur chargement comptes demo:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des comptes' }, { status: 500 })
  }
}
