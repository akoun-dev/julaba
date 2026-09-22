import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'

/**
 * Résolveur serveur du module Coopérative (MODE-921) — miroir du
 * CooperativeResolverService de julaba-app : la coopérative active d'un
 * compte est TOUJOURS résolue côté serveur à partir de la base, jamais
 * acceptée du client (un appelant ne peut pas opérer sur la coopérative
 * d'un autre en forgeant un id).
 */

export type PresidentContext = {
  cooperateurId: string
  cooperative: {
    id: string
    nom: string
    commune: string | null
    /** MODE-979 (DET-COOP-008) — commune du référentiel GPS liée
     * (nullable : les coopératives historiques en texte libre sans
     * correspondance exacte restent sans position). */
    commune_id: string | null
    responsable_id: string
    actif: boolean
  }
}

export type MembreContext = {
  merchantId: string
  cooperative: {
    id: string
    nom: string
    commune: string | null
    responsable_id: string
  }
  membre: {
    id: string
    statut: 'actif' | 'suspendu' | 'en_attente' | 'exclu'
    role: 'membre' | 'president'
    cotisation_payee: boolean
  }
}

type Supabase = ReturnType<typeof createSupabaseAdminClient>

/** Garde de session : le cookie appareil doit appartenir au coopérateur
 * `cooperateurId` passé par le client (comme chez le producteur — voir
 * requireDeviceOwner). Renvoie une NextResponse prête à retourner en cas
 * d'échec, null sinon. */
export async function requireCooperateurSession(
  request: NextRequest,
  cooperateurId: string | null | undefined
): Promise<NextResponse | null> {
  return requireDeviceOwner(request, 'cooperateur', cooperateurId)
}

/** Garde de session marchand (adhésion, besoins, cotisation, distributions). */
export async function requireMarchandSession(
  request: NextRequest,
  merchantId: string | null | undefined
): Promise<NextResponse | null> {
  return requireDeviceOwner(request, 'merchant', merchantId)
}

/** Résout la coopérative DONT LE COMPTE EST RESPONSABLE (président).
 * Une coopérative par responsable (UNIQUE en base) — 404 si aucune. */
export async function resolveCooperativeByResponsable(
  supabase: Supabase,
  cooperateurId: string
): Promise<PresidentContext | null> {
  const { data, error } = await supabase
    .from('cooperatives')
    .select('id, nom, commune, commune_id, responsable_id, actif')
    .eq('responsable_id', cooperateurId)
    .maybeSingle()
  if (error || !data) return null
  return {
    cooperateurId,
    cooperative: data as PresidentContext['cooperative'],
  }
}

/** Garde complet « président » : session appareil valide ET responsable
 * d'une coopérative active. Renvoie la NextResponse d'erreur (401/403/404)
 * ou null quand l'appelant peut continuer. */
export async function requirePresident(
  request: NextRequest,
  cooperateurId: string | null | undefined
): Promise<{ ctx: PresidentContext } | { erreur: NextResponse }> {
  const sessionGuard = await requireCooperateurSession(request, cooperateurId)
  if (sessionGuard) return { erreur: sessionGuard }
  const supabase = createSupabaseAdminClient()
  const ctx = await resolveCooperativeByResponsable(supabase, cooperateurId!)
  if (!ctx) {
    return {
      erreur: NextResponse.json(
        { erreur: 'Aucune coopérative trouvée pour ce compte' },
        { status: 404 }
      ),
    }
  }
  if (!ctx.cooperative.actif) {
    return {
      erreur: NextResponse.json(
        { erreur: 'Coopérative désactivée' },
        { status: 403 }
      ),
    }
  }
  return { ctx }
}

/** Résout l'adhésion ACTIVE d'un marchand (l'équivalent du résolveur
 * unique de julaba-app : adhésion active, coopérative jointe). 404 si
 * aucune adhésion active — le marchand n'est alors pas membre. */
