import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'

/**
 * GET /api/marchand/stock/transfers/merchants?merchantId=…
 *
 * Annuaire des destinataires possibles d'un transfert (STK-815, §28) :
 * les autres marchands du système, soi-même exclu — la RPC
 * merchant_transfer_out valide `p_to_merchant_id` contre cette même table
 * `merchants` et refuse TRANSFER_SELF, donc l'UI ne propose jamais de
 * destinataire qui ferait rejeter l'envoi.
 *
 * Données exposées : identité commerciale minimale (nom, téléphone,
 * catégorie) — la marchande vérifie le numéro avant d'envoyer. Aucun
 * champ d'authentification n'est retourné.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    const { data: rows, error } = await supabase
      .from('merchants')
      .select('id, first_name, last_name, phone, categorie_marchand')
      .neq('id', merchantId!)
      .order('first_name', { ascending: true })

    if (error) throw error

    // DET-008/NORM-305 — le client admin Supabase est volontairement non
    // typé (any) ; les champs sont déjà re-castés champ à champ ci-dessous
    // (MODE-980), Record<string, unknown> suffit comme type de ligne.
    const merchants = ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      firstName: (r.first_name as string) ?? '',
      lastName: (r.last_name as string | null) ?? null,
      phone: (r.phone as string) ?? '',
      categorie: (r.categorie_marchand as string | null) ?? null,
    }))
    return NextResponse.json({ merchants, count: merchants.length })
  } catch (error) {
    console.error('Erreur lecture annuaire transferts:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement de la liste des marchands' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
