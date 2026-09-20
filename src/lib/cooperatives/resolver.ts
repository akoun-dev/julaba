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
    .select('id, nom, commune, responsable_id, actif')
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

/** Helper erreur uniforme des routes coopérative. */
export function erreurServeur(scope: string, error: unknown): NextResponse {
  console.error(`[API cooperatives/${scope}]`, error)
  return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
}
