import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getDeviceSubject } from '@/lib/device-session'
import { hashCodeScrypt } from '@/lib/auth-pin'

// PATCH - Update merchant credentials (PIN / pattern / visual code).
// Used by the biometric recovery flow: after the user proves identity via
// biometrics and sets a new code, it is stored here so other devices or
// future registrations stay in sync.
//
// MODE-936 (AUDIT-003 S-03) : le client envoie le code BRUT (`pin`,
// `pattern`, `visualCode`) — le hachage scrypt est SERVEUR. Les anciens
// champs hashés (`pinHash`, `patternHash`, `visualCodeHash`) restent
// acceptés pour les reprises offline pré-update (re-hash transparent au
// 1er login).
//
// SECURITY: requires a valid device session whose subject matches the
// merchant being updated — without this, anyone who knows a phone number
// could overwrite the authentication hash and take over the account.
export async function PATCH(req: NextRequest) {
  try {
    const { phone, authMethod, pin, pattern, visualCode, pinHash, patternHash, visualCodeHash } = await req.json()

    if (!phone) {
      return NextResponse.json({ error: 'Phone requis' }, { status: 400 })
    }

    // Require a device session — the caller must prove they own this
    // merchant account (biometric recovery flow happens after the user
    // authenticated locally on this device).
    const subject = await getDeviceSubject(req)
    if (!subject) {
      return NextResponse.json({ error: 'Session appareil requise' }, { status: 401 })
    }

    const supabase = createSupabaseAdminClient()

    const { data: existing, error: findError } = await supabase
      .from('merchants')
      .select('*')
      .eq('phone', phone)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ error: 'Marchand non trouvé' }, { status: 404 })
    }

    // Verify the device session belongs to the merchant being updated.
    // Subject format is "merchant:<id>" — see device-session.ts.
    if (subject !== `merchant:${existing.id}`) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const data: Record<string, unknown> = {}
    if (authMethod) data.auth_method = authMethod
    // MODE-936 : le brut prime (scrypt serveur), l'ancien champ hashé reste
    // accepté (reprise offline pré-update).
    if (pin !== undefined) data.pin_hash = typeof pin === 'string' && pin ? hashCodeScrypt(pin) : pinHash
    if (pattern !== undefined) data.pattern_hash = typeof pattern === 'string' && pattern ? hashCodeScrypt(pattern) : patternHash
    if (visualCode !== undefined) data.visual_code_hash = typeof visualCode === 'string' && visualCode ? hashCodeScrypt(visualCode) : visualCodeHash

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('merchants')
      .update(data)
      .eq('phone', phone)
      .select('id, phone')
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ id: updated.id, phone: updated.phone })
  } catch (error) {
    console.error('Erreur mise à jour marchand:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// GET supprimé (AUDIT-003 S-05, MODE-934) : l'ancien lookup public par
// téléphone n'avait aucune garde et exposait id/prénom/sexe/authMethods
// (énumération de comptes) — de surcroît sans aucun consommateur depuis la
// bascule vers le lookup unifié /api/auth/lookup (auth-screen). La seule
// opération de cette route reste le PATCH des identifiants ci-dessus.
