// Proxy streaming du poids ONNX de la voix dioula (MODE-914).
//
// GET /api/voix/dyu-model
//
// Pourquoi ce proxy : les poids du port transformers.js de
// facebook/mms-tts-dyu (114 Mo, fp32) sont hébergés en GitHub Release
// (repo akoun-dev/julaba, tag voix-dyu-mms-v1) — GitHub ne renvoie AUCUN
// en-tête CORS (ni sur github.com, ni sur release-assets.githubusercontent
// .com), un fetch navigateur direct échoue donc silencieusement. Supabase
// Storage est exclu (limite 50 Mo/objet sur le plan gratuit). La route sert
// donc le fichier en STREAMING same-origin : le binaire transite sans être
// bufferisé (response.body est relayé tel quel — RAM constante), et le
// Content-Length amont est transmis pour que la progression du
// téléchargement dans Voix & Langue fonctionne.
//
// Sans authentification volontairement : le modèle est public (CC-BY-NC
// 4.0, provenance Meta MMS) et le téléchargement est déjà gardé côté client
// (action utilisateur explicite dans les réglages voix).
//
// L'URL amont est surchargeable par env VOIX_DYU_MODEL_URL (dépôt miroir,
// changement de tag) — le défaut pointe la release créée pour MODE-914.

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_UPSTREAM_URL =
  'https://github.com/akoun-dev/julaba/releases/download/voix-dyu-mms-v1/mms-tts-dyu-model.onnx'

export async function GET(): Promise<Response> {
  const upstreamUrl = process.env.VOIX_DYU_MODEL_URL || DEFAULT_UPSTREAM_URL
  try {
    const upstream = await fetch(upstreamUrl, { redirect: 'follow' })
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Modèle dioula indisponible en amont (HTTP ${upstream.status}).` },
        { status: 502 },
      )
    }
    const headers = new Headers({
      'content-type': 'application/octet-stream',
      // Un an : le fichier d'une release taguée est immuable.
      'cache-control': 'public, max-age=31536000, immutable',
    })
    const contentLength = upstream.headers.get('content-length')
    if (contentLength) headers.set('content-length', contentLength)
    return new Response(upstream.body, { status: 200, headers })
  } catch (err) {
    console.warn('[voix/dyu-model] Proxy de téléchargement en échec :', err)
    return NextResponse.json(
      { error: 'Téléchargement du modèle dioula impossible (réseau amont).' },
      { status: 502 },
    )
  }
}
