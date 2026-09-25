import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  recordApiRequest,
  renderPrometheusMetrics,
  resetApiMetricsForTests,
  withApiMetrics,
} from '../api-metrics'

// MODE-1012 (plan 90 j) — métriques API en mémoire : compteurs par route
// + classe de statut, quantiles p50/p95, rendu Prometheus. Le wrapper
// withApiMetrics préserve la réponse INTACTE et relance les exceptions
// (comportement Next inchangé — contrat des routes).

describe('recordApiRequest + renderPrometheusMetrics', () => {
  beforeEach(() => resetApiMetricsForTests())
  afterEach(() => resetApiMetricsForTests())

  it('compte par classe de statut (2xx/4xx/5xx) sur une route', () => {
    recordApiRequest('ventes_create', 201, 100)
    recordApiRequest('ventes_create', 400, 20)
    recordApiRequest('ventes_create', 500, 30)
    const out = renderPrometheusMetrics()
    expect(out).toContain('julaba_api_requests_total{route="ventes_create",status_class="2xx"} 1')
    expect(out).toContain('julaba_api_requests_total{route="ventes_create",status_class="4xx"} 1')
    expect(out).toContain('julaba_api_requests_total{route="ventes_create",status_class="5xx"} 1')
  })

  it('sortie déterministe : routes triées alphabétiquement', () => {
    recordApiRequest('marketplace_catalog', 200, 10)
    recordApiRequest('session_claim', 200, 10)
    recordApiRequest('ventes_create', 200, 10)
    const out = renderPrometheusMetrics()
    const iMarket = out.indexOf('route="marketplace_catalog"')
    const iSession = out.indexOf('route="session_claim"')
    const iVentes = out.indexOf('route="ventes_create"')
    expect(iMarket).toBeGreaterThan(-1)
    expect(iSession).toBeGreaterThan(iMarket)
    expect(iVentes).toBeGreaterThan(iSession)
  })

  it('p50/p95 rendus sur la fenêtre glissante (nearest-rank)', () => {
    // 100 échantillons 1..100 ms : p50 (rang 50) = 50, p95 (rang 95) = 95.
    for (let ms = 1; ms <= 100; ms++) recordApiRequest('route_q', 200, ms)
    const out = renderPrometheusMetrics()
    expect(out).toContain('julaba_api_request_duration_ms{route="route_q",quantile="0.5"} 50')
    expect(out).toContain('julaba_api_request_duration_ms{route="route_q",quantile="0.95"} 95')
  })

  it('fenêtre glissante : au-delà de 500 échantillons, les plus anciens sortent', () => {
    for (let ms = 1; ms <= 600; ms++) recordApiRequest('route_win', 200, ms)
    // p50 de la fenêtre [101..600] = 350.
    expect(renderPrometheusMetrics()).toContain(
      'julaba_api_request_duration_ms{route="route_win",quantile="0.5"} 350'
    )
  })

  it('entrées aberrantes ignorées (durée négative/NaN) — les métriques ne plantent jamais', () => {
    recordApiRequest('route_bad', 200, -5)
    recordApiRequest('route_bad', 200, Number.NaN)
    recordApiRequest('route_bad', 200, 10)
    const out = renderPrometheusMetrics()
    expect(out).toContain('julaba_api_requests_total{route="route_bad",status_class="2xx"} 1')
  })

  it('uptime du process exposé en gauge', () => {
    expect(renderPrometheusMetrics()).toMatch(/julaba_api_uptime_seconds \d+/)
  })
})

describe('withApiMetrics — wrapper de route (contrat intact)', () => {
  beforeEach(() => resetApiMetricsForTests())
  afterEach(() => resetApiMetricsForTests())

  it('renvoie la réponse telle quelle et enregistre le statut + la durée', async () => {
    const handler = vi.fn(async (_req: Request) => new Response('{"ok":true}', { status: 201 }))
    const wrapped = withApiMetrics('route_wrap', handler)
    const response = await wrapped(new Request('https://julaba.app/api/x'))
    expect(response.status).toBe(201)
    expect(await response.text()).toBe('{"ok":true}')
    expect(handler).toHaveBeenCalledTimes(1)
    const out = renderPrometheusMetrics()
    expect(out).toContain('julaba_api_requests_total{route="route_wrap",status_class="2xx"} 1')
    expect(out).toContain('julaba_api_request_duration_ms{route="route_wrap",quantile="0.5"}')
  })

  it('exception du handler : 5xx enregistré PUIS exception relancée (comportement Next préservé)', async () => {
    // Paramètre typé volontaire : l'inférence A du wrapper doit rester
    // [Request] pour appeler wrapped(new Request(...)) comme une vraie route.
    const handler = vi.fn(async (_req: Request) => {
      throw new Error('base injoignable')
    })
    const wrapped = withApiMetrics('route_throw', handler)
    await expect(wrapped(new Request('https://julaba.app/api/x'))).rejects.toThrow('base injoignable')
    expect(renderPrometheusMetrics()).toContain(
      'julaba_api_requests_total{route="route_throw",status_class="5xx"} 1'
    )
  })

  it('compatible handlers à second argument (routes paramétrées)', async () => {
    const handler = async (_req: Request, ctx: { params: Promise<{ id: string }> }) =>
      new Response((await ctx.params).id, { status: 200 })
    const wrapped = withApiMetrics('route_params', handler)
    const response = await wrapped(new Request('https://julaba.app/api/x'), {
      params: Promise.resolve({ id: 'abc' }),
    })
    expect(await response.text()).toBe('abc')
    expect(renderPrometheusMetrics()).toContain(
      'julaba_api_requests_total{route="route_params",status_class="2xx"} 1'
    )
  })
})
