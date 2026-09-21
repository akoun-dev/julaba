/**
 * Script de test d'authentification pour tous les comptes de seed.
 *
 * Usage :
 *   1. Lancer le serveur dev : bun run dev
 *   2. Exécuter : bun run scripts/test-auth-all-accounts.ts
 *
 * Ce script vérifie :
 *   - Backoffice : lookup démo → login (mot de passe + session —
 *     MODE-961 : la vérification MFA a été retirée)
 *   - Marchand : lookup unifié → login PIN
 *   - Producteur : lookup unifié → login PIN
 *   - Identificateur : lookup par téléphone → lookup par code agent
 */

export {}

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

// ── simpleHash (même implémentation que l'app) ─────────────────────
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString()
}

// ── Couleurs terminal ───────────────────────────────────────────────
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const RESET = '\x1b[0m'

let passed = 0
let failed = 0
let skipped = 0

function ok(label: string) { passed++; console.log(`  ${GREEN}✓${RESET} ${label}`) }
function ko(label: string, detail: string) { failed++; console.log(`  ${RED}✗${RESET} ${label} — ${detail}`) }
function skip(label: string, reason: string) { skipped++; console.log(`  ${YELLOW}○${RESET} ${label} — ${reason}`) }
function section(title: string) { console.log(`\n${CYAN}── ${title} ──${RESET}`) }

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`)
  return { status: res.status, json: await res.json().catch(() => null) }
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => null), headers: res.headers }
}

// ====================================================================
// 1. BACKOFFICE
// ====================================================================
section('Backoffice — comptes démo')

const boAccounts = [
  { email: 'aminata@julaba.ci', password: 'admin123', role: 'super_admin', name: 'Aminata KONE' },
  { email: 'koffi@julaba.ci', password: 'admin123', role: 'admin_general', name: 'Koffi YAO' },
  { email: 'moussa@dge.ci', password: 'admin123', role: 'admin_national', name: 'Moussa TRAORE' },
  { email: 'fatou@julaba.ci', password: 'admin123', role: 'gestionnaire_zone', name: 'Fatou SORO' },
  { email: 'jean@julaba.ci', password: 'admin123', role: 'operateur_terrain', name: 'Jean KOUADIO' },
  { email: 'affi@julaba.ci', password: 'admin123', role: 'gestionnaire_zone', name: 'Affi COULIBALY' },
]

for (const acc of boAccounts) {
  const label = `${acc.name} (${acc.role})`
  try {
    // MODE-961 : login direct — mot de passe vérifié puis session ouverte
    // (cookie httpOnly), sans second facteur.
    const login = await post('/api/backoffice/login', { email: acc.email, password: acc.password })
    if (login.status === 200 && login.json?.id) {
      const cookie = login.headers.get('set-cookie')
      ok(`${label} — login OK (cookie: ${cookie ? '✓' : '✗'})`)
    } else if (login.status === 423) {
      skip(`${label}`, 'Compte verrouillé (trop de tentatives)')
    } else {
      ko(`${label} — login`, `status ${login.status}: ${JSON.stringify(login.json)}`)
    }
  } catch (e: any) {
    ko(`${label} — login`, e.message)
  }
}

// Test account inactif
try {
  const login = await post('/api/backoffice/login', { email: 'yao@julaba.ci', password: 'admin123' })
  if (login.status === 401) {
    ok('Yao KONAN (inactif) — refusé comme attendu')
  } else {
    ko('Yao KONAN (inactif)', `status ${login.status}, attendu 401`)
  }
} catch (e: any) {
  ko('Yao KONAN (inactif)', e.message)
}

// ====================================================================
// 2. MARCHAND
// ====================================================================
section('Marchand — lookup unifié + login PIN')

const merchantAccounts = [
  { phone: '0701020304', pin: '1234', name: 'Awa KONE', id: 'merchant-1' },
  { phone: '0705060708', pin: '1235', name: 'Fatoumata KEITA', id: 'merchant-2' },
  { phone: '0501020304', pin: '1236', name: 'Salimata CISSE', id: 'merchant-3' },
  { phone: '0541111111', pin: '1111', name: 'Bakari DIALLO', id: 'merchant-test-1' },
  { phone: '0542222222', pin: '2222', name: 'Clarisse BONI', id: 'merchant-test-2' },
]

for (const acc of merchantAccounts) {
  const label = `${acc.name} (${acc.phone})`
  try {
    // Step 1: unified lookup
    const lookup = await get(`/api/auth/lookup?phone=${acc.phone}`)
    if (lookup.status === 200 && lookup.json?.found && lookup.json?.role === 'marchand') {
      ok(`${label} — lookup trouvé (marchand)`)
    } else {
      ko(`${label} — lookup`, `status ${lookup.status}: ${JSON.stringify(lookup.json)}`)
      continue
    }

    // Step 2: login with PIN hash
    const hash = simpleHash(acc.pin)
    const login = await post('/api/merchant/login', { phone: acc.phone, method: 'pin', hash })
    if (login.status === 200 && login.json?.id) {
      const cookie = login.headers.get('set-cookie')
      ok(`${label} — login OK (cookie: ${cookie ? '✓' : '✗'})`)
    } else {
      ko(`${label} — login`, `status ${login.status}: ${JSON.stringify(login.json)}`)
    }
  } catch (e: any) {
    ko(`${label}`, e.message)
  }
}

// Marchand avec mauvais PIN
try {
  const hash = simpleHash('9999')
  const login = await post('/api/merchant/login', { phone: '0701020304', method: 'pin', hash })
  if (login.status === 401) {
    ok('Awa KONE — mauvais PIN refusé comme attendu')
  } else {
    ko('Awa KONE — mauvais PIN', `status ${login.status}, attendu 401`)
  }
} catch (e: any) {
  ko('Awa KONE — mauvais PIN', e.message)
}

// ====================================================================
// 3. PRODUCTEUR
// ====================================================================
section('Producteur — lookup unifié + login PIN')

const producerAccounts = [
  { phone: '0744444444', pin: '0000', name: 'Kouadio', id: 'producteur-1' },
  { phone: '0123456789', pin: '0001', name: 'Moussa', id: 'producteur-2' },
  { phone: '0177777777', pin: '0002', name: 'Adama', id: 'producteur-3' },
  { phone: '0543333333', pin: '3333', name: 'Issa', id: 'producteur-test-1' },
  { phone: '0544444444', pin: '4444', name: 'Mariam', id: 'producteur-test-2' },
]

for (const acc of producerAccounts) {
  const label = `${acc.name} (${acc.phone})`
  try {
    // Step 1: unified lookup
    const lookup = await get(`/api/auth/lookup?phone=${acc.phone}`)
    if (lookup.status === 200 && lookup.json?.found && lookup.json?.role === 'producteur') {
      ok(`${label} — lookup trouvé (producteur)`)
    } else {
      ko(`${label} — lookup`, `status ${lookup.status}: ${JSON.stringify(lookup.json)}`)
      continue
    }

    // Step 2: login with PIN hash
    const hash = simpleHash(acc.pin)
    const login = await post('/api/producteur/login', { phone: acc.phone, method: 'pin', hash })
    if (login.status === 200 && login.json?.id) {
      const cookie = login.headers.get('set-cookie')
      ok(`${label} — login OK (cookie: ${cookie ? '✓' : '✗'})`)
    } else {
      ko(`${label} — login`, `status ${login.status}: ${JSON.stringify(login.json)}`)
    }
  } catch (e: any) {
    ko(`${label}`, e.message)
  }
}

// Producteur avec mauvais PIN
try {
  const hash = simpleHash('9999')
  const login = await post('/api/producteur/login', { phone: '0744444444', method: 'pin', hash })
  if (login.status === 401) {
    ok('Kouadio — mauvais PIN refusé comme attendu')
  } else {
    ko('Kouadio — mauvais PIN', `status ${login.status}, attendu 401`)
  }
} catch (e: any) {
  ko('Kouadio — mauvais PIN', e.message)
}

// ====================================================================
// 4. IDENTIFICATEUR
// ====================================================================
section('Identificateur — lookup par téléphone')

const identPhoneAccounts = [
  { phone: '0555555555', name: 'Kouamé Bamba', code: 'JID-0001', id: 'ident-demo-000001' },
  { phone: '0700000001', name: 'Fatou Soro', code: 'JID-0002', id: 'ident-demo-000002' },
  { phone: '0700000002', name: 'Affi Coulibaly', code: 'JID-0003', id: 'ident-demo-000003' },
  { phone: '0700000003', name: 'Koffi Diallo', code: 'JID-0004', id: 'ident-demo-000004' },
  { phone: '0540000005', name: 'Mariam Ouattara', code: 'JID-0005', id: 'ident-test-000005' },
  { phone: '0540000006', name: 'Ibrahim Traoré', code: 'JID-0006', id: 'ident-test-000006' },
  { phone: '0540000007', name: 'Awa Cissé', code: 'JID-0007', id: 'ident-test-000007' },
  { phone: '0540000008', name: "Serge N'Guessan", code: 'JID-0008', id: 'ident-test-000008' },
  { phone: '0540000009', name: 'Adjoua Kouamé', code: 'JID-0009', id: 'ident-test-000009' },
]

for (const acc of identPhoneAccounts) {
  const label = `${acc.name} (${acc.phone})`
  try {
    const lookup = await get(`/api/identificateur/auth/lookup?query=${acc.phone}`)
    if (lookup.status === 200 && lookup.json?.found && lookup.json?.agentCode === acc.code) {
      ok(`${label} — lookup par téléphone OK (${acc.code})`)
    } else if (lookup.status === 200 && lookup.json?.found) {
      ok(`${label} — lookup trouvé (code: ${lookup.json.agentCode})`)
    } else {
      ko(`${label} — lookup`, `status ${lookup.status}: ${JSON.stringify(lookup.json)}`)
    }
  } catch (e: any) {
    ko(`${label}`, e.message)
  }
}

section('Identificateur — lookup par code agent')

for (const acc of identPhoneAccounts) {
  const label = `${acc.name} (${acc.code})`
  try {
    const lookup = await get(`/api/identificateur/auth/lookup?query=${acc.code}`)
    if (lookup.status === 200 && lookup.json?.found && lookup.json?.phone === acc.phone) {
      ok(`${label} — lookup par code OK (${lookup.json.phone})`)
    } else {
      ko(`${label} — lookup`, `status ${lookup.status}: ${JSON.stringify(lookup.json)}`)
    }
  } catch (e: any) {
    ko(`${label}`, e.message)
  }
}

// Identificateur désactivé
section('Identificateur — compte désactivé refusé')
try {
  const lookup = await get('/api/identificateur/auth/lookup?query=0540000010')
  if (lookup.status === 200 && lookup.json?.found === false) {
    ok('Bakary Touré (désactivé) — refusé comme attendu')
  } else {
    ko('Bakary Touré (désactivé)', `status ${lookup.status}: ${JSON.stringify(lookup.json)}`)
  }
} catch (e: any) {
  ko('Bakary Touré (désactivé)', e.message)
}

// Numéro inexistant
section('Identificateur — numéro inexistant')
try {
  const lookup = await get('/api/identificateur/auth/lookup?query=0999999999')
  if (lookup.status === 200 && lookup.json?.found === false) {
    ok('Numéro inexistant — refusé comme attendu')
  } else {
    ko('Numéro inexistant', `status ${lookup.status}: ${JSON.stringify(lookup.json)}`)
  }
} catch (e: any) {
  ko('Numéro inexistant', e.message)
}

// ====================================================================
// 5. RÉSUMÉ
// ====================================================================
section('Résumé')
console.log(`  ${GREEN}Passés${RESET}: ${passed}`)
console.log(`  ${RED}Échoués${RESET}: ${failed}`)
console.log(`  ${YELLOW}Ignorés${RESET}: ${skipped}`)
console.log(`  Total: ${passed + failed + skipped}`)
console.log()

if (failed > 0) {
  console.log(`${RED}Des tests ont échoué.${RESET}`)
  process.exit(1)
} else {
  console.log(`${GREEN}Tous les tests sont passés !${RESET}`)
  process.exit(0)
}
