import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { normalizeAgentPhone } from '@/lib/agent-code'
import {
  checkIpLock,
  ipGuardMessage,
  ipGuardRetryAfter,
  recordIpFailure,
} from '@/lib/auth-lookup-guard'

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
// minimale : ne renvoie que l'identifiant interne, le nom, le code agent et
// la zone — JAMAIS le numéro de téléphone (AUDIT-005 : une route publique
// pré-auth ne doit pas confirmer qu'un numéro donné porte un compte actif,
// l'app terrain connaît déjà le numéro qu'elle vient de saisir). La
// recherche accepte un numéro de téléphone (normalisé) ou un code agent
// (JID-XXXX, insensible à la casse).

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rawQuery = (searchParams.get('query') || '').trim()
  if (!rawQuery) {
    return NextResponse.json({ erreur: 'Paramètre query requis (numéro de téléphone ou code agent)' }, { status: 400 })
  }

  // AUDIT-005 F-01 : verrou IP partagé en base (auth_lockouts, RPC
  // atomiques) au lieu d'une Map locale au process. Fail-open contractuel.
  const ipLock = await checkIpLock(request)
  if (ipLock.locked) {
    return NextResponse.json(
      { erreur: ipGuardMessage(ipLock.retryAfterSeconds) },
      { status: 429, headers: ipGuardRetryAfter(ipLock) }
    )
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
      // Sonde d'un compte inconnu ou désactivé : comptée dans le quota IP
      // partagé (un énumérateur de comptes se verrouille comme un
      // brute-forcer). On ne distingue pas « inconnu » et « désactivé » :
      // pas de fuite d'information sur l'existence d'un compte inactif.
      await recordIpFailure(request)
      return NextResponse.json({ found: false })
    }

    return NextResponse.json({
      found: true,
      id: data.id,
      name: data.name,
      firstName: ('first_name' in data ? (data.first_name as string | null) : null) || data.name,
      lastName: ('last_name' in data ? (data.last_name as string | null) : null) || '',
      agentCode: ('agent_code' in data ? (data.agent_code as string | null) : null) || undefined,
      // AUDIT-005 : phone volontairement ABSENT de la réponse — donnée
      // personnelles exposée par une route pré-auth sans nécessité (l'app
      // connaît le numéro qu'elle vient de saisir ; la session claim
      // s'appuie sur `id`, conservé).
      zone: data.zone,
    })
  } catch (error) {
    console.error('Erreur lookup identificateur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la vérification du compte' }, { status: 500 })
  }
}
