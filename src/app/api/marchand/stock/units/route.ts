import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { formatZodError, stockUnitUpsertSchema } from '@/lib/validation/marchand'
import { STOCK_UNITS } from '@/lib/stock/units'

interface UnitRow {
  id: string
  product_id: string
  unit_code: string
  conversion_to_base: number
  is_base: boolean
  is_default_sale: boolean
}

function mapUnit(row: UnitRow) {
  return {
    productId: row.product_id,
    unitCode: row.unit_code,
    conversionToBase: row.conversion_to_base,
    isBase: row.is_base,
    isDefaultSale: row.is_default_sale,
  }
}

/**
 * GET /api/marchand/stock/units?merchantId=…[&productId=…]
 * Unités commerciales configurées par produit (STK-806, §8-9) : la
 * conversion « sac → kg » est propre à chaque produit et à chaque marchand.
 * Le front s'en sert pour l'affichage converti (« 2 sacs + 13 kilos »)
 * et la voix (STK-807) pour comprendre « 2 sacs ».
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    let query = supabase
      .from('merchant_product_units')
      .select('id, product_id, unit_code, conversion_to_base, is_base, is_default_sale')
      .eq('merchant_id', merchantId!)
      .order('conversion_to_base', { ascending: false })
    const productId = searchParams.get('productId')
    if (productId) query = query.eq('product_id', productId)

    const { data: rows, error } = await query
    if (error) throw error

    const unitRows = (rows ?? []) as unknown as UnitRow[]
    // Catalogue vocal du projet, exposé pour que le front n'ait JAMAIS à
    // dupliquer la liste des unités reconnues (une seule source de vérité).
    const byProduct: Record<string, ReturnType<typeof mapUnit>[]> = {}
    for (const row of unitRows) {
      const list = byProduct[row.product_id] ?? (byProduct[row.product_id] = [])
      list.push(mapUnit(row))
    }
    return NextResponse.json({
      units: unitRows.map((r) => mapUnit(r)),
      byProduct,
      catalog: STOCK_UNITS.map((u) => ({ code: u.code, labelFr: u.labelFr, kind: u.kind })),
      count: unitRows.length,
    })
  } catch (error) {
    console.error('Erreur lecture unités produit:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des unités' }, { status: 500 })
  }
}

/**
 * POST /api/marchand/stock/units — upsert d'une conversion produit.
 * Idempotent sur (merchant_id, product_id, unit_code) — rejouer une
 * configuration offline ne duplique rien (client_id conservé si fourni).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = stockUnitUpsertSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const data = parsed.data

    const auth = await requireDeviceOwner(request, 'merchant', data.merchantId)
    if (auth) return auth

    // Le code doit exister dans le catalogue (voix + affichage doivent
    // savoir le parler) — pas de code libre jamais inventé.
    const def = STOCK_UNITS.find(
      (u) => u.code === data.unitCode || u.aliases.includes(data.unitCode.toLowerCase()),
    )
    if (!def) {
      return NextResponse.json(
        {
          erreur: `Unité inconnue : ${data.unitCode}. Unités reconnues : ${STOCK_UNITS.map((u) => u.code).join(', ')}.`,
          code: 'INVALID_UNIT',
        },
        { status: 400 },
      )
    }

    const supabase = createSupabaseAdminClient()

    // Un seul is_base / is_default_sale par produit (index uniques partiels
    // en base) : on désactive les autres lignes d'abord — le même upsert
    // rejoué reste idempotent.
    if (data.isBase || data.isDefaultSale) {
      const demote: Record<string, boolean> = {}
      if (data.isBase) demote.is_base = false
      if (data.isDefaultSale) demote.is_default_sale = false
      await supabase
        .from('merchant_product_units')
        .update(demote)
        .eq('merchant_id', data.merchantId)
        .eq('product_id', data.productId)
        .neq('unit_code', def.code)
    }

    const { data: rows, error } = await supabase
      .from('merchant_product_units')
      .upsert(
        {
          merchant_id: data.merchantId,
          product_id: data.productId,
          unit_code: def.code,
          conversion_to_base: data.conversionToBase,
          is_base: data.isBase ?? false,
          is_default_sale: data.isDefaultSale ?? false,
          ...(data.clientId ? { client_id: data.clientId } : {}),
        },
        { onConflict: 'merchant_id,product_id,unit_code' },
      )
      .select('id, product_id, unit_code, conversion_to_base, is_base, is_default_sale')
    if (error) throw error

    const unitRows = (rows ?? []) as unknown as UnitRow[]
    return NextResponse.json(
      { unit: unitRows[0] ? mapUnit(unitRows[0]) : null },
      { status: 201 },
    )
  } catch (error) {
    // 23505 : index unique partiel violé (deux is_base simultanés) —
    // rejet métier clair, pas une 500.
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json(
        { erreur: 'Une seule unité de base (et de vente par défaut) par produit.', code: 'UNIT_CONFLICT' },
        { status: 409 },
      )
    }
    console.error('Erreur création unité produit:', error)
    return NextResponse.json({ erreur: "Erreur lors de la configuration de l'unité" }, { status: 500 })
  }
}

export const runtime = 'nodejs'
