import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { claimDeviceSession, deviceSessionCookieOptions, subjectFor, DEVICE_SESSION_COOKIE } from '@/lib/device-session'
import { createNotification } from '@/lib/notifications/server'

type AuthMethod = 'pin' | 'pattern'
const HASH_FIELD: Record<AuthMethod, 'pin_hash' | 'pattern_hash'> = {
  pin: 'pin_hash',
  pattern: 'pattern_hash',
}

// MODE-921 (§2.2) — login coopérateur. Miroir exact de /api/producteur/login
// (voir ce fichier pour le raisonnement complet) : le hash vient d'être
// vérifié côté serveur, l'appareil peut donc (re)lier sa session — même
// contrat de claim, mêmes erreurs, même cookie.

export async function POST(req: NextRequest) {
  try {
    const { phone, method, hash } = await req.json()

    if (!phone || !hash || !['pin', 'pattern'].includes(method)) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: cooperateur } = await supabase
      .from('cooperateurs')
      .select('*')
      .eq('phone', phone)
      .single()
    if (!cooperateur) {
      return NextResponse.json({ error: 'Coopérateur non trouvé' }, { status: 404 })
    }

    const field = HASH_FIELD[method as AuthMethod]
    if (cooperateur.auth_method !== method || !cooperateur[field] || cooperateur[field] !== hash) {
      return NextResponse.json({ error: 'Code incorrect' }, { status: 401 })
    }

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
    const { data: cooperative } = await supabase
      .from('cooperatives')
      .select('id, nom, commune')
      .eq('responsable_id', cooperateur.id)
      .maybeSingle()

    const response = NextResponse.json({
      id: cooperateur.id,
      firstName: cooperateur.first_name,
      phone: cooperateur.phone,
      sexe: cooperateur.sexe || null,
      cooperativeId: cooperative?.id ?? null,
      cooperativeNom: cooperative?.nom ?? null,
      commune: cooperative?.commune ?? null,
    })
    response.cookies.set(DEVICE_SESSION_COOKIE, claim.token, deviceSessionCookieOptions(claim.expiresAt))
    return response
  } catch (error) {
    console.error('[API cooperatives/cooperateurs/login]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
