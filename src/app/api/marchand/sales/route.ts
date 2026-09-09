import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createSaleSchema, formatZodError } from '@/lib/validation/marchand'

function mapSale(row: any) {
  return {
    id: row.id as string,
    merchantId: row.merchant_id as string,
    clientId: row.client_id as string | null,
    totalAmount: row.total_amount as number,
    amountReceived: row.amount_received as number,
    changeAmount: row.change_amount as number,
    isVoiceSale: row.is_voice_sale as boolean,
    voiceTranscript: row.voice_transcript as string | null,
    note: row.note as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapSaleItem(row: any) {
  return {
    id: row.id as string,
    saleId: row.sale_id as string,
    productName: row.product_name as string,
    quantity: row.quantity as number,
    unitPrice: row.unit_price as number,
    subtotal: row.subtotal as number,
    productId: row.product_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let query = supabase
      .from('legacy_sales')
      .select('*')
      .eq('merchant_id', merchantId!)
      .order('created_at', { ascending: false })

    if (startDate) {
      query = query.gte('created_at', new Date(startDate).toISOString())
    }
    if (endDate) {
      query = query.lte('created_at', new Date(endDate).toISOString())
    }

    const { data: sales, error: salesError } = await query
    if (salesError) throw salesError

    const saleIds = (sales ?? []).map((s) => s.id)

    let items: any[] = []
    if (saleIds.length > 0) {
      const { data: itemsData, error: itemsError } = await supabase
        .from('legacy_sale_items')
        .select('*')
        .in('sale_id', saleIds)
      if (itemsError) throw itemsError
      items = itemsData ?? []
    }

    const salesWithItems = (sales ?? []).map((s) => ({
      ...mapSale(s),
      items: items.filter((i) => i.sale_id === s.id).map(mapSaleItem),
    }))

    const totalRevenue = salesWithItems.reduce((sum, s) => sum + (s.totalAmount ?? 0), 0)

    return NextResponse.json({ sales: salesWithItems, totalRevenue, count: salesWithItems.length })
  } catch (error) {
    console.error('Erreur ventes marchand:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des ventes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createSaleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { merchantId, items, amountReceived, isVoiceSale, voiceTranscript, note, clientId } = parsed.data

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    if (clientId) {
      const { data: existing } = await supabase
        .from('legacy_sales')
        .select('*')
        .eq('client_id', clientId)
        .single()
      if (existing) {
        const { data: existingItems } = await supabase
          .from('legacy_sale_items')
          .select('*')
          .eq('sale_id', existing.id)
        return NextResponse.json(
          { ...mapSale(existing), items: (existingItems ?? []).map(mapSaleItem) },
          { status: 200 },
        )
      }
    }

    const saleItemsData = items.map((item) => ({
      product_name: item.productName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      subtotal: item.quantity * item.unitPrice,
      product_id: item.productId || null,
    }))

    const totalAmount = saleItemsData.reduce((sum, item) => sum + item.subtotal, 0)
    const changeAmount = (amountReceived || 0) - totalAmount

    const { data: sale, error: saleError } = await supabase
      .from('legacy_sales')
      .insert({
        merchant_id: merchantId,
        client_id: clientId || null,
        total_amount: totalAmount,
        amount_received: amountReceived || 0,
        change_amount: Math.max(0, changeAmount),
        is_voice_sale: isVoiceSale || false,
        voice_transcript: voiceTranscript || null,
        note: note || null,
      })
      .select()
      .single()
    if (saleError) throw saleError

    if (saleItemsData.length > 0) {
      const itemsWithSaleId = saleItemsData.map((item) => ({
        ...item,
        sale_id: sale.id,
      }))
      const { error: itemsError } = await supabase
        .from('legacy_sale_items')
        .insert(itemsWithSaleId)
      if (itemsError) throw itemsError
    }

    const { data: saleItems } = await supabase
      .from('legacy_sale_items')
      .select('*')
      .eq('sale_id', sale.id)

    return NextResponse.json(
      { ...mapSale(sale), items: (saleItems ?? []).map(mapSaleItem) },
      { status: 201 },
    )
  } catch (error) {
    console.error('Erreur creation vente:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la vente' }, { status: 500 })
  }
}
