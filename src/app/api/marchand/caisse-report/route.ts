import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'

// MODE-945 (AUDIT-003 D-1) — Rapport de session de marché marchand.
//
// Préalables livrés : chaque vente porte `session_id` (C-2, MODE-939) et
// `selling_point_client_id` (MODE-908). Le rapport est une AGRÉGATION DES
// FAITS SERVEUR (le grand livre legacy_sales fait foi) : totaux, ventes par
// point de vente, top produits. Aucune projection locale : si des ventes
// sont encore dans la file offline de l'appareil, elles NE SONT PAS dans ce
// rapport — l'écran affiche l'écart au lieu de l'inventer.
//
// Les dépenses n'ont PAS de session_id (legacy_expenses) : elles restent un
// total appareil affiché séparément, jamais mélangées aux faits serveur.

const PLAFOND_VENTES = 1000
const PLAFOND_PRODUITS = 10

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const merchantId = searchParams.get('merchantId')
  const sessionId = searchParams.get('sessionId')

  if (!sessionId || sessionId.length > 100) {
    return NextResponse.json({ erreur: 'sessionId requis' }, { status: 400 })
  }

  const auth = await requireDeviceOwner(request, 'merchant', merchantId)
  if (auth) return auth

  const supabase = createSupabaseAdminClient()

  // MODE-984 (AUDIT-008 P2) — la session doit EXISTER et appartenir au
  // marchand : une session inconnue est un 404 honnête, jamais un rapport
  // de zéros présenté comme valide.
  const { data: sessionRow, error: sessionError } = await supabase
    .from('legacy_caisse_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('merchant_id', merchantId as string)
    .maybeSingle()
  if (sessionError) return NextResponse.json({ erreur: 'Rapport indisponible' }, { status: 500 })
  if (!sessionRow) return NextResponse.json({ erreur: 'Session inconnue' }, { status: 404 })

  // Ventes de la session, bornées (le grand livre est indexé
  // merchant_id + created_at — PF-02, MODE-942).
  const { data: ventes, error } = await supabase
    .from('legacy_sales')
    .select('id, total_amount, amount_received, is_voice_sale, selling_point_client_id')
    .eq('merchant_id', merchantId as string)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(PLAFOND_VENTES)

  if (error) return NextResponse.json({ erreur: 'Rapport indisponible' }, { status: 500 })
  const listeVentes = ventes ?? []

  // Résolution id → nom des points de vente référencés (jamais bloquant :
  // un point inconnu reste listé sous un nom honnête).
  const idsPoints = [
    ...new Set(
      listeVentes
        .map((v) => v.selling_point_client_id)
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    ),
  ]
  const nomsPoints = new Map<string, string>()
  if (idsPoints.length > 0) {
    const { data: points } = await supabase
      .from('merchant_selling_points')
      .select('id, name')
      .in('id', idsPoints)
    for (const p of points ?? []) {
      if (typeof p.id === 'string' && typeof p.name === 'string') {
        nomsPoints.set(p.id, p.name)
      }
    }
  }

  // Produits de la session via jointure postgREST (!inner) — pas de .in
  // géant sur sale_id (une session peut dépasser quelques centaines de
  // ventes ; la liste d'ids ne doit jamais voyager dans l'URL).
  const { data: items, error: itemsError } = await supabase
    .from('legacy_sale_items')
    .select('product_name, quantity, subtotal, legacy_sales!inner(id)')
    .eq('legacy_sales.session_id', sessionId)
    .eq('legacy_sales.merchant_id', merchantId as string)
  const listeItems = itemsError ? [] : (items ?? [])

  const totaux = {
    ventes: listeVentes.length,
    totalMontant: listeVentes.reduce((s, v) => s + (Number(v.total_amount) || 0), 0),
    totalRecu: listeVentes.reduce((s, v) => s + (Number(v.amount_received) || 0), 0),
    ventesVocales: listeVentes.filter((v) => v.is_voice_sale === true).length,
  }

  const parPointMap = new Map<string, { ventes: number; total: number }>()
  for (const v of listeVentes) {
    const cle = typeof v.selling_point_client_id === 'string' && v.selling_point_client_id.length > 0
      ? v.selling_point_client_id
      : 'sans-point'
    const acc = parPointMap.get(cle) ?? { ventes: 0, total: 0 }
    acc.ventes += 1
    acc.total += Number(v.total_amount) || 0
    parPointMap.set(cle, acc)
  }
  const parPoint = [...parPointMap.entries()]
    .map(([pointId, acc]) => ({
      pointId: pointId === 'sans-point' ? null : pointId,
      nom: pointId === 'sans-point' ? 'Point non précisé' : (nomsPoints.get(pointId) ?? 'Point inconnu'),
      ventes: acc.ventes,
      total: acc.total,
    }))
    .sort((a, b) => b.total - a.total)

  const produitsMap = new Map<string, { quantite: number; total: number }>()
  for (const it of listeItems) {
    const nom = typeof it.product_name === 'string' && it.product_name.trim().length > 0
      ? it.product_name.trim()
      : 'Produit sans nom'
    const acc = produitsMap.get(nom) ?? { quantite: 0, total: 0 }
    acc.quantite += Number(it.quantity) || 0
    acc.total += Number(it.subtotal) || 0
    produitsMap.set(nom, acc)
  }
  const topProduits = [...produitsMap.entries()]
    .map(([nom, acc]) => ({ nom, quantite: acc.quantite, total: acc.total }))
    .sort((a, b) => b.total - a.total || b.quantite - a.quantite)
    .slice(0, PLAFOND_PRODUITS)

  return NextResponse.json({
    sessionId,
    generatedAt: new Date().toISOString(),
    totaux,
    parPoint,
    topProduits,
    // MODE-984 (AUDIT-008 P2) — l'incomplétude est SIGNALÉE, jamais avalée :
    // une erreur sur les items n'est plus transformée en « aucun produit ».
    ...(itemsError ? { produitsIndisponibles: true } : {}),
    ...(listeVentes.length >= PLAFOND_VENTES
      ? { borne: `Rapport limité aux ${PLAFOND_VENTES} ventes les plus récentes de la session.` }
      : {}),
  })
}
