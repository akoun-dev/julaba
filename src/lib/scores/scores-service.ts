/**
 * MODE-932 — Service serveur du Score JULABA (SOURCE UNIQUE).
 *
 * Invariant julaba-app (score-membres-cooperative.spec) : le scoreJulaba
 * renvoyé par GET /cooperatives/membres est EXACTEMENT celui de
 * GET /scores/me — la même fonction batchée alimente les deux surfaces,
 * SANS N+1 (un nombre de requêtes constant quelle que soit la taille de
 * la coopérative).
 *
 * Toutes les lectures sont des agrégats de tables réelles :
 *  - legacy_sales (caisse) — ventes 30 j par merchant_id
 *  - merchant_market_sessions — journées ouvertes 30 j
 *  - cooperative_transactions (trésorerie validée) — cotisations
 *  - cooperative_stock_mouvements — apports / mouvements du pot commun
 *  - cooperative_besoins — besoins traités
 * Aucune écriture : le score se déduit, il ne se stocke jamais.
 */

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  calculerScoreCooperateur, calculerScoreMarchand,
  type DetailScore, type SignalMarchand,
} from './score-julaba'

type Supabase = ReturnType<typeof createSupabaseAdminClient>

const JOURS_30_MS = 30 * 24 * 60 * 60 * 1000

/** Fenêtre « 30 derniers jours » (ISO) partagée par toutes les requêtes. */
function iso30Jours(): string {
  return new Date(Date.now() - JOURS_30_MS).toISOString()
}

/** Signaux marchand pour UN ensemble d'ids — 4 requêtes batchées au total,
 * quel que soit le nombre de marchands (invariant anti-N+1). Les profils
 * (prenom/nom/téléphone) sont fournis par l'appelant : dans la route
 * membres ils sont DÉJÀ joints pour l'affichage, on ne les relit jamais. */
async function signauxMarchands(
  supabase: Supabase,
  marchandIds: string[],
  profils: Map<string, { prenom: string | null; nom: string | null; phone: string | null }>,
  cooperativeId: string | null
): Promise<Map<string, SignalMarchand>> {
  const resultat = new Map<string, SignalMarchand>()
  if (marchandIds.length === 0) return resultat

  const depuis = iso30Jours()

  const [ventesRes, sessionsRes, cotisationsRes, apportsRes] = await Promise.all([
    supabase
      .from('legacy_sales')
      .select('merchant_id')
      .in('merchant_id', marchandIds)
      .gte('created_at', depuis),
    supabase
      .from('merchant_market_sessions')
      .select('merchant_id')
      .in('merchant_id', marchandIds)
      .gte('started_at', depuis),
    // Cotisation à jour = entrée 'cotisation' VALIDÉE en trésorerie
    // (source de vérité — le flag cotisation_payee n'est qu'un raccourci UI).
    cooperativeId
      ? supabase
          .from('cooperative_transactions')
          .select('membre_id')
          .eq('cooperative_id', cooperativeId)
          .eq('statut', 'validee')
          .eq('categorie', 'cotisation')
          .in('membre_id', marchandIds)
      : Promise.resolve({ data: [] as { membre_id: string | null }[], error: null }),
    cooperativeId
      ? supabase
          .from('cooperative_stock_mouvements')
          .select('membre_id')
          .eq('cooperative_id', cooperativeId)
          .eq('type', 'apport')
          .in('membre_id', marchandIds)
          .gte('created_at', depuis)
      : Promise.resolve({ data: [] as { membre_id: string | null }[], error: null }),
  ])

  if (ventesRes.error) throw ventesRes.error
  if (sessionsRes.error) throw sessionsRes.error

  const comptePar = <T extends Record<string, unknown>>(lignes: T[] | null, cle: string): Map<string, number> => {
    const comptes = new Map<string, number>()
    for (const l of lignes ?? []) {
      const id = l[cle]
      if (typeof id === 'string') comptes.set(id, (comptes.get(id) ?? 0) + 1)
    }
    return comptes
  }

  const ventes = comptePar(ventesRes.data as { merchant_id: string }[] | null, 'merchant_id')
  const journees = comptePar(sessionsRes.data as { merchant_id: string }[] | null, 'merchant_id')
  const cotisations = comptePar((cotisationsRes.data ?? []) as { membre_id: string | null }[], 'membre_id')
  const apports = comptePar((apportsRes.data ?? []) as { membre_id: string | null }[], 'membre_id')

  for (const id of marchandIds) {
    const compte = profils.get(id)
    resultat.set(id, {
      ventes30j: ventes.get(id) ?? 0,
      journees30j: journees.get(id) ?? 0,
      cotisationValidee: cotisations.has(id),
      apports30j: apports.get(id) ?? 0,
      profil: {
        prenom: Boolean(compte?.prenom),
        nom: Boolean(compte?.nom),
        telephone: Boolean(compte?.phone),
      },
    })
  }
  return resultat
}

