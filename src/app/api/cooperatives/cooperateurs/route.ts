import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { hashCodeScrypt } from '@/lib/auth-pin'
import {
  checkIpLock,
  ipGuardMessage,
  ipGuardRetryAfter,
  recordIpFailure,
} from '@/lib/auth-lookup-guard'

// MODE-921 (§2.1) — comptes coopérateurs.
//
// GET : vérifie si un numéro possède un compte coopérateur et quelle
// méthode d'auth il utilise (miroir GET /api/producteur — aucun hash
// n'est jamais renvoyé). MODE-937 (S-04) : l'ID n'est plus renvoyé —
// il ne se reçoit qu'après une connexion vérifiée.
//
// POST : auto-provisioning à l'inscription (comme le rôle cooperateur de
// julaba-app) : crée le compte coopérateur ET sa coopérative en une seule
// transaction logique. MODE-936 (S-03) : le client envoie le code BRUT
// (`pin` / `pattern`) — le hachage scrypt est SERVEUR, le djb2 client ne
// traverse plus le réseau. Les anciennes charges `pinHash`/`patternHash`
// (files offline pré-update) restent acceptées telles quelles : le login
// les re-hashera transparentment au premier succès.
//
// Unicité : téléphone unique (compte) ET responsable_id unique (UNE
// coopérative par responsable — contrainte en base, 409 propre ici).
//
// A11-F05 (AUDIT-011) : les deux méthodes sont volontairement pré-auth,
// donc bornées par la garde IP partagée en base (fail-open). GET : verrou
// à l'entrée + échec compté sur « non trouvé » (la réponse 404 vs found
// est un oracle d'énumération). POST : verrou à l'entrée, et chaque
// création (201) ou conflit de numéro (409 — oracle « ce numéro existe »)
// consomme le même quota : 20 créations/sondes en 5 min depuis une IP →
// verrou 15 min. Les rejets de VALIDATION (400) ne consomment pas — un
// inscrit légitime qui se trompe de champ ne doit pas s'auto-verrouiller.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const phone = searchParams.get('phone')
    if (!phone) {
      return NextResponse.json({ error: 'Phone requis' }, { status: 400 })
    }
    // A11-F05 : verrou IP partagé avant toute lecture de compte.
    const ipLock = await checkIpLock(req)
    if (ipLock.locked) {
      return NextResponse.json(
        { error: ipGuardMessage(ipLock.retryAfterSeconds) },
        { status: 429, headers: ipGuardRetryAfter(ipLock) }
      )
    }
    const supabase = createSupabaseAdminClient()
    const { data: cooperateur, error } = await supabase
      .from('cooperateurs')
      .select('id, first_name, phone, auth_method, sexe')
      .eq('phone', phone)
      .maybeSingle()
    if (error || !cooperateur) {
      // A11-F05 : sonde d'un numéro sans compte — comptée dans le quota.
      await recordIpFailure(req)
      return NextResponse.json({ error: 'Coopérateur non trouvé' }, { status: 404 })
    }
    return NextResponse.json({
      found: true,
      role: 'cooperateur',
      firstName: cooperateur.first_name,
      phone: cooperateur.phone,
      authMethod: cooperateur.auth_method,
      sexe: cooperateur.sexe || null,
    })
  } catch (error) {
    console.error('[API cooperatives/cooperateurs GET]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    // A11-F05 : verrou IP avant tout traitement (auto-provisioning illimité
    // = spam de comptes et de coopératives sans cette borne).
    const ipLock = await checkIpLock(req)
    if (ipLock.locked) {
      return NextResponse.json(
        { erreur: ipGuardMessage(ipLock.retryAfterSeconds) },
        { status: 429, headers: ipGuardRetryAfter(ipLock) }
      )
    }
    const { firstName, phone, authMethod, pin, pattern, pinHash, patternHash, nomCooperative, commune, sexe } =
      await req.json()

    // MODE-936 : le code brut prime (haché scrypt serveur) ; sinon on garde
    // le hash hérité d'une file offline pré-update (re-hash transparent au
    // 1er login — voir auth-pin.ts).
    const pinStorage = typeof pin === 'string' && pin ? hashCodeScrypt(pin)
      : typeof pinHash === 'string' && pinHash ? pinHash : null
    const patternStorage = typeof pattern === 'string' && pattern ? hashCodeScrypt(pattern)
      : typeof patternHash === 'string' && patternHash ? patternHash : null

    const prenom = typeof firstName === 'string' ? firstName.trim() : ''
    const nom = typeof nomCooperative === 'string' ? nomCooperative.trim() : ''
    if (!prenom || prenom.length > 60) {
      return NextResponse.json({ erreur: 'Prénom requis (60 caractères max)' }, { status: 400 })
    }
    if (!nom || nom.length < 2 || nom.length > 120) {
      return NextResponse.json(
        { erreur: 'Nom de la coopérative requis (2-120 caractères)' },
        { status: 400 }
      )
    }
    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ erreur: 'Téléphone requis' }, { status: 400 })
    }
    const method = authMethod === 'pattern' ? 'pattern' : 'pin'
    if (method === 'pin' && !pinStorage) {
      return NextResponse.json({ erreur: 'Code secret requis' }, { status: 400 })
    }
    if (method === 'pattern' && !patternStorage) {
      return NextResponse.json({ erreur: 'Schéma requis' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    // Le numéro doit être libre dans les DEUX tables d'auth (un numéro = un
    // espace) — le lookup unifié tranche le rôle au login, il ne faut pas
    // créer d'ambiguïté qu'aucune priorité ne résoudra proprement.
    const { data: marchandExistant } = await supabase
      .from('merchants')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()
    if (marchandExistant) {
      // A11-F05 : conflit de numéro = oracle « ce numéro a déjà un espace »
      // — consomme le même quota qu'une création.
      await recordIpFailure(req)
      return NextResponse.json(
        { erreur: 'Ce numéro possède déjà un espace marchand' },
        { status: 409 }
      )
    }
    const { data: producteurExistant } = await supabase
      .from('producers')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()
    if (producteurExistant) {
      // A11-F05 : même oracle, même comptage.
      await recordIpFailure(req)
      return NextResponse.json(
        { erreur: 'Ce numéro possède déjà un espace producteur' },
        { status: 409 }
      )
    }

    // Idempotence d'inscription : si le compte existe déjà avec le même
    // numéro, on renvoie 409 (le client proposera de se connecter).
    const { data: coopExistant } = await supabase
      .from('cooperateurs')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()
    if (coopExistant) {
      // A11-F05 : même oracle, même comptage.
      await recordIpFailure(req)
      return NextResponse.json(
        { erreur: 'Ce numéro possède déjà un espace coopérative — connectez-vous' },
        { status: 409 }
      )
    }

    const { data: cooperateur, error: errCoop } = await supabase
      .from('cooperateurs')
      .insert({
        first_name: prenom,
        phone,
        auth_method: method,
        pin_hash: method === 'pin' ? pinStorage : null,
        pattern_hash: method === 'pattern' ? patternStorage : null,
        sexe: typeof sexe === 'string' && ['masculin', 'feminin', 'autre'].includes(sexe) ? sexe : null,
      })
      .select('id, first_name, phone')
      .single()
    if (errCoop || !cooperateur) throw errCoop ?? new Error('Création compte impossible')

    // Auto-provisioning : la coopérative naît avec son responsable.
    const { data: cooperative, error: errCooperative } = await supabase
      .from('cooperatives')
      .insert({
        nom: nom,
        responsable_id: cooperateur.id,
        commune: typeof commune === 'string' && commune.trim() ? commune.trim() : null,
      })
      .select('id, nom')
      .single()
    if (errCooperative || !cooperative) {
      // Filet anti-course : si le compte est né mais pas la coopérative, le
      // compte sans coopérative est inutilisable — on le retire pour laisser
      // une réinscription propre. MODE-942 (AUDIT-003 F-13) : le 23505 de
      // responsable_id (UNE coopérative par responsable) est annoncé comme
      // un 409 LISIBLE, pas comme un 500 générique.
      await supabase.from('cooperateurs').delete().eq('id', cooperateur.id)
      if ((errCooperative as { code?: string } | null)?.code === '23505') {
        return NextResponse.json(
          { erreur: 'Cette coopérative a déjà un responsable — une seule inscription est possible. Connectez-vous avec le compte existant.' },
          { status: 409 }
        )
      }
      throw errCooperative ?? new Error('Création coopérative impossible')
    }

    // A11-F05 : création acceptée — consomme le quota POST (20/5 min/IP).
    await recordIpFailure(req)
    return NextResponse.json(
      { id: cooperateur.id, firstName: cooperateur.first_name, phone: cooperateur.phone, cooperativeId: cooperative.id, cooperativeNom: cooperative.nom },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API cooperatives/cooperateurs POST]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
