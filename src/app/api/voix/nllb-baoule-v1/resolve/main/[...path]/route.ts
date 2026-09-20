// Proxy streaming des poids du modèle de traduction baoulé (Task 84).
//
// GET /api/voix/nllb-baoule-v1/resolve/main/[...path]
//
// Pourquoi ce proxy : le port ONNX quantifié du finetune baoulé
// (GaindeNdiaye/nllb-baoule-v1, CC-BY-NC-4.0) est hébergé en GitHub Release
// (repo akoun-dev/julaba, tag nllb-baoule-v1) — GitHub ne renvoie AUCUN
// en-tête CORS, un fetch navigateur direct échoue. La route sert chaque
// fichier en STREAMING same-origin (response.body relayé tel quel — RAM
// constante, Content-Length transmis pour la progression dans Voix & Langue).
//
// Le chemin reproduit la mise en page d'un dépôt Hugging Face pour que
// Transformers.js v2 résolve ses fichiers sans configuration : le host est
// surchargé dans nllb-translation.ts (withModelHostScope) vers
// `${origin}/api/voix/` avec le gabarit `{model}/resolve/main/`, ce qui
// produit exactement ces URLs :
//   …/nllb-baoule-v1/resolve/main/config.json
//   …/nllb-baoule-v1/resolve/main/onnx/encoder_model_quantized.onnx   (418 Mo)
//   …/nllb-baoule-v1/resolve/main/onnx/decoder_model_merged_quantized.onnx (475 Mo)
//   …/nllb-baoule-v1/resolve/main/tokenizer.json (12,7 Mo, patché v2)
//   …/nllb-baoule-v1/resolve/main/{generation_config,tokenizer_config,
//     special_tokens_map,added_tokens}.json
//
// Sans authentification volontairement : le modèle est public (CC-BY-NC 4.0)
// et le téléchargement est déjà gardé côté client (action utilisateur
// explicite dans les réglages voix).
//
// L'URL amont est surchargeable par env NLLB_BCI_RELEASE_BASE (miroir,
// changement de tag) — le défaut pointe la release créée pour la Task 84.

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RELEASE_BASE =
  process.env.NLLB_BCI_RELEASE_BASE ||
  'https://github.com/akoun-dev/julaba/releases/download/nllb-baoule-v1'

// Chemins servis → asset de la release (le préfixe onnx/ est implicite :
// les assets GitHub ne peuvent pas contenir de « / »).
function assetPour(pathParts: string[]): string | null {
  const chemin = pathParts.join('/')
  const connus: Record<string, string> = {
    'config.json': 'config.json',
    'generation_config.json': 'generation_config.json',
    'tokenizer.json': 'tokenizer.json',
    'tokenizer_config.json': 'tokenizer_config.json',
    'special_tokens_map.json': 'special_tokens_map.json',
    'added_tokens.json': 'added_tokens.json',
    'onnx/encoder_model_quantized.onnx': 'encoder_model_quantized.onnx',
    'onnx/decoder_model_merged_quantized.onnx': 'decoder_model_merged_quantized.onnx',
  }
  return connus[chemin] ?? null
}

export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: pathParts } = await params
  const asset = assetPour(pathParts ?? [])
  if (!asset) {
    return NextResponse.json(
      { error: `Fichier de modèle inconnu : ${(pathParts ?? []).join('/')}` },
      { status: 404 },
    )
  }
  try {
    const upstream = await fetch(`${RELEASE_BASE}/${asset}`, { redirect: 'follow' })
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Modèle baoulé indisponible en amont (HTTP ${upstream.status}).` },
        { status: 502 },
      )
    }
    const headers = new Headers({
      'content-type': asset.endsWith('.onnx') ? 'application/octet-stream' : 'application/json',
      // Un an : le contenu d'une release taguée est immuable.
      'cache-control': 'public, max-age=31536000, immutable',
    })
    const contentLength = upstream.headers.get('content-length')
    if (contentLength) headers.set('content-length', contentLength)
    return new Response(upstream.body, { status: 200, headers })
  } catch (err) {
    console.warn('[voix/nllb-baoule] Proxy de téléchargement en échec :', err)
    return NextResponse.json(
      { error: 'Téléchargement du modèle baoulé impossible (réseau amont).' },
      { status: 502 },
    )
  }
}
