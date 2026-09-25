// MODE-1012 (plan 90 j) — métriques API agrégées en mémoire, exposées au
// format Prometheus par /api/metrics.
//
// Complément de server-perf.ts : celui-ci mesure UNE requête via
// l'en-tête Server-Timing (diagnostic par réponse) ; ici on accumule des
// compteurs par route pour le suivi SLO (.ai/SLO.md — disponibilité,
// budget d'erreur, latence p95). Les deux coexistent sans se connaître.
//
// Honnêteté de mesure : les compteurs vivent DANS le process Node — en
// serverless (Vercel), chaque instance a les siens et /api/metrics
// reflète l'instance interrogée (documenté dans .ai/SLO.md). Aucune
// donnée utilisateur : des labels de route FIXES (jamais d'identifiant)
// et des classes de statut (2xx/4xx/5xx) — rien de requêtable.

const MAX_DURATION_SAMPLES = 500

export type StatusClass = '2xx' | '4xx' | '5xx'

interface RouteStats {
  counts: Record<StatusClass, number>
  /** Fenêtre glissante des durées (ms) pour les quantiles. */
  durations: number[]
}

const registry = new Map<string, RouteStats>()

function statusClass(status: number): StatusClass {
  if (status < 400) return '2xx'
  if (status < 500) return '4xx'
  return '5xx'
}

/** Enregistre une requête terminée. Tolérant aux entrées aberrantes (les
 * métriques ne doivent JAMAIS faire planter une route). */
export function recordApiRequest(route: string, status: number, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return
  const stats = registry.get(route) ?? { counts: { '2xx': 0, '4xx': 0, '5xx': 0 }, durations: [] }
  stats.counts[statusClass(status)]++
  stats.durations.push(durationMs)
  if (stats.durations.length > MAX_DURATION_SAMPLES) stats.durations.shift()
  registry.set(route, stats)
}

/**
 * Wrapper de route handler : mesure la durée, enregistre la classe de
 * statut, et renvoie la réponse INTACTE (statut, headers, body — aucun
 * changement de contrat). Sur exception, enregistre un 5xx puis RELANCE
 * (le comportement Next est préservé). Compatible avec les handlers à
 * second argument (routes paramétrées).
 */
export function withApiMetrics<A extends unknown[]>(
  route: string,
  handler: (...args: A) => Promise<Response>
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const t0 = performance.now()
    try {
      const response = await handler(...args)
      recordApiRequest(route, response.status, performance.now() - t0)
      return response
    } catch (error) {
      recordApiRequest(route, 500, performance.now() - t0)
      throw error
    }
  }
}

/** Quantile par rang la plus proche (nearest-rank) sur la fenêtre triée. */
function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))
  return sorted[index]
}

/** Rendu texte Prometheus 0.0.4 : compteurs par route/classe de statut,
 * quantiles p50/p95 par route (summary), uptime du process. Routes triées
 * alphabétiquement pour une sortie déterministe. */
export function renderPrometheusMetrics(): string {
  const lines: string[] = [
    '# HELP julaba_api_requests_total Requêtes API par route et classe de statut.',
    '# TYPE julaba_api_requests_total counter',
  ]
  const routes = [...registry.entries()].sort(([a], [b]) => a.localeCompare(b))
  for (const [route, stats] of routes) {
    for (const cls of ['2xx', '4xx', '5xx'] as const) {
      lines.push(`julaba_api_requests_total{route="${route}",status_class="${cls}"} ${stats.counts[cls]}`)
    }
  }
  lines.push('# HELP julaba_api_request_duration_ms Latence API (ms, fenêtre glissante de 500 échantillons).')
  lines.push('# TYPE julaba_api_request_duration_ms summary')
  for (const [route, stats] of routes) {
    const sorted = [...stats.durations].sort((a, b) => a - b)
    for (const q of [0.5, 0.95]) {
      const value = quantile(sorted, q)
      if (value !== null) {
        lines.push(`julaba_api_request_duration_ms{route="${route}",quantile="${q}"} ${value.toFixed(0)}`)
      }
    }
  }
  lines.push('# HELP julaba_api_uptime_seconds Uptime du process (secondes).')
  lines.push('# TYPE julaba_api_uptime_seconds gauge')
  lines.push(`julaba_api_uptime_seconds ${process.uptime().toFixed(0)}`)
  return `${lines.join('\n')}\n`
}

/** Réinitialise le registre (tests uniquement). */
export function resetApiMetricsForTests(): void {
  registry.clear()
}
