import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import type { Mutation, MutationStatus } from '@/lib/stores/identificateur-store'

// IDF-MUT-001 (AUDIT_MATRICE_47_CAS I-02) — mutations de zone côté
// identificateur. Lecture (GET) et création (POST) authentifiées par la
// session appareil (requireDeviceOwner), jamais par un id nu. Même table
// que le back-office (legacy_bo_mutations) — le BO reste l'autorité qui
// approuve/refuse (PATCH /api/backoffice/mutations).
//
// requested_by porte `<nom> (<id>)` : le marqueur d'id permet de filtrer
// côté serveur les mutations signalées PAR CET identificateur sans toucher
// au schéma (le filtre est un ilike sur le marqueur).

type MutationRow = {
  id?: unknown
  actor_id?: unknown
  actor_name?: unknown
  actor_type?: unknown
  from_zone?: unknown
  to_zone?: unknown
  reason?: unknown
  status?: unknown
  requested_by?: unknown
  requested_at?: unknown
  processed_at?: unknown
  processed_by?: unknown
  reject_reason?: unknown
  created_at?: unknown
}

/** Projet la ligne snake_case de legacy_bo_mutations en contrat camelCase. */
function mapMutation(row: MutationRow): Mutation {
  const rawType = String(row.actor_type ?? 'marchand').toLowerCase()
  const actorType: Mutation['actorType'] =
    rawType === 'cooperatif' || rawType === 'cooperative'
      ? 'cooperative'
      : rawType === 'producteur'
        ? 'producteur'
        : 'marchand'
  return {
    id: String(row.id ?? ''),
    actorId: String(row.actor_id ?? ''),
    actorName: String(row.actor_name ?? ''),
    actorType,
    fromZone: String(row.from_zone ?? ''),
    toZone: String(row.to_zone ?? ''),
    reason: row.reason == null ? undefined : String(row.reason),
    status: (row.status as MutationStatus) || 'en_attente',
    requestedBy: row.requested_by == null ? undefined : String(row.requested_by),
    requestedAt: row.requested_at == null ? undefined : String(row.requested_at),
    processedAt: row.processed_at == null ? undefined : String(row.processed_at),
    processedBy: row.processed_by == null ? undefined : String(row.processed_by),
    rejectReason: row.reject_reason == null ? undefined : String(row.reject_reason),
    createdAt: row.created_at == null ? undefined : String(row.created_at),
  }
}

/** Échappe les métacaractères ILIKE pour que l'id soit cherché LITTÉRALEMENT. */
function ilikeContains(value: string): string {
  return `%${value.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const identificateurId = searchParams.get('identificateurId')

    const auth = await requireDeviceOwner(request, 'identificateur', identificateurId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    // requested_by est un texte libre (le back-office y écrit aussi) : on
    // filtre sur le marqueur `<nom> (<id>)` posé par ce POST plutôt que de
    // faire confiance au nom (homonymes possibles).
    const { data, error } = await supabase
      .from('legacy_bo_mutations')
      .select('*')
      .ilike('requested_by', ilikeContains(identificateurId!))
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ mutations: (data ?? []).map(mapMutation) })
  } catch (error) {
    console.error('[API identificateur/mutations GET]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const identificateurId = searchParams.get('identificateurId')

    const auth = await requireDeviceOwner(request, 'identificateur', identificateurId)
    if (auth) return auth

    const body = (await request.json().catch(() => null)) as {
      actorId?: unknown
      actorName?: unknown
      actorType?: unknown
      fromZone?: unknown
      toZone?: unknown
      reason?: unknown
      requestedBy?: unknown
    } | null
    if (!body) {
      return NextResponse.json({ erreur: 'Corps de requête JSON invalide' }, { status: 400 })
    }

    const actorId = typeof body.actorId === 'string' ? body.actorId.trim() : ''
    const actorName = typeof body.actorName === 'string' ? body.actorName.trim() : ''
    const fromZone = typeof body.fromZone === 'string' ? body.fromZone.trim() : ''
    const toZone = typeof body.toZone === 'string' ? body.toZone.trim() : ''
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

    if (!actorId || !actorName || !fromZone || !toZone) {
      return NextResponse.json(
        { erreur: 'Le dossier, la zone d’origine et la zone de destination sont obligatoires' },
        { status: 400 }
      )
    }
    if (!reason) {
      return NextResponse.json(
        { erreur: 'Indiquez le motif de la mutation' },
        { status: 400 }
      )
    }
    if (fromZone === toZone) {
      return NextResponse.json(
        { erreur: 'La zone de destination doit être différente de la zone d’origine' },
        { status: 400 }
      )
    }

    // Marqueur de propriété lisible par l'agent ET filtrable par id au GET
    // (homonymes : le nom seul ne suffit pas à identifier l'auteur).
    const requestedBy =
      typeof body.requestedBy === 'string' && body.requestedBy.trim()
        ? body.requestedBy.trim()
        : identificateurId!

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('legacy_bo_mutations')
      .insert({
        actor_id: actorId,
        actor_name: actorName,
        actor_type: typeof body.actorType === 'string' && body.actorType ? body.actorType : 'marchand',
        from_zone: fromZone,
        to_zone: toZone,
        reason,
        requested_by: requestedBy,
        requested_at: new Date().toISOString(),
        status: 'en_attente',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ mutation: mapMutation(data as MutationRow) }, { status: 201 })
  } catch (error) {
    console.error('[API identificateur/mutations POST]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
