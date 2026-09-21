import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { claimDeviceSession, deviceSessionCookieOptions, subjectFor, DEVICE_SESSION_COOKIE, issueLiaisonCode } from '@/lib/device-session'
import { verifyLoginWithLockout } from '@/lib/auth-login-server'
import { LIAISON_TTL_LOGIN_MS } from '@/lib/liaison-code'
import { createNotification } from '@/lib/notifications/server'

// MODE-921 (§2.2) — login coopérateur. Miroir exact de /api/producteur/login
// (voir ce fichier et /api/merchant/login pour le raisonnement complet) :
// MODE-936 — code BRUT vérifié côté serveur (scrypt + lockout partagés),
// le hash djb2 envoyé par le client appartient à l'histoire.
export async function POST(req: NextRequest) {
  try {
    const { phone, method, code } = await req.json()

    if (!phone || !['pin', 'pattern'].includes(method)) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const verification = await verifyLoginWithLockout({
      table: 'cooperateurs', phone, method, code, request: req,
    })
    if (!verification.ok) {
      const response = NextResponse.json({ error: verification.error }, { status: verification.status })
      if (verification.retryAfterSeconds) {
        response.headers.set('Retry-After', String(verification.retryAfterSeconds))
      }
      return response
    }
    const cooperateur = verification.account

    const claim = await claimDeviceSession(subjectFor('cooperateur', cooperateur.id), req, {
      allowTakeover: true,
    })
    if (!claim.ok) {
      return NextResponse.json({ error: claim.error }, { status: claim.status })
    }
    if (claim.isNew) {
      await createNotification({
        subjectType: 'cooperateur',
        subjectId: cooperateur.id,
        type: 'bienvenue',
        title: 'Bienvenue sur Jùlaba',
        body: 'Bienvenue sur Jùlaba ! Gérez votre coopérative : membres, trésorerie, stock commun et achats groupés.',
      })
    }

    // La coopérative du responsable est résolue serveur — l'écran d'accueil
    // l'affiche sans second aller-retour.
    const supabase = createSupabaseAdminClient()
    const { data: cooperative } = await supabase
      .from('cooperatives')
      .select('id, nom, commune')
      .eq('responsable_id', cooperateur.id)
      .maybeSingle()

    // MODE-937 (S-04) : code de liaison one-shot 10 min, best-effort
    // (voir /api/merchant/login).
    let liaisonCode: string | null = null
    try {
      liaisonCode = (await issueLiaisonCode('cooperateur', cooperateur.id, LIAISON_TTL_LOGIN_MS, 'login')).code
    } catch (liaisonError) {
      console.error('[API cooperatives/cooperateurs/login] liaison code', liaisonError)
    }

    const response = NextResponse.json({
      id: cooperateur.id,
      firstName: cooperateur.first_name,
      phone: cooperateur.phone,
      sexe: cooperateur.sexe || null,
      cooperativeId: cooperative?.id ?? null,
      cooperativeNom: cooperative?.nom ?? null,
      commune: cooperative?.commune ?? null,
      liaisonCode,
    })
    response.cookies.set(DEVICE_SESSION_COOKIE, claim.token, deviceSessionCookieOptions(claim.expiresAt))
    return response
  } catch (error) {
    console.error('[API cooperatives/cooperateurs/login]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
