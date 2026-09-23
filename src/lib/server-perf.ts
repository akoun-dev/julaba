// Instrumentation de latence d'action écrite (I-04 / TRV-PERF-001).
//
// Contrainte Next.js : l'en-tête `Server-Timing` doit être POSÉ sur le
// NextResponse AVANT le `return` — on ne peut pas muter l'en-tête d'une
// réponse déjà renvoyée. Le pattern robuste en route handler est donc en
// deux temps :
//   1. `startServerTiming()` : marque T0 (performance.now()) au début de
//      la logique d'écriture (réception du body) ;
//   2. `attachServerTiming(resp, name, t0)` : AVANT chaque `return`,
//      clone l'objet headers, ajoute/complète `Server-Timing` en CUMULANT
//      les entrées avec `, ` et renvoie un NOUVEAU NextResponse (le body
//      n'a pas encore été consommé à cet instant).
//
// `withServerTiming(name, fn)` est la commodité quand toute la logique vit
// dans un seul sous-handler (mesure autour de fn, attachement sur la
// réponse retournée). Aucune logique métier n'est modifiée : seule la
// mesure (performance.now()) et l'en-tête de diagnostic sont ajoutés.

import { NextResponse } from 'next/server'

/** Marque T0. Mesure autour de la logique d'écriture. */
export function startServerTiming(): number {
  return performance.now()
}

/**
 * Attache `Server-Timing: ${name};dur=${ms arrondi}` à `resp` en clonant
 * l'objet headers. Les entrées déjà présentes sont conservées et cumulées
 * avec `, ` (plusieurs timers sur un même en-tête). Retourne un nouveau
 * NextResponse (statut/headers copiés, body réutilisé non consommé).
 */
export function attachServerTiming(resp: NextResponse, name: string, t0: number): NextResponse {
  const headers = new Headers(resp.headers)
  const durationMs = Math.round(performance.now() - t0)
  const entry = `${name};dur=${durationMs}`
  const existing = headers.get('server-timing')
  headers.set('server-timing', existing ? `${existing}, ${entry}` : entry)
  return new NextResponse(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  })
}

/**
 * Enveloppe commodité : mesure `performance.now()` autour de `fn` puis
 * attache l'en-tête sur la réponse retournée (avant tout `return` — la
 * route retournée via `return withServerTiming('sale', () => post(request))`
 * reste le point de sortie unique).
 */
export async function withServerTiming<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = startServerTiming()
  const result = await fn()
  if (result instanceof NextResponse) {
    return attachServerTiming(result, name, t0) as unknown as T
  }
  return result
}
