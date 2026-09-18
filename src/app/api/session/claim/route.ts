import { NextRequest, NextResponse } from 'next/server'
import {
  claimDeviceSession,
  deviceSessionCookieOptions,
  subjectFor,
  DEVICE_SESSION_COOKIE,
  type DeviceSubjectType,
} from '@/lib/device-session'
import { createNotification } from '@/lib/notifications/server'

const VALID_TYPES: DeviceSubjectType[] = ['merchant', 'producteur', 'identificateur']

const WELCOME_MESSAGE: Record<DeviceSubjectType, string> = {
  merchant: "Bienvenue sur Jùlaba ! Enregistrez vos ventes, suivez votre stock et vos dépenses au quotidien.",
  producteur: "Bienvenue sur Jùlaba ! Déclarez vos récoltes et suivez vos commandes directement depuis l'application.",
  identificateur: "Bienvenue sur Jùlaba ! Vos dossiers soumis seront suivis ici, avec une notification dès qu'un dossier est validé ou rejeté.",
}

// Called right after a login succeeds to bind this device to that account
// server-side (or to renew that binding on a later login from the same
// device). For merchant/producteur this is only ever a renewal now — the
// initial claim happens inside /api/merchant/login and /api/producteur/login
// themselves, right after they verify the account's real credential hash, so
// a bare subjectType+id here can never claim an account nobody has proven
// ownership of yet (see claimDeviceSession's requireExisting doc) — and a
// device without the account's cookie can't take it over either: those roles
// switch devices through their login route, which checks the real code.
// identificateur has no server-side credential to verify against (local-only
// PIN), so its claim stays open here — first claim AND takeover alike, same
// documented trust level; without takeover an agent changing phones would be
// locked out with no route able to re-bind them.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { subjectType, id } = body

    if (!VALID_TYPES.includes(subjectType) || typeof id !== 'string' || !id) {
      return NextResponse.json({ erreur: 'subjectType et id requis' }, { status: 400 })
    }

    const requireExisting = subjectType === 'merchant' || subjectType === 'producteur'
    const result = await claimDeviceSession(subjectFor(subjectType, id), request, {
      requireExisting,
      allowTakeover: !requireExisting,
    })
    if (!result.ok) {
      return NextResponse.json({ erreur: result.error }, { status: result.status })
    }

    if (result.isNew) {
      await createNotification({
        subjectType, subjectId: id, type: 'bienvenue',
        title: 'Bienvenue sur Jùlaba', body: WELCOME_MESSAGE[subjectType as DeviceSubjectType],
      })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set(DEVICE_SESSION_COOKIE, result.token, deviceSessionCookieOptions(result.expiresAt))
    return response
  } catch (error) {
    console.error('[API session/claim]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
