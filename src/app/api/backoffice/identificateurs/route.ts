import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'
import { nextAgentCode, normalizeAgentPhone } from '@/lib/agent-code'

// Roster des identificateurs : comptes créés UNIQUEMENT par le back-office
// (règle produit — l'app n'a plus d'auto-inscription). Chaque création
// reçoit un code agent unique (JID-0001, séquentiel) que l'agent peut
// utiliser en lieu et place de son numéro de téléphone pour se connecter.
//
// GET    : liste du roster (filtres zone / teamId / active)
// POST   : création { firstName, lastName, phone, email?, zone?, teamId? }
// PATCH  : mise à jour (activation/désactivation, zone, email, équipe...)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'identificateurs', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { searchParams } = new URL(request.url)
    const zone = searchParams.get('zone')
    const teamId = searchParams.get('teamId')
    const activeOnly = searchParams.get('active') !== 'false'

    let query = supabase.from('legacy_bo_identificateurs').select('*').order('name', { ascending: true })
    if (zone) query = query.eq('zone', zone)
    if (teamId) query = query.eq('team_id', teamId)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Erreur listage identificateurs:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des identificateurs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'identificateurs', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const body = await request.json()
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : ''
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const zone = typeof body.zone === 'string' ? body.zone.trim() : ''
    const teamId = typeof body.teamId === 'string' ? body.teamId.trim() : ''
    const phone = normalizeAgentPhone(typeof body.phone === 'string' ? body.phone : '')

    if (firstName.length < 2 || lastName.length < 2) {
      return NextResponse.json({ erreur: 'Le prénom et le nom (2 caractères minimum) sont obligatoires' }, { status: 400 })
    }
    if (phone.length !== 10) {
      return NextResponse.json({ erreur: 'Le numéro de téléphone doit contenir 10 chiffres (ex: 05 55 55 55 55)' }, { status: 400 })
    }
    if (email && !EMAIL_RE.test(email)) {
      return NextResponse.json({ erreur: 'Adresse email invalide' }, { status: 400 })
    }

    // Unicité du numéro : le téléphone est l'identifiant de connexion
    // principal de l'app identificateur — deux agents actifs ne peuvent
    // pas le partager.
    const { data: existing } = await supabase
      .from('legacy_bo_identificateurs')
      .select('id, name, is_active')
      .eq('phone', phone)
    if (existing && existing.some((row) => row.is_active)) {
      const name = existing.find((row) => row.is_active)?.name
      return NextResponse.json({ erreur: `Un identificateur actif utilise déjà ce numéro (${name || phone})` }, { status: 409 })
    }

    // Code agent unique séquentiel — la boucle réessaie si une écriture
    // concurrente venait à prendre la même séquence (index unique en base).
    const fullName = `${firstName} ${lastName}`.trim()
    let created: Record<string, unknown> | null = null
    let lastError: unknown = null
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      const { data: codes } = await supabase
        .from('legacy_bo_identificateurs')
        .select('agent_code')
      const code = nextAgentCode((codes || []).map((row) => row.agent_code as string).filter(Boolean))

      const { data, error } = await supabase
        .from('legacy_bo_identificateurs')
        .insert({
          id: crypto.randomUUID(),
          name: fullName,
          first_name: firstName,
          last_name: lastName,
          phone,
          email: email || null,
          zone: zone || null,
          team_id: teamId || null,
          agent_code: code,
          is_active: true,
        })
        .select()
        .single()

      if (!error) {
        created = data
      } else {
        lastError = error
        const message = error.message || ''
        if (!message.includes('uq_legacy_bo_identificateurs_agent_code') && !message.includes('duplicate key')) {
          throw error
        }
      }
    }
    if (!created) {
      throw lastError instanceof Error ? lastError : new Error('Impossible de générer un code agent unique')
    }

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'identificateur_create', module: 'identificateurs',
      details: `Création de l'identificateur ${fullName} (${created.agent_code}) — zone ${zone || 'non affectée'}`,
      request,
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error('Erreur creation identificateur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la création de l\'identificateur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'identificateurs', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const body = await request.json()
    const { id } = body
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (body.isActive !== undefined) data.is_active = Boolean(body.isActive)
    if (body.zone !== undefined) data.zone = typeof body.zone === 'string' ? body.zone.trim() || null : null
    if (body.email !== undefined) {
      const email = typeof body.email === 'string' ? body.email.trim() : ''
      if (email && !EMAIL_RE.test(email)) {
        return NextResponse.json({ erreur: 'Adresse email invalide' }, { status: 400 })
      }
      data.email = email || null
    }
    if (body.teamId !== undefined) data.team_id = typeof body.teamId === 'string' ? body.teamId.trim() || null : null
    if (data.is_active === undefined && data.zone === undefined && data.email === undefined && data.team_id === undefined) {
      return NextResponse.json({ erreur: 'Aucun champ modifiable fourni (isActive, zone, email, teamId)' }, { status: 400 })
    }

    const { data: updated, error } = await supabase
      .from('legacy_bo_identificateurs')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'identificateur_update', module: 'identificateurs',
      details: `Mise à jour de l'identificateur ${updated.name} (${updated.agent_code}): ${JSON.stringify(data)}`,
      request,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Erreur mise a jour identificateur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise à jour de l\'identificateur' }, { status: 500 })
  }
}
