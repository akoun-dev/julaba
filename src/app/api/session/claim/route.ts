import { NextRequest, NextResponse } from 'next/server'
import {
  claimDeviceSession,
  deviceSessionCookieOptions,
  subjectFor,
  DEVICE_SESSION_COOKIE,
  type DeviceSubjectType,
} from '@/lib/device-session'
import { createNotification } from '@/lib/notifications'

const VALID_TYPES: DeviceSubjectType[] = ['merchant', 'producteur', 'identificateur']

const WELCOME_MESSAGE: Record<DeviceSubjectType, string> = {
  merchant: "Bienvenue sur Jùlaba ! Enregistrez vos ventes, suivez votre stock et vos dépenses au quotidien.",
  producteur: "Bienvenue sur Jùlaba ! Déclarez vos récoltes et suivez vos commandes directement depuis l'application.",
  identificateur: "Bienvenue sur Jùlaba ! Vos dossiers soumis seront suivis ici, avec une notification dès qu'un dossier est validé ou rejeté.",
}

// Called right after a local login/registration succeeds (marchand,
// producteur, identificateur all authenticate purely on-device — see
// device-session.ts) to bind this device to that account server-side. Open
// by design (no auth required to call it): claiming is how a device proves
// it's a given subject in the first place, first-claim-wins.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { subjectType, id } = body

    if (!VALID_TYPES.includes(subjectType) || typeof id !== 'string' || !id) {
      return NextResponse.json({ erreur: 'subjectType et id requis' }, { status: 400 })
    }

    const result = await claimDeviceSession(subjectFor(subjectType, id), request)
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
