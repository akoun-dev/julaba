import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifyCode } from '@/lib/auth-pin'

/**
 * Garde-fou seed — AUDIT-005 (Task 115 / MODE-963).
 *
 * Incident : supabase/seed.sql stockait les PIN des 12 comptes de démo en
 * djb2 brut (le hash hérité du client legacy). Un seed est VERSIONNÉ dans
 * le dépôt : son djb2 valait mot de passe en clair pour toute base seedée
 * (10 000 combinaisons, cassage instantané hors ligne). Le seed est passé
 * en scrypt:<salt>:<hash> — le même format que backoffice-auth — et ce
 * test garantit qu'aucun hash non scrypt ne revient JAMAIS dans le seed.
 */

function seedPath(): string {
  return join(process.cwd(), 'supabase', 'seed.sql')
}

interface SeedPinRow {
  accountId: string
  pin: string
  hash: string
}

/** Extrait chaque ligne d'insertion PIN : `('id', …, 'pin', '<hash>', …) -- PIN 1234`. */
function extractSeedPinRows(): SeedPinRow[] {
  const sql = readFileSync(seedPath(), 'utf8')
  const rows: SeedPinRow[] = []
  // Une ligne = une rangée SQL (convention du seed) — pas de traversal
  // multi-ligne, donc pas de piège de gourmandise RegExp.
  const lineRe = /^\s*\('([a-z0-9-]+)',.*?'pin',\s*'([^']+)'.*?--\s*PIN\s*(\d{4})\s*$/
  for (const line of sql.split('\n')) {
    const match = line.match(lineRe)
    if (match) rows.push({ accountId: match[1], hash: match[2], pin: match[3] })
  }
  return rows
}

describe('seed — hashes PIN (AUDIT-005)', () => {
  it('expose exactement les 12 comptes de démo attendus', () => {
    const rows = extractSeedPinRows()
    expect(rows.map((r) => r.accountId).sort()).toEqual([
      'coop-1', 'coop-2',
      'merchant-1', 'merchant-2', 'merchant-3', 'merchant-test-1', 'merchant-test-2',
      'producteur-1', 'producteur-2', 'producteur-3', 'producteur-test-1', 'producteur-test-2',
    ].sort())
  })

  it('aucun pin_hash en djb2 brut (pur numérique) — bannissement legacy', () => {
    for (const row of extractSeedPinRows()) {
      expect(/^\d+$/.test(row.hash), `${row.accountId} : hash djb2 détecté`).toBe(false)
    }
  })

  it('tous les pin_hash suivent le format scrypt:<salt 32 hex>:<hash 128 hex>', () => {
    const format = /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/
    for (const row of extractSeedPinRows()) {
      expect(format.test(row.hash), `${row.accountId} : format inattendu`).toBe(true)
    }
  })

  it('chaque PIN documenté vérifie bien contre son hash scrypt', () => {
    for (const row of extractSeedPinRows()) {
      expect(verifyCode(row.pin, row.hash), `${row.accountId} : PIN ${row.pin} refusé`).toBe(true)
    }
  })

  it('un PIN erroné est refusé (non-régression verifyCode)', () => {
    const rows = extractSeedPinRows()
    expect(rows.length).toBeGreaterThan(0)
    const first = rows[0]
    const wrongPin = first.pin === '0000' ? '9999' : '0000'
    expect(verifyCode(wrongPin, first.hash)).toBe(false)
  })
})
