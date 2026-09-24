import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'
import {
  dayRangeUtc,
  todayDateStr,
  shiftDateStr,
  buildVentesSummary,
  percentChange,
  groupSalesByMerchant,
  revenueByHour,
} from '@/lib/ventes-jour'


// DET-004 (MODE-980) — types de ligne minimaux (colonnes réellement
// consommées par l'enrichissement de la journée).
interface VenteRow {
  id: string
  merchant_id: string
  created_at: string
  total_amount: number
  amount_received: number
  change_amount: number
  is_voice_sale: boolean
  voice_transcript: string | null
  note: string | null
  client_id: string | null
}
interface VenteItemRow {
  id: string
  sale_id: string
  product_name: string | null
  quantity: number
  unit_price: number
  subtotal: number
}
interface MerchantLiteRow {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  categorie_marchand: string | null
}

// GET /api/backoffice/ventes?date=YYYY-MM-DD
//
// Détail des ventes marchands d'une journée (aujourd'hui par défaut) :
// ventes enrichies (articles, marchand, zone), agrégats de synthèse,
// comparaison avec la veille, répartition par marchand et par heure.
// Lecture seule — alimente le module BO « Ventes marchands ».

function normalizePhone(phone: string): string {
  return (phone || '').replace(/[\s.-]/g, '')
}

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'ventes', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const rawDate = searchParams.get('date')
    let dateStr = rawDate && rawDate.trim() ? rawDate.trim() : todayDateStr()
    try {
      dayRangeUtc(dateStr) // validation du format
    } catch {
      dateStr = todayDateStr()
    }

    const range = dayRangeUtc(dateStr)
    const yesterdayRange = dayRangeUtc(shiftDateStr(dateStr, -1))

    // A11-F08 (AUDIT-011) : `gestionnaire_zone` est un rôle ZONÉ — la
    // frontière de zone doit être appliquée ICI, pas seulement dans l'UI.
    // AVANT : CA horaire, tickets, transcripts et téléphones de TOUTES les
    // zones étaient servis à un gestionnaire de zone (comparaison avec
    // information-requests/route.ts qui filtre correctement). Fail-closed
    // (canAccessZone, AUDIT-005) : un zoné sans zone ne voit RIEN.
    const zoneFilter =
      auth.user.role === 'gestionnaire_zone' ? auth.user.zone ?? null : undefined

    const supabase = createSupabaseAdminClient()

    const [salesResult, yesterdayResult] = await Promise.all([
      supabase
        .from('legacy_sales')
        .select('*')
        .gte('created_at', range.start)
        .lt('created_at', range.end)
        .order('created_at', { ascending: false }),
      supabase
        .from('legacy_sales')
        // A11-F08 : merchant_id sélectionné aussi pour J-1 — la comparaison
        // « hier » doit être zonée comme aujourd'hui (sinon oracle d'agrégat
        // toutes zones contre un aujourd'hui filtré).
        .select('total_amount, merchant_id')
        .gte('created_at', yesterdayRange.start)
        .lt('created_at', yesterdayRange.end),
    ])
    if (salesResult.error) throw salesResult.error
    if (yesterdayResult.error) throw yesterdayResult.error

    const sales = salesResult.data || []
    const yesterdayRows = (yesterdayResult.data || []) as { total_amount: number; merchant_id: string }[]
    const saleIds = (sales as VenteRow[]).map((s) => s.id)
    // A11-F08 : marchands des DEUX jours (le filtre de zone s'applique à
    // l'enrichissement commun).
    const merchantIds = [
      ...new Set(
        [...(sales as VenteRow[]), ...yesterdayRows]
          .map((s) => s.merchant_id)
          .filter(Boolean)
      ),
    ]

    // Détails (articles), marchands et zones en parallèle
    const [itemsResult, merchantsResult, actorsResult] = await Promise.all([
      saleIds.length > 0
        ? supabase.from('legacy_sale_items').select('*').in('sale_id', saleIds)
        : Promise.resolve({ data: [], error: null }),
      merchantIds.length > 0
        ? supabase.from('merchants').select('id, first_name, last_name, phone, categorie_marchand').in('id', merchantIds)
        : Promise.resolve({ data: [], error: null }),
      // La zone de l'acteur est rattachée au marchand via le numéro de
      // téléphone (le lien direct actor.merchant_id n'est pas toujours
      // renseigné dans les données existantes).
      supabase.from('legacy_bo_actors').select('phone, zone, type').eq('type', 'marchand'),
    ])
    if (itemsResult.error) throw itemsResult.error
    if (merchantsResult.error) throw merchantsResult.error
    if (actorsResult.error) throw actorsResult.error

    const merchantsById = new Map<string, MerchantLiteRow>()
    for (const m of merchantsResult.data || []) merchantsById.set(m.id, m)

    const zoneByPhone = new Map<string, string>()
    for (const a of actorsResult.data || []) {
      const key = normalizePhone(a.phone)
      if (key && a.zone && !zoneByPhone.has(key)) zoneByPhone.set(key, a.zone)
    }

    const itemsBySale = new Map<string, VenteItemRow[]>()
    for (const item of itemsResult.data || []) {
      const list = itemsBySale.get(item.sale_id) || []
      list.push(item)
      itemsBySale.set(item.sale_id, list)
    }

    // A11-F08 : zone d'une vente = zone du marchand (lien via numéro).
    const zoneOfSale = (merchantId: string | null | undefined): string | null => {
      if (!merchantId) return null
      const merchant = merchantsById.get(merchantId)
      if (!merchant) return null
      return zoneByPhone.get(normalizePhone(merchant.phone || '')) || null
    }

    // A11-F08 : la frontière s'applique AVANT tout enrichissement/agrégat
    // (tickets, transcripts, téléphones, CA horaire, comparaison J-1).
    const estDansZone = (zone: string | null): boolean =>
      zoneFilter === undefined ? true : zone !== null && zone === zoneFilter

    const enrichedSales = (sales as VenteRow[])
      .filter((s) => estDansZone(zoneOfSale(s.merchant_id)))
      .map((s) => {
      const merchant = merchantsById.get(s.merchant_id)
      const merchantName = merchant
        ? [merchant.first_name, merchant.last_name].filter(Boolean).join(' ').trim()
        : 'Marchand inconnu'
      const merchantPhone = merchant?.phone || ''
      return {
        id: s.id,
        createdAt: s.created_at,
        totalAmount: s.total_amount,
        amountReceived: s.amount_received,
        changeAmount: s.change_amount,
        isVoiceSale: s.is_voice_sale,
        voiceTranscript: s.voice_transcript,
        note: s.note,
        clientId: s.client_id,
        merchantId: s.merchant_id,
        merchantName,
        merchantPhone,
        categorie: merchant?.categorie_marchand || null,
        zone: zoneByPhone.get(normalizePhone(merchantPhone)) || null,
        items: (itemsBySale.get(s.id) || []).map((i) => ({
          id: i.id,
          productName: i.product_name,
          quantity: i.quantity,
          unitPrice: i.unit_price,
          subtotal: i.subtotal,
        })),
      }
    })

    const summary = buildVentesSummary(enrichedSales)
    // A11-F08 : le « hier » de la comparaison est filtré sur la MÊME zone.
    const yesterdaySales = zoneFilter === undefined
      ? yesterdayRows
      : yesterdayRows.filter((s) => estDansZone(zoneOfSale(s.merchant_id)))
    const yesterdayRevenue = yesterdaySales.reduce((sum, s) => sum + (s.total_amount || 0), 0)

    return NextResponse.json({
      date: dateStr,
      summary: {
        ...summary,
        revenueYesterday: yesterdayRevenue,
        countYesterday: yesterdaySales.length,
        revenueChangePercent: percentChange(summary.revenue, yesterdayRevenue),
        countChangePercent: percentChange(summary.count, yesterdaySales.length),
      },
      sales: enrichedSales,
      merchants: groupSalesByMerchant(enrichedSales),
      hourly: revenueByHour(enrichedSales),
    })
  } catch (error) {
    console.error('Erreur ventes BO:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des ventes de la journée' }, { status: 500 })
  }
}
