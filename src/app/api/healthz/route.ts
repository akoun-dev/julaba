import { NextResponse } from 'next/server'

/**
 * AUDIT-012 P1-11 — probe de VIE (liveness) : le processus répond, sans
 * dépendance externe. Ne doit JAMAIS toucher Supabase ni le réseau : si
 * cette route échoue, le processus est mort et le routeur doit le sortir.
 * (Le contrôle des dépendances est le rôle de /api/readyz.)
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
}