/** Scores DÉTAILLÉS d'un lot de marchands d'une coopérative (route membres
 * — batché, sans N+1). Le profil de chaque marchand est passé tel quel. */
export async function scoresMarchandsBatch(
  supabase: Supabase,
  cooperativeId: string,
  membres: { marchandId: string; prenom: string | null; nom: string | null; telephone: string | null }[]
): Promise<Map<string, DetailScore>> {
  const profils = new Map(
    membres.map((m) => [
      m.marchandId,
      { prenom: m.prenom, nom: m.nom, phone: m.telephone } as { prenom: string | null; nom: string | null; phone: string | null },
    ])
  )
  const signaux = await signauxMarchands(
    supabase,
    membres.map((m) => m.marchandId),
    profils,
    cooperativeId
  )
  const scores = new Map<string, DetailScore>()
  for (const m of membres) {
    scores.set(m.marchandId, calculerScoreMarchand(signaux.get(m.marchandId)!))
  }
  return scores
}

/** Score d'UN marchand (route /scores/me) — marcheur hors coopérative
 * inclus : les signaux coopératifs sont alors simplement absents. */
export async function scoreMarchand(
  supabase: Supabase,
  merchantId: string,
  cooperativeId: string | null
): Promise<DetailScore> {
  const { data: compte } = await supabase
    .from('merchants')
    .select('first_name, last_name, phone')
    .eq('id', merchantId)
    .maybeSingle()
  const profils = new Map([
    [
      merchantId,
      {
        prenom: (compte as { first_name: string | null } | null)?.first_name ?? null,
        nom: (compte as { last_name: string | null } | null)?.last_name ?? null,
        phone: (compte as { phone: string | null } | null)?.phone ?? null,
      },
    ],
  ])
  const signaux = await signauxMarchands(supabase, [merchantId], profils, cooperativeId)
  return calculerScoreMarchand(signaux.get(merchantId)!)
}

/** Score du PRÉSIDENT d'une coopérative (membres_count + besoins_traites,
 * comme julaba-app) — la même source que /scores/me côté coopérateur. */
export async function scoreCooperateur(supabase: Supabase, cooperativeId: string): Promise<DetailScore> {
  const depuis = iso30Jours()

  const [membresRes, besoinsRes, cotisationsRes, mouvementsRes] = await Promise.all([
    supabase
      .from('cooperative_membres')
      .select('id', { count: 'exact', head: true })
      .eq('cooperative_id', cooperativeId)
      .eq('statut', 'actif'),
    supabase
      .from('cooperative_besoins')
      .select('id', { count: 'exact', head: true })
      .eq('cooperative_id', cooperativeId)
      .neq('statut', 'en_attente'),
    supabase
      .from('cooperative_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('cooperative_id', cooperativeId)
      .eq('statut', 'validee')
      .eq('categorie', 'cotisation'),
    supabase
      .from('cooperative_stock_mouvements')
      .select('id', { count: 'exact', head: true })
      .eq('cooperative_id', cooperativeId)
      .gte('created_at', depuis),
  ])

  for (const r of [membresRes, besoinsRes, cotisationsRes, mouvementsRes]) {
    if (r.error) throw r.error
  }

  return calculerScoreCooperateur({
    membresActifs: membresRes.count ?? 0,
    besoinsTraites: besoinsRes.count ?? 0,
    cotisationsValidees: cotisationsRes.count ?? 0,
    mouvementsPotCommun30j: mouvementsRes.count ?? 0,
  })
}
