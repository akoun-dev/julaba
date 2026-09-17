import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { normalizeAgentPhone } from '@/lib/agent-code'

// Vérification de compte au moment de la connexion identificateur.
//
// Règle produit : les identificateurs sont créés UNIQUEMENT par le
// back-office — l'app n'a plus d'auto-inscription. Avant toute saisie de
// code PIN, l'app interroge cette route pour savoir si le numéro (ou le
// code agent) correspond à un compte actif du roster ; sinon la connexion
// est refusée avec un message invitant l'agent à se rapprocher du
// back-office.
//
// Route volontairement pré-authentification (comme /api/merchant/login) et
// minimale : ne renvoie que le nom, le code agent et la zone — jamais de
// donnée métier. La recherche accepte un numéro de téléphone (normalisé) ou
// un code agent (JID-XXXX, insensible à la casse).

const SIMPLE_RATE_LIMIT_MAX = 20
const simpleRateWindowMs = 60_000
const simpleRateHits = new Map<string, { count: number; resetAt: number }>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = simpleRateHits.get(ip)
  if (!entry || entry.resetAt < now) {
    simpleRateHits.set(ip, { count: 1, resetAt: now + simpleRateWindowMs })
    return false
  }
  entry.count += 1
  return entry.count > SIMPLE_RATE_LIMIT_MAX
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rawQuery = (searchParams.get('query') || '').trim()
  if (!rawQuery) {
    return NextResponse.json({ erreur: 'Paramètre query requis (numéro de téléphone ou code agent)' }, { status: 400 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  if (rateLimited(ip)) {
    return NextResponse.json({ erreur: 'Trop de tentatives, patientez un instant' }, { status: 429 })
  }

  const phone = normalizeAgentPhone(rawQuery)
  const isPhoneQuery = phone.length === 10
  const agentCode = rawQuery.toUpperCase()

  try {
    const supabase = createSupabaseAdminClient()

    // Recherche tolérante : par téléphone OU par code agent. On garde le
    // premier compte actif correspondant.
    let query = supabase
      .from('legacy_bo_identificateurs')
      .select('id, name, first_name, last_name, agent_code, phone, zone, is_active')
      .limit(1)
    if (isPhoneQuery) {
      query = query.eq('phone', phone)
    } else {
      query = query.eq('agent_code', agentCode)
    }

    let { data, error } = await query.maybeSingle()
    if (error && isPhoneQuery && /column .* does not exist/i.test(error.message || '')) {
      // Base pas encore migrée (colonnes first_name/agent_code absentes) :
      // dégradation gracieuse sur les colonnes d'origine plutôt qu'une 500.
      const fallback = await supabase
        .from('legacy_bo_identificateurs')
        .select('id, name, phone, zone, is_active')
        .eq('phone', phone)
        .limit(1)
        .maybeSingle()
      data = fallback.data
      error = fallback.error
    }
    if (error) throw error

    if (!data || !data.is_active) {
      // On ne distingue pas « inconnu » et « désactivé » : pas de fuite
      // d'information sur l'existence d'un compte inactif.
      return NextResponse.json({ found: false })
    }

    return NextResponse.json({
      found: true,
      id: data.id,
      name: data.name,
      firstName: ('first_name' in data ? (data.first_name as string | null) : null) || data.name,
      lastName: ('last_name' in data ? (data.last_name as string | null) : null) || '',
      agentCode: ('agent_code' in data ? (data.agent_code as string | null) : null) || undefined,
      phone: data.phone,
      zone: data.zone,
    })
  } catch (error) {
    console.error('Erreur lookup identificateur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la vérification du compte' }, { status: 500 })
  }
}
