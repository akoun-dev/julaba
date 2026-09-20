import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { normalizeAuthPhone } from '@/lib/auth-multi'

// GET - Unified multi-user lookup for the shared marchand/producteur entry
// screen. The user types a single phone number; the app detects which type
// of account it belongs to and routes the login (and the post-login
// redirect) accordingly — no role picker needed.
//
// - Checks `merchants` and `producers` in parallel. A phone present in both
//   tables is treated as marchand (priority merchant: a producer who becomes
//   a merchant keeps logging into their merchant space; this overlap should
//   not exist in practice).
// - No credential hash is ever returned here — verification happens through
//   the role-specific POST /api/merchant/login and /api/producteur/login.
// - 404 with a generic error when the phone has no account: only an
//   identificateur can create accounts (see /api/backoffice/enrolments).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const phone = searchParams.get('phone')

    if (!phone) {
      return NextResponse.json({ error: 'Phone requis' }, { status: 400 })
    }
    // Normalisation défensive côté serveur : le client envoie déjà le numéro
    // normalisé, mais tout appelant direct (test, curl, futur client) doit
    // obtenir le même résultat avec « +225 07 … » ou « 07 … ».
    const normalizedPhone = normalizeAuthPhone(phone)

    const supabase = createSupabaseAdminClient()

    // MODE-921 — les coopérateurs sont détectés par le même lookup unifié
    // (priorité : marchand > producteur > coopérateur ; voir le commentaire
    // d'en-tête — l'ordre évite toute ambiguïté de numéro).
    const [merchantRes, producteurRes, cooperateurRes] = await Promise.all([
      supabase
        .from('merchants')
        .select('id, first_name, phone, auth_method, sexe, pin_hash, pattern_hash, visual_code_hash')
        .eq('phone', normalizedPhone)
        .maybeSingle(),
      supabase
        .from('producers')
        .select('id, first_name, phone, auth_method, sexe, pin_hash, pattern_hash')
        .eq('phone', normalizedPhone)
        .maybeSingle(),
      supabase
        .from('cooperateurs')
        .select('id, first_name, phone, auth_method, sexe, pin_hash, pattern_hash')
        .eq('phone', normalizedPhone)
        .maybeSingle(),
    ])

    const merchant = merchantRes.data
    const producteur = producteurRes.data

    if (merchant) {
      return NextResponse.json({
        found: true,
        role: 'marchand',
        id: merchant.id,
        firstName: merchant.first_name,
        phone: merchant.phone,
        authMethod: merchant.auth_method,
        authMethods: [
          merchant.pin_hash && 'pin',
          merchant.pattern_hash && 'pattern',
          merchant.visual_code_hash && 'visual',
        ].filter(Boolean),
        sexe: merchant.sexe || null,
      })
    }

    if (producteur) {
      return NextResponse.json({
        found: true,
        role: 'producteur',
        id: producteur.id,
        firstName: producteur.first_name,
        phone: producteur.phone,
        authMethod: producteur.auth_method,
        authMethods: [
          producteur.pin_hash && 'pin',
          producteur.pattern_hash && 'pattern',
        ].filter(Boolean),
        sexe: producteur.sexe || null,
      })
    }

    const cooperateur = cooperateurRes.data
    if (cooperateur) {
      return NextResponse.json({
        found: true,
        role: 'cooperateur',
        id: cooperateur.id,
        firstName: cooperateur.first_name,
        phone: cooperateur.phone,
        authMethod: cooperateur.auth_method,
        authMethods: [
          cooperateur.pin_hash && 'pin',
          cooperateur.pattern_hash && 'pattern',
        ].filter(Boolean),
        sexe: cooperateur.sexe || null,
      })
    }

    return NextResponse.json({ error: 'Compte non trouvé' }, { status: 404 })
  } catch (error) {
    console.error('[API auth/lookup]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
