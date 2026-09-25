import { renderPrometheusMetrics } from '@/lib/api-metrics'

/**
 * MODE-1012 (plan 90 j) — exposition des métriques API au format
 * Prometheus (texte 0.0.4). Compteurs en mémoire PAR INSTANCE de process
 * (voir .ai/SLO.md : en serverless, chaque instance a les siens).
 * Aucune donnée utilisateur : labels de route fixes et classes de statut
 * uniquement. Non mise en cache (une sonde doit voir l'instance vive).
 */
export const dynamic = 'force-dynamic'

export function GET() {
  return new Response(renderPrometheusMetrics(), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
