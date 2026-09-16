import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/backoffice/demo-accounts — raccourcis de connexion de l'écran
 * d'authentification BO (email/nom/rôle/zone, jamais de mot de passe).
 *
 * Cette liste révèle les emails, rôles et zones de tout le personnel : en
 * production c'est une énumération anonyme d'identifiants de connexion.
 * Elle n'est servie que si BACKOFFICE_DEMO_ACCOUNTS=true (démo/preview).
 * Sinon la route répond 200 avec une liste vide : l'écran de connexion
 * masque simplement le panneau, sans erreur ni fuite.
 */
export async function GET() {
  if (process.env.BACKOFFICE_DEMO_ACCOUNTS !== 'true') {
    return NextResponse.json([])
  }

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
