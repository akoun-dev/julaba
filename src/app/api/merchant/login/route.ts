import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { claimDeviceSession, deviceSessionCookieOptions, subjectFor, DEVICE_SESSION_COOKIE } from '@/lib/device-session'
import { verifyLoginWithLockout } from '@/lib/auth-login-server'
import { createNotification } from '@/lib/notifications/server'

// Verifies a login attempt against the server-stored credential (set by an
// identificateur at enrollment — see /api/backoffice/enrolments POST).
// MODE-936 (AUDIT-003 S-03) : le client envoie le code BRUT (jamais un
// hash) — la vérification et le hachage scrypt sont serveur (voir
// auth-login-server.ts, qui porte aussi le lockout 5/15 min par compte et
// 20/5 min par IP). L'ancien contrat « hash djb2 sur le fil » est
// supprimé : ce hash valait mot de passe (pass-the-hash).
//
// On success this also performs the device's *first* claim on this account
// (see claimDeviceSession's requireExisting doc) — binding the device here,
// right after the code is actually verified, is what stops someone from
// claiming an account they never proved they could log into by calling
// /api/session/claim directly with a guessed id. The client still calls that
// route afterward (from setAuth), which by then only ever renews the
// session this route just created.
//
// On success the client also caches {id, firstName, phone, authMethod, hash}
// locally (secure storage — le hash local sert uniquement au login hors
// ligne sur CE device) so the device can keep logging in offline afterwards.
export async function POST(req: NextRequest) {
  try {
    const { phone, method, code } = await req.json()

    if (!phone || !['pin', 'pattern', 'visual'].includes(method)) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const verification = await verifyLoginWithLockout({
      table: 'merchants', phone, method, code, request: req,
    })
    if (!verification.ok) {
      const response = NextResponse.json({ error: verification.error }, { status: verification.status })
      if (verification.retryAfterSeconds) {
        response.headers.set('Retry-After', String(verification.retryAfterSeconds))
      }
      return response
    }
    const merchant = verification.account

    // Le code vient d'être vérifié côté serveur : cet appareil a prouvé sa
    // légitimité, il peut donc (re)lier la session même si le compte était
    // déjà lié à un autre appareil (changement de téléphone, second appareil,
    // cookies nettoyés…) — l'ancien appareil devra juste se reconnecter.
    const claim = await claimDeviceSession(subjectFor('merchant', merchant.id), req, { allowTakeover: true })
    if (!claim.ok) {
      return NextResponse.json({ error: claim.error }, { status: claim.status })
    }
    if (claim.isNew) {
      await createNotification({
        subjectType: 'merchant', subjectId: merchant.id, type: 'bienvenue',
        title: 'Bienvenue sur Jùlaba',
        body: "Bienvenue sur Jùlaba ! Enregistrez vos ventes, suivez votre stock et vos dépenses au quotidien.",
      })
    }

    let sexe = merchant.sexe || null
    if (!sexe) {
      const supabase = createSupabaseAdminClient()
      const { data: enrolment } = await supabase
        .from('legacy_bo_enrolments')
        .select('sexe')
        .eq('phone', merchant.phone || phone)
        .not('sexe', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      sexe = enrolment?.sexe || null
      if (sexe) await supabase.from('merchants').update({ sexe }).eq('id', merchant.id)
    }

    // Classification marchand (détaillant / semi-grossiste / grossiste) :
    // même schéma de dérivation que sexe — si le profil de connexion ne la
    // porte pas encore (comptes antérieurs à la classification), elle est
    // récupérée depuis le dossier d'enrôlement le plus récent puis rapatriée.
    let categorieMarchand = merchant.categorie_marchand || null
    if (!categorieMarchand) {
      const supabase = createSupabaseAdminClient()
      const { data: enrolment } = await supabase
        .from('legacy_bo_enrolments')
        .select('categorie_marchand')
        .eq('phone', merchant.phone || phone)
        .eq('actor_type', 'marchand')
        .not('categorie_marchand', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      categorieMarchand = enrolment?.categorie_marchand || null
      if (categorieMarchand) await supabase.from('merchants').update({ categorie_marchand: categorieMarchand }).eq('id', merchant.id)
    }

    const response = NextResponse.json({
      id: merchant.id,
      firstName: merchant.first_name,
      phone: merchant.phone,
      sexe,
      categorie: categorieMarchand,
    })
    response.cookies.set(DEVICE_SESSION_COOKIE, claim.token, deviceSessionCookieOptions(claim.expiresAt))
    return response
  } catch (error) {
    console.error('[API merchant/login]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
