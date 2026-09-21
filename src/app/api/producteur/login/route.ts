import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { claimDeviceSession, deviceSessionCookieOptions, subjectFor, DEVICE_SESSION_COOKIE, issueLiaisonCode } from '@/lib/device-session'
import { verifyLoginWithLockout } from '@/lib/auth-login-server'
import { LIAISON_TTL_LOGIN_MS } from '@/lib/liaison-code'
import { createNotification } from '@/lib/notifications/server'

// MODE-936 (AUDIT-003 S-03) : vérification du code BRUT côté serveur
// (scrypt + lockout partagés — voir auth-login-server.ts et le commentaire
// complet de /api/merchant/login). Miroir exact de la route marchand.
export async function POST(req: NextRequest) {
  try {
    const { phone, method, code } = await req.json()

    if (!phone || !['pin', 'pattern'].includes(method)) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const verification = await verifyLoginWithLockout({
      table: 'producers', phone, method, code, request: req,
    })
    if (!verification.ok) {
      const response = NextResponse.json({ error: verification.error }, { status: verification.status })
      if (verification.retryAfterSeconds) {
        response.headers.set('Retry-After', String(verification.retryAfterSeconds))
      }
      return response
    }
    const producteur = verification.account

    // Le code vient d'être vérifié côté serveur : cet appareil a prouvé sa
    // légitimité, il peut donc (re)lier la session même si le compte était
    // déjà lié à un autre appareil (voir /api/merchant/login).
    const claim = await claimDeviceSession(subjectFor('producteur', producteur.id), req, { allowTakeover: true })
    if (!claim.ok) {
      return NextResponse.json({ error: claim.error }, { status: claim.status })
    }
    if (claim.isNew) {
      await createNotification({
        subjectType: 'producteur', subjectId: producteur.id, type: 'bienvenue',
        title: 'Bienvenue sur Jùlaba',
        body: "Bienvenue sur Jùlaba ! Déclarez vos récoltes et suivez vos commandes directement depuis l'application.",
      })
    }

    // MODE-937 (S-04) : code de liaison one-shot 10 min, best-effort
    // (voir /api/merchant/login).
    let liaisonCode: string | null = null
    try {
      liaisonCode = (await issueLiaisonCode('producteur', producteur.id, LIAISON_TTL_LOGIN_MS, 'login')).code
    } catch (liaisonError) {
      console.error('[API producteur/login] liaison code', liaisonError)
    }

    const response = NextResponse.json({ id: producteur.id, firstName: producteur.first_name, phone: producteur.phone, sexe: producteur.sexe || null, liaisonCode })
    response.cookies.set(DEVICE_SESSION_COOKIE, claim.token, deviceSessionCookieOptions(claim.expiresAt))
    return response
  } catch (error) {
    console.error('[API producteur/login]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
