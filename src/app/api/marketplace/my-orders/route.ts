import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getDeviceSubject } from '@/lib/device-session'

export async function GET(request: NextRequest) {
  try {
    const merchantId = new URL(request.url).searchParams.get('merchantId')?.trim()
    if (!merchantId) return NextResponse.json({ erreur:'Marchand requis' }, {status:400})
    const subject = await getDeviceSubject(request)
    if (subject !== 'merchant:' + merchantId) return NextResponse.json({erreur:'Accès refusé'},{status:403})
    const supabase = createSupabaseAdminClient()
    const {data:orders,error}=await supabase.from('marketplace_orders').select('id,order_number,total_cfa,status,payment_status,payment_method,delivery_status,delivery_address,delivery_zone,created_at,updated_at').eq('buyer_merchant_id',merchantId).order('created_at',{ascending:false}).limit(100)
    if(error)throw error
    return NextResponse.json({orders:orders||[]})
  } catch(error) {
    console.error('[marketplace my-orders]',error)
    return NextResponse.json({erreur:'Erreur lors du chargement des commandes'},{status:500})
  }
}
