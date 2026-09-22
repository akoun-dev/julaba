import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createProductSchema, updateProductSchema, formatZodError } from '@/lib/validation/marchand'

function mapProduct(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    merchantId: row.merchant_id as string,
    clientId: row.client_id as string | null,
    name: row.name as string,
    category: row.category as string,
    priceUnit: row.price_unit as number,
    stockQty: row.stock_qty as number,
    imageUrl: row.image_url as string | null,
    isActive: row.is_active as boolean,
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

    const category = searchParams.get('category')

    let query = supabase
      .from('legacy_products')
      .select('*')
      .eq('merchant_id', merchantId!)
      .order('created_at', { ascending: false })

    if (category) {
      query = query.eq('category', category)
    }

    const { data: products, error: productsError } = await query
    if (productsError) throw productsError

    return NextResponse.json((products ?? []).map(mapProduct))
  } catch (error) {
    console.error('Erreur produits marchand:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des produits' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createProductSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { merchantId, name, category, priceUnit, stockQty, imageUrl, clientId } = parsed.data

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    if (clientId) {
      const { data: existing } = await supabase
        .from('legacy_products')
        .select('*')
        .eq('client_id', clientId)
        .single()
      if (existing) {
        return NextResponse.json(mapProduct(existing), { status: 200 })
      }
    }

    const { data: product, error: productError } = await supabase
      .from('legacy_products')
      .insert({
        merchant_id: merchantId,
        client_id: clientId || null,
        name,
        category: category || 'autre',
        price_unit: priceUnit || 0,
        stock_qty: stockQty || 0,
        image_url: imageUrl || null,
      })
      .select()
      .single()
    if (productError) throw productError

    return NextResponse.json(mapProduct(product), { status: 201 })
  } catch (error) {
    console.error('Erreur creation produit:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation du produit' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const rest = await request.json()

    if (!id) {
      return NextResponse.json({ erreur: "L'identifiant est obligatoire" }, { status: 400 })
    }

    const parsed = updateProductSchema.safeParse(rest)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const { data: existing, error: existingError } = await supabase
      .from('legacy_products')
      .select('*')
      .eq('id', id)
      .single()
    if (existingError || !existing) {
      return NextResponse.json({ erreur: 'Produit introuvable' }, { status: 404 })
    }
    const auth = await requireDeviceOwner(request, 'merchant', existing.merchant_id)
    if (auth) return auth

    const updateData: {
      name?: string
      category?: string
      price_unit?: number
      stock_qty?: number
      image_url?: string | null
    } = {}
    const d = parsed.data
    if (d.name !== undefined) updateData.name = d.name
    if (d.category !== undefined) updateData.category = d.category
    if (d.priceUnit !== undefined) updateData.price_unit = d.priceUnit
    if (d.stockQty !== undefined) updateData.stock_qty = d.stockQty
    if (d.imageUrl !== undefined) updateData.image_url = d.imageUrl

    const { data: product, error: productError } = await supabase
      .from('legacy_products')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    if (productError) throw productError

    return NextResponse.json(mapProduct(product))
  } catch (error) {
    console.error('Erreur mise a jour produit:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour du produit' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ erreur: "L'identifiant est obligatoire" }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const { data: existing, error: existingError } = await supabase
      .from('legacy_products')
      .select('*')
      .eq('id', id)
      .single()
    if (existingError || !existing) {
      return NextResponse.json({ erreur: 'Produit introuvable' }, { status: 404 })
    }
    const auth = await requireDeviceOwner(request, 'merchant', existing.merchant_id)
    if (auth) return auth

    const { error: deleteError } = await supabase
      .from('legacy_products')
      .delete()
      .eq('id', id)
    if (deleteError) throw deleteError

    return NextResponse.json({ succes: 'Produit supprime' })
  } catch (error) {
    console.error('Erreur suppression produit:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la suppression du produit' }, { status: 500 })
  }
}
