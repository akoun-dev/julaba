import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'
import { formatZodError } from '@/lib/validation/marchand'

// MODE-1007 — portes Zod POST/PATCH. name/type (POST) et id (PATCH) ont
// déjà leurs 400 manuels (« Le nom et le type sont obligatoires »,
// « L'identifiant est obligatoire ») → nullish pour que CES messages
// continuent de sortir (null compris). Le PATCH consomme le corps en
// spread (rawData) : les 8 champs lus sont déclarés, les autres clés du
// body ne sont jamais lues. Colonnes text → chaînes nullish (null passe
// et garde son sens historique : champ envoyé tel quel / effacé).
const createInstitutionSchema = z.object({
  name: z.string().nullish(),
  type: z.string().nullish(),
  contactName: z.string().nullish(),
  contactEmail: z.string().nullish(),
  contactPhone: z.string().nullish(),
  address: z.string().nullish(),
  initials: z.string().nullish(),
  color: z.string().nullish(),
  website: z.string().nullish(),
})

const updateInstitutionSchema = z.object({
  id: z.string().nullish(),
  name: z.string().nullish(),
  type: z.string().nullish(),
  contactName: z.string().nullish(),
  contactEmail: z.string().nullish(),
  contactPhone: z.string().nullish(),
  address: z.string().nullish(),
  status: z.string().nullish(),
  website: z.string().nullish(),
})

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'institutions', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('legacy_bo_institutions')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Erreur listage institutions:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des institutions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'institutions', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const body = await request.json()
    const parsed = createInstitutionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { name, type, contactName, contactEmail, contactPhone, address, initials, color, website } = body

    if (!name || !type) {
      return NextResponse.json({ erreur: 'Le nom et le type sont obligatoires' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('legacy_bo_institutions')
      .insert({
        name,
        type,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        address,
        initials: initials || null,
        color: color || null,
        website: website || null,
        status: 'en_attente',
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Erreur creation institution:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de l\'institution' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'institutions', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const body = await request.json()
    const parsed = updateInstitutionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { id, ...rawData } = body

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (rawData.name !== undefined) data.name = rawData.name
    if (rawData.type !== undefined) data.type = rawData.type
    if (rawData.contactName !== undefined) data.contact_name = rawData.contactName
    if (rawData.contactEmail !== undefined) data.contact_email = rawData.contactEmail
    if (rawData.contactPhone !== undefined) data.contact_phone = rawData.contactPhone
    if (rawData.address !== undefined) data.address = rawData.address
    if (rawData.status !== undefined) data.status = rawData.status
    if (rawData.website !== undefined) data.website = rawData.website

    const { data: updated, error } = await supabase
      .from('legacy_bo_institutions')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Erreur mise a jour institution:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de l\'institution' }, { status: 500 })
  }
}
