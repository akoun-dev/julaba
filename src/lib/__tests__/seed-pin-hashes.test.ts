import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifyCode } from '@/lib/auth-pin'

/**
 * Garde-fou seed — AUDIT-005 (Task 115 / MODE-963), élargi A11-F10 (AUDIT-011).
 *
 * Incident : supabase/seed.sql stockait les PIN des 12 comptes de démo en
 * djb2 brut (le hash hérité du client legacy). Un seed est VERSIONNÉ dans
 * le dépôt : son djb2 valait mot de passe en clair pour toute base seedée
 * (10 000 combinaisons, cassage instantané hors ligne). Le seed est passé
 * en scrypt:<salt>:<hash> — le même format que backoffice-auth.
 *
 * Élargissement A11-F10 : le premier garde n'extraiait que les lignes
 * commentées « -- PIN nnnn » (12/19) — les 7 comptes étendus (merchant-4..7,
 * producteur-4..6) portaient des hash FACTICES (hex invalide) invisibles
 * du test. Le garde couvre désormais TOUTES les lignes PIN du seed, avec
 * un commentaire PIN OBLIGATOIRE pour chaque (toute nouvelle ligne non
 * documentée casse le test, pas seulement les 12 d'origine).
 */

function seedPath(): string {
  return join(process.cwd(), 'supabase', 'seed.sql')
}

interface SeedPinRow {
  accountId: string
  pin: string
  hash: string
}

/**
 * Extrait TOUTES les lignes d'insertion PIN : `('id', …, 'pin', '<hash>', …)`
 * — avec OU sans commentaire « -- PIN nnnn » (A11-F10 : l'exhaustivité est
 * le but ; l'absence de commentaire est un échec de test dédié).
 */
function extractAllSeedPinRows(): SeedPinRow[] {
  const sql = readFileSync(seedPath(), 'utf8')
  const rows: SeedPinRow[] = []
  // Une ligne = une rangée SQL (convention du seed) — pas de traversal
  // multi-ligne, donc pas de piège de gourmandise RegExp.
  const lineRe = /^\s*\('([a-z0-9-]+)',.*?'pin',\s*'([^']+)'(.*?)$/
  for (const line of sql.split('\n')) {
    const match = line.match(lineRe)
    if (match) {
      const pinComment = match[3]?.match(/--\s*PIN\s*(\d{4})\s*$/)
      rows.push({ accountId: match[1], hash: match[2], pin: pinComment?.[1] ?? '' })
    }
  }
  return rows
}

function extractSeedPinRows(): SeedPinRow[] {
  return extractAllSeedPinRows()
}

describe('seed — hashes PIN (AUDIT-005, élargi A11-F10)', () => {
  const COMPTES_ATTENDUS = [
    'coop-1', 'coop-2',
    'merchant-1', 'merchant-2', 'merchant-3', 'merchant-4', 'merchant-5', 'merchant-6', 'merchant-7',
    'merchant-test-1', 'merchant-test-2',
    'producteur-1', 'producteur-2', 'producteur-3', 'producteur-4', 'producteur-5', 'producteur-6',
    'producteur-test-1', 'producteur-test-2',
  ].sort()

  it('expose exactement les 19 comptes de démo attendus (élargissement A11-F10)', () => {
    const rows = extractAllSeedPinRows()
    expect(rows.map((r) => r.accountId).sort()).toEqual(COMPTES_ATTENDUS)
  })

  it('CHAQUE ligne PIN documente son code en commentaire « -- PIN nnnn » (A11-F10)', () => {
    for (const row of extractAllSeedPinRows()) {
      expect(row.pin, `${row.accountId} : commentaire -- PIN nnnn absent`).toMatch(/^\d{4}$/)
    }
  })

  it('aucun pin_hash en djb2 brut (pur numérique) — bannissement legacy', () => {
    for (const row of extractAllSeedPinRows()) {
      expect(/^\d+$/.test(row.hash), `${row.accountId} : hash djb2 détecté`).toBe(false)
    }
  })

  it('tous les pin_hash suivent le format scrypt:<salt 32 hex>:<hash 128 hex> — EXHAUSTIF (A11-F10)', () => {
    const format = /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/
    for (const row of extractAllSeedPinRows()) {
      expect(format.test(row.hash), `${row.accountId} : format inattendu (${row.hash.slice(0, 20)}…)`).toBe(true)
    }
  })

  it('chaque PIN documenté vérifie bien contre son hash scrypt — les 19 comptes', () => {
    for (const row of extractAllSeedPinRows()) {
      expect(verifyCode(row.pin, row.hash), `${row.accountId} : PIN ${row.pin} refusé`).toBe(true)
    }
  })

  it('un PIN erroné est refusé (non-régression verifyCode)', () => {
    const rows = extractAllSeedPinRows()
    expect(rows.length).toBeGreaterThan(0)
    const first = rows[0]
    const wrongPin = first.pin === '0000' ? '9999' : '0000'
    expect(verifyCode(wrongPin, first.hash)).toBe(false)
  })
})
