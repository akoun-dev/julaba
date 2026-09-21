/**
 * Audit Task 111 — vérification SANS base de données :
 * chaque password_hash de supabase/seed.sql (bo_users) doit vérifier
 * verifyPassword('admin123', hash) via la VRAIE implémentation de
 * src/lib/backoffice-auth/password.ts.
 *
 * Usage : bun scripts/audit-verify-seed-hashes.ts
 */
import { readFileSync } from 'node:fs'
import { verifyPassword } from '../src/lib/backoffice-auth/password'

const sql = readFileSync('supabase/seed.sql', 'utf8')

// Chaque insert bo_users : ('id', 'email', 'scrypt:…', 'Nom', 'role', zone, is_active)
const re = /'([a-z0-9._-]+@[\w.-]+)',\s*'(scrypt:[^']+|\w+)',\s*'([^']+)',\s*'(\w+)'/g
let n = 0
let ok = 0
const ko: string[] = []
for (const [, email, hash, nom] of sql.matchAll(re)) {
  n++
  const valid = verifyPassword('admin123', hash)
  const needsRe = !hash.startsWith('scrypt:')
  if (valid && !needsRe) ok++
  else if (valid && needsRe) ko.push(`${email} (VALIDE mais LEGACY plaintext → rehash requis)`)
  else ko.push(`${email} (hash INVALIDE pour admin123 — nom: ${nom})`)
}
console.log(`Hashes bo_users analysés : ${n}`)
console.log(`Vérifient admin123 avec format scrypt : ${ok}`)
if (ko.length) {
  console.log('PROBLÈMES :')
  for (const k of ko) console.log(`  ✗ ${k}`)
  process.exit(1)
}
console.log('✓ Tous les hash du seed vérifient admin123 (format scrypt actuel)')
