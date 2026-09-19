import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { formatZodError } from '@/lib/validation/marchand'
import { PRICE_LEVELS, resolveCurrentPrice, type PriceEntry } from '@/lib/stock/prices'

interface PriceRow {
  id: string
  product_id: string
  price_type: string
  amount_cfa: number
  valid_from: string
  valid_to: string | null
  created_at: string
}

function mapPrice(row: PriceRow) {
  return {
    productId: row.product_id,
    level: row.price_type,
    amountCfa: row.amount_cfa,
    validFrom: row.valid_from,
    validTo: row.valid_to,
  }
}

const priceUpsertSchema = z
  .object({
    merchantId: z.string().min(1),
    productId: z.string().min(1),
    level: z.enum(['PURCHASE', 'RETAIL', 'SEMI_WHOLESALE', 'WHOLESALE']),
    amountCfa: z.number().int().min(0).max(999_999_999),
    clientId: z.string().min(1).max(64).optional(),
  })
  .strict()

/**
 * GET /api/marchand/stock/prices?merchantId=…[&productId=…][&openOnly=1]
 * Historique des prix par produit et niveau (§29) — validité temporelle
 * conservée : on ne montre que des faits enregistrés, jamais de prix
 * recalculé. openOnly=1 → seulement les lignes ouvertes (prix courants).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    let query = supabase
      .from('merchant_product_prices')
      .select('id, product_id, price_type, amount_cfa, valid_from, valid_to, created_at')
      .eq('merchant_id', merchantId!)
      .order('valid_from', { ascending: false })
      .limit(500)
    const productId = searchParams.get('productId')
    if (productId) query = query.eq('product_id', productId)

    const { data: rows, error } = await query
    if (error) throw error

    const priceRows = (rows ?? []) as unknown as PriceRow[]
    const openOnly = searchParams.get('openOnly') === '1'
    const entries = priceRows.map((r) => mapPrice(r))
    const filtered = openOnly ? entries.filter((e) => e.validTo === null) : entries

    // Prix courants par produit/niveau — le calcul PUR est le même pour
    // l'UI et la voix (une seule source de vérité).
    const current: Record<string, Record<string, number | null>> = {}
    const byProduct = new Map<string, PriceEntry[]>()
    for (const e of filtered) {
      const list = byProduct.get(e.productId) ?? []
      list.push({ priceType: e.level, amountCfa: e.amountCfa, validFrom: e.validFrom, validTo: e.validTo })
      byProduct.set(e.productId, list)
    }
    for (const [pid, list] of byProduct) {
      current[pid] = {}
      for (const level of PRICE_LEVELS) {
        const hit = resolveCurrentPrice(list, level)
        current[pid][level] = hit?.amountCfa ?? null
      }
    }

    return NextResponse.json({
      prices: filtered,
      current,
      levels: PRICE_LEVELS,
      count: filtered.length,
    })
  } catch (error) {
    console.error('Erreur lecture prix produit:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des prix' }, { status: 500 })
  }
}

/**
 * POST /api/marchand/stock/prices — NOUVEAU prix à validité temporelle
 * (§29) : la ligne ouverte précédente est FERMÉE (valid_to = now) et une
 * nouvelle ligne ouvre — l'historique des prix est conservé, jamais
 * écrasé. Idempotent sur clientId (rejeu offline = un seul changement).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = priceUpsertSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const data = parsed.data

    const auth = await requireDeviceOwner(request, 'merchant', data.merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    // 1) Fermer la (ou les) ligne(s) ouverte(s) du niveau — même rejeu = fermeture idempotente.
    await supabase
      .from('merchant_product_prices')
      .update({ valid_to: new Date().toISOString() })
      .eq('merchant_id', data.merchantId)
      .eq('product_id', data.productId)
      .eq('price_type', data.level)
      .is('valid_to', null)

    // 2) Ouvrir la nouvelle ligne (client_id UNIQUE = garde d'idempotence).
    const { data: rows, error } = await supabase
      .from('merchant_product_prices')
      .upsert(
        {
          merchant_id: data.merchantId,
          product_id: data.productId,
          price_type: data.level,
          amount_cfa: data.amountCfa,
          ...(data.clientId ? { client_id: data.clientId } : {}),
        },
        { onConflict: 'merchant_id,product_id,price_type,valid_from' },
      )
      .select('id, product_id, price_type, amount_cfa, valid_from, valid_to, created_at')
    if (error) throw error

    const priceRows = (rows ?? []) as unknown as PriceRow[]
    return NextResponse.json({ price: priceRows[0] ? mapPrice(priceRows[0]) : null }, { status: 201 })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json(
        { erreur: 'Ce changement de prix a déjà été enregistré.', code: 'PRICE_IDEMPOTENT' },
        { status: 409 },
      )
    }
    console.error('Erreur création prix produit:', error)
    return NextResponse.json({ erreur: "Erreur lors de l'enregistrement du prix" }, { status: 500 })
  }
}

export const runtime = 'nodejs'
