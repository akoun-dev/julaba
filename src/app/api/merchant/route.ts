import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getDeviceSubject } from '@/lib/device-session'

// PATCH - Update merchant credentials (pinHash / patternHash / visualCodeHash).
// Used by the biometric recovery flow: after the user proves identity via
// biometrics and sets a new PIN, the new hash must be pushed to the server
// so other devices or future registrations stay in sync.
//
// SECURITY: requires a valid device session whose subject matches the
// merchant being updated — without this, anyone who knows a phone number
// could overwrite the authentication hash and take over the account.
export async function PATCH(req: NextRequest) {
  try {
    const { phone, authMethod, pinHash, patternHash, visualCodeHash } = await req.json()

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
    if (pinHash !== undefined) data.pin_hash = pinHash
    if (patternHash !== undefined) data.pattern_hash = patternHash
    if (visualCodeHash !== undefined) data.visual_code_hash = visualCodeHash

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
