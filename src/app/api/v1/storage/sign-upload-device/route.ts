import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getDeviceSubject } from '@/lib/device-session'

/**
 * PF-04 — sign-upload pour SESSIONS APPAREIL (hors auth.users).
 *
 * La route sœur /api/v1/storage/sign-upload exige une session auth.users
 * (`supabase.auth.getUser`) : les sessions appareil (cookie julaba_device,
 * table device_sessions) ne peuvent pas la consommer — les photos de
 * récoltes finissaient donc en DataURL base64 dans la colonne
 * legacy_producteur_recoltes.photos (lignes Postgres de plusieurs Mo).
 *
 * Cette route vérifie la session APPAREIL (royaume producteur), dérive le
 * chemin du subject DE LA SESSION (jamais d'un paramètre client), puis
 * retourne une URL d'upload signée : le binaire part directement au
 * Storage (authentifié par le token signé, PAS par JWT) — les policies
 * RLS ne s'appliquent pas à ce flux, aucun bucket n'a besoin d'être
 * public, et le serveur ne proxifie jamais le binaire.
 */

const inputSchema = z.object({
  bucket: z.enum(['harvest-photos']),
  fileName: z.string().regex(/^[a-zA-Z0-9._-]{1,120}$/),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

/** Extensions autorisées, cohérentes avec contentType (anti-divergence). */
const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function POST(request: NextRequest) {
  try {
    // Garde session appareil, royaume producteur uniquement (PF-04 :
    // photos de récoltes). 401/403 avant tout traitement — ordre
    // auth-avant-lookup (MODE-935 S-13).
    const subject = await getDeviceSubject(request)
    if (!subject) {
      return NextResponse.json({ error: 'Session appareil requise' }, { status: 401 })
    }
    if (!subject.startsWith('producteur:')) {
      return NextResponse.json({ error: 'Accès refusé à cette ressource' }, { status: 403 })
    }
    const producteurId = subject.slice('producteur:'.length)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
    }

    const parsed = inputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Paramètres de fichier invalides' }, { status: 422 })
    }

    const { bucket, contentType } = parsed.data

    // Le chemin est construit SERVEUR : <producteurId>/<uuid>.<ext>
    // — non énumérable (UUID aléatoire), le nom client est décoratif.
    const ext = EXT_BY_CONTENT_TYPE[contentType]
    const path = `${producteurId}/${crypto.randomUUID()}.${ext}`

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path)
    if (error || !data) {
      console.error('[storage sign-upload-device] createSignedUploadUrl', error)
      return NextResponse.json({ error: 'URL de dépôt indisponible' }, { status: 500 })
    }

    return NextResponse.json({
      bucket,
      path,
      token: data.token,
      signedUrl: data.signed_url ?? data.signedUrl,
    })
  } catch (error) {
    console.error('[API v1/storage/sign-upload-device POST]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
