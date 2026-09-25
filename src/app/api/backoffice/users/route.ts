import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, hashPassword, logAudit } from '@/lib/backoffice-auth'
import { formatZodError } from '@/lib/validation/marchand'
import { ROLE_HIERARCHY } from '@/lib/backoffice-permissions'
import { invariantCreationRole, invariantModificationCompte } from '@/lib/backoffice/users-invariants'

const SAFE_COLUMNS = 'id, email, name, role, zone, is_active, last_login, force_password_change, created_at, updated_at'

// MODE-1007 — portes Zod POST/PATCH. email/name/role (POST) et id (PATCH)
// ont déjà leurs 400 manuels testés (« L'email, le nom et le role sont
// obligatoires », « L'identifiant est obligatoire ») → nullish pour que CES
// messages continuent de sortir. role est jugé par estBoRole (garde
// manuelle type-agnostique, « Role inconnu » / « Role inconnu » du PATCH)
// → z.unknown() ; isActive est écrit dans la colonne boolean →
// z.boolean().optional() (un null plantait en 500) ; zone/name (PATCH) et
// zone (POST) sont des colonnes text à fallback nullish → chaînes nullish.
const createUserSchema = z.object({
  email: z.string().nullish(),
  name: z.string().nullish(),
  role: z.unknown().optional(),
  zone: z.string().nullish(),
})

const updateUserSchema = z.object({
  id: z.string().nullish(),
  role: z.unknown().optional(),
  isActive: z.boolean().optional(),
  zone: z.string().nullish(),
  name: z.string().nullish(),
})

// A11-F15 (AUDIT-011) : le rôle écrit en base est validé contre la
// hiérarchie (clés de ROLE_HIERARCHY = l'union exacte des BoRole) — avant,
// n'importe quelle chaîne de requête devenait le `role` du compte
// (élévation de fait d'un compte vers un rôle inexistant ou erroné).
function estBoRole(valeur: unknown): valeur is keyof typeof ROLE_HIERARCHY {
  return typeof valeur === 'string' && valeur in ROLE_HIERARCHY
}

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'utilisateurs', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { data: users, error } = await supabase
      .from('bo_users')
      .select(SAFE_COLUMNS)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(users)
  } catch (error) {
    console.error('Erreur listage utilisateurs:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des utilisateurs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'utilisateurs', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const parsed = createUserSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { email, name, role, zone } = body

    if (!email || !name || !role) {
      return NextResponse.json({ erreur: 'L\'email, le nom et le role sont obligatoires' }, { status: 400 })
    }
    // A11-F15 : rôle validé contre l'union des BoRole (aucune chaîne libre).
    if (!estBoRole(role)) {
      return NextResponse.json({ erreur: 'Role inconnu' }, { status: 400 })
    }
    // AUDIT-012 P1-9 : aucun agent ne crée un compte de rôle supérieur au sien
    // (responsabilité traçable — l'invariant vit côté SERVEUR).
    const invariant = invariantCreationRole(auth.user.role, role)
    if (!invariant.ok) {
      return NextResponse.json({ erreur: invariant.erreur }, { status: invariant.status })
    }

    const supabase = createSupabaseAdminClient()

    const { data: existing } = await supabase
      .from('bo_users')
      .select('id')
      .eq('email', email)
      .single()

    if (existing) {
      return NextResponse.json({ erreur: 'Un utilisateur avec cet email existe deja' }, { status: 400 })
    }

    const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
    const { data: user, error } = await supabase
      .from('bo_users')
      .insert({
        email,
        password_hash: hashPassword(tempPassword),
        name,
        role,
        zone: zone || null,
        force_password_change: true,
      })
      .select(SAFE_COLUMNS)
      .single()

    if (error) throw error

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'user_create', module: 'utilisateurs', details: `Création de ${email} (${role})`, request,
    })

    return NextResponse.json({ ...user, tempPassword }, { status: 201 })
  } catch (error) {
    console.error('Erreur creation utilisateur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de l\'utilisateur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'utilisateurs', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const parsed = updateUserSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { id, role, isActive, zone, name } = body

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    // AUDIT-012 P1-9 : invariants de gouvernance — la cible est lue AVANT
    // toute écriture (rôle actuel, activité, présence parmi les
    // super_admins actifs) pour décider côté serveur.
    const { data: cible, error: cibleError } = await supabase
      .from('bo_users')
      .select('id, role, is_active')
      .eq('id', id)
      .single()
    if (cibleError || !cible) {
      return NextResponse.json({ erreur: 'Utilisateur introuvable' }, { status: 404 })
    }
    const desactiveCible = isActive === false
    let autresSuperAdminsActifs = 0
    if (cible.role === 'super_admin' && (desactiveCible || (typeof role === 'string' && role !== 'super_admin'))) {
      const { count } = await supabase
        .from('bo_users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'super_admin')
        .eq('is_active', true)
        .neq('id', id)
      autresSuperAdminsActifs = count ?? 0
    }
    const invariant = invariantModificationCompte({
      roleActeur: auth.user.role,
      roleCible: String(cible.role),
      cibleEstActeur: id === auth.user.id,
      rolePropose: role ? String(role) : undefined,
      desactiveCible,
      autresSuperAdminsActifs,
    })
    if (!invariant.ok) {
      return NextResponse.json({ erreur: invariant.erreur }, { status: invariant.status })
    }

    const data: Record<string, unknown> = {}
    if (role) {
      // A11-F15 : rôle validé contre l'union des BoRole (aucune chaîne libre).
      if (!estBoRole(role)) {
        return NextResponse.json({ erreur: 'Role inconnu' }, { status: 400 })
      }
      data.role = role
    }
    if (isActive !== undefined) data.is_active = isActive
    if (zone !== undefined) data.zone = zone
    if (name) data.name = name

    const { data: user, error } = await supabase
      .from('bo_users')
      .update(data)
      .eq('id', id)
      .select(SAFE_COLUMNS)
      .single()

    if (error) throw error

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'user_update', module: 'utilisateurs', details: `Mise à jour de ${user.email}: ${JSON.stringify(data)}`, request,
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error('Erreur mise a jour utilisateur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de l\'utilisateur' }, { status: 500 })
  }
}