export async function resolveMembreActif(
  supabase: Supabase,
  merchantId: string
): Promise<MembreContext | null> {
  const { data, error } = await supabase
    .from('cooperative_membres')
    .select(
      'id, statut, role, cotisation_payee, cooperative:cooperatives(id, nom, commune, responsable_id)'
    )
    .eq('membre_id', merchantId)
    .eq('actif', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  const row = data as unknown as {
    id: string
    statut: MembreContext['membre']['statut']
    role: MembreContext['membre']['role']
    cotisation_payee: boolean
    cooperative: MembreContext['cooperative'] | null
  }
  if (!row.cooperative) return null
  return {
    merchantId,
    cooperative: row.cooperative,
    membre: {
      id: row.id,
      statut: row.statut,
      role: row.role,
      cotisation_payee: row.cotisation_payee,
    },
  }
}

/** Garde complet « membre actif » : session marchand valide ET adhésion
 * active (statut 'actif'). Suspendu/exclu/en attente → 403. */
export async function requireMembreActif(
  request: NextRequest,
  merchantId: string | null | undefined
): Promise<{ ctx: MembreContext } | { erreur: NextResponse }> {
  const sessionGuard = await requireMarchandSession(request, merchantId)
  if (sessionGuard) return { erreur: sessionGuard }
  const supabase = createSupabaseAdminClient()
  const ctx = await resolveMembreActif(supabase, merchantId!)
  if (!ctx) {
    return {
      erreur: NextResponse.json(
        { erreur: 'Aucune adhésion active — rejoignez une coopérative' },
        { status: 404 }
      ),
    }
  }
  if (ctx.membre.statut !== 'actif') {
    return {
      erreur: NextResponse.json(
        { erreur: `Adhésion ${ctx.membre.statut} — action non autorisée` },
        { status: 403 }
      ),
    }
  }
  return { ctx }
}

/**
 * Garde duale du POT COMMUN (MODE-931) — l'opérateur est soit un membre
 * actif (marchand), soit le PRÉSIDENT (coopérateur responsable).
 *
 * Historique : POST stock/distribution n'acceptait que la session marchand,
 * alors que le président est authentifié avec le sujet `cooperateur:<id>` —
 * 403 systématique sur « Apporter », « Distribuer » et la distribution
 * liée à un besoin (écrans cœur de l'espace coopérative). Le président
 * n'a pas de ligne cooperative_membres (FK membre_id → merchants) : la
 * signature du mouvement passe par cooperative_stock_mouvements.membre_id
 * désormais sans FK (migration 20260921010000, idempotence RPC
 * « is not distinct from »).
 */
export type OperateurPotCommun =
  | { type: 'membre'; merchantId: string; membreId: string; cooperative: MembreContext['cooperative'] }
  | { type: 'president'; cooperateurId: string; cooperative: PresidentContext['cooperative'] }

export async function requireMembreActifOuPresident(
  request: NextRequest,
  ids: { merchantId?: string | null; cooperateurId?: string | null }
): Promise<{ ctx: OperateurPotCommun } | { erreur: NextResponse }> {
  // Le président passe par son espace coopérative (cooperateurId) ; les
  // deux ids simultanés ne doivent JAMAIS produire un mixte ambigu — le
  // chemin coopérateur prime (l'écran président n'a pas de merchantId).
  if (ids.cooperateurId) {
    const garde = await requirePresident(request, ids.cooperateurId)
    if ('erreur' in garde) return garde
    return {
      ctx: {
        type: 'president',
        cooperateurId: garde.ctx.cooperateurId,
        cooperative: garde.ctx.cooperative,
      },
    }
  }
  const garde = await requireMembreActif(request, ids.merchantId)
  if ('erreur' in garde) return garde
  return {
    ctx: {
      type: 'membre',
      merchantId: garde.ctx.merchantId,
      membreId: garde.ctx.membre.id,
      cooperative: garde.ctx.cooperative,
    },
  }
}

/** Helper erreur uniforme des routes coopérative. */
export function erreurServeur(scope: string, error: unknown): NextResponse {
  console.error(`[API cooperatives/${scope}]`, error)
  return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
}
