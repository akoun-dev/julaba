/**
 * MODE-1012/plan 30-90 j — vérification de DÉRIVE des migrations.
 *
 * Contexte (MODE-1004) : deux migrations avaient été appliquées chez
 * l'hébergeur mais jamais commitées — le drift n'a été découvert que
 * parce qu'une route s'appuyait sur une RPC absente du dépôt. Ce script
 * compare les fonctions et triggers du schéma public HÉBERGÉ avec ceux
 * déclarés dans supabase/migrations/*.sql :
 *   - fonction/trigger en base absent des migrations → DRIFT (exit 1) ;
 *   - fonction/trigger des migrations absente en base → DRIFT (exit 1) ;
 *   - arguments identité différents → AVERTISSEMENT (diff affiché).
 *
 * Usage : bun run scripts/check-migration-drift.ts
 * Prérequis : SUPABASE_ACCESS_TOKEN + NEXT_PUBLIC_SUPABASE_URL dans .env.
 * Aucune écriture : lecture seule via l'endpoint database/query.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// --- credentials ---
const env: Record<string, string> = {}
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const token = env.SUPABASE_ACCESS_TOKEN
const url = env.NEXT_PUBLIC_SUPABASE_URL
if (!token || !url) {
  console.error('SUPABASE_ACCESS_TOKEN / NEXT_PUBLIC_SUPABASE_URL absents du .env.')
  process.exit(2)
}
const projectRef = url.replace(/^https:\/\/([^\.]+)\.supabase\.co.*$/, '$1')

async function query(sql: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!response.ok) throw new Error(`query ${response.status} : ${await response.text()}`)
  return (await response.json()) as Record<string, unknown>[]
}

// --- fonctions/triggers attendus par les migrations ---

/** Extrait la liste d'arguments avec SUIVI DE PROFONDEUR des parenthèses
 * (les commentaires inline contenant des parenthèses ne coupent plus la
 * capture). */
function extractArgs(sql: string, startIdx: number): string {
  let depth = 0
  let i = startIdx
  for (; i < sql.length; i++) {
    if (sql[i] === '(') depth++
    else if (sql[i] === ')') {
      depth--
      if (depth === 0) return sql.slice(startIdx + 1, i)
    }
  }
  return ''
}

/** Normalise une liste d'arguments pour la comparaison : les clauses
 * DEFAULT (représentées dans les migrations mais ABSENTES des arguments
 * identité PostgreSQL), les casts ::type et les alias de types
 * (timestamptz vs timestamp with time zone) sont gommés. */
function normalizeArgs(raw: string): string {
  return raw
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+default\s+(?:'(?:[^']|'')*'(?:\s*::[\w\s]+)?|[^\s,]+(?:\s*::[\w\s]+)?)/gi, '')
    .replace(/timestamp with time zone/gi, 'timestamptz')
    .replace(/timestamp without time zone/gi, 'timestamp')
    .replace(/::[\w\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function parseMigrations(): { functions: Map<string, string>; triggers: Set<string> } {
  const functions = new Map<string, string>()
  const triggers = new Set<string>()
  for (const file of readdirSync('supabase/migrations').sort()) {
    if (!file.endsWith('.sql')) continue
    const sql = readFileSync(join('supabase/migrations', file), 'utf8')
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(/gi)) {
      const rawArgs = extractArgs(sql, m.index! + m[0].length - 1)
      const args = normalizeArgs(rawArgs)
      // Les migrations postérieures ÉCRASENT les précédentes (create or
      // replace) : la DERNIÈRE définition triée est la signature attendue.
      functions.set(m[1].toLowerCase(), args)
    }
    for (const m of sql.matchAll(
      /create\s+trigger\s+(\w+)[\s\S]{0,200}?\bon\s+(?:(public|auth)\.)?(\w+)\b/gi
    )) {
      // Clé « schema.table.trigger » — schéma implicite = public.
      triggers.add(
        `${(m[2] ?? 'public').toLowerCase()}.${m[3].toLowerCase()}.${m[1].toLowerCase()}`
      )
    }
  }
  return { functions, triggers }
}

// --- fonctions/triggers réellement en base ---
const dbFunctions = await query(`
  select lower(p.proname) as name,
         replace(pg_get_function_identity_arguments(p.oid), '  ', ' ') as args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  order by 1;
`)
const dbTriggers = await query(`
  select lower(n.nspname || '.' || c.relname) as table_name, lower(t.tgname) as name
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and n.nspname in ('public', 'auth')
  order by 1, 2;
`)

const expected = parseMigrations()
const dbFnMap = new Map<string, string>()
for (const row of dbFunctions) dbFnMap.set(String(row.name), normalizeArgs(String(row.args ?? '')))
const dbTrigSet = new Set(dbTriggers.map((r) => `${r.table_name}.${r.name}`))
// --- comparaison ---
const drift: string[] = []
const warnings: string[] = []

for (const [name, args] of expected.functions) {
  if (!dbFnMap.has(name)) drift.push(`FONCTION déclarée dans les migrations mais absente en base : ${name}(${args})`)
  else if (dbFnMap.get(name) !== args) {
    warnings.push(`Arguments identité différents pour ${name} :\n  migrations : (${args})\n  base       : (${dbFnMap.get(name)})`)
  }
}
for (const [name, args] of dbFnMap) {
  if (!expected.functions.has(name)) drift.push(`FONCTION en base jamais commitée (MODE-1004 : drift historique) : ${name}(${args})`)
}
for (const trig of expected.triggers) {
  if (!dbTrigSet.has(trig)) drift.push(`TRIGGER des migrations absent en base : ${trig}`)
}
for (const trig of dbTrigSet) {
  if (!expected.triggers.has(trig)) drift.push(`TRIGGER en base jamais commité : ${trig}`)
}

console.log(`Hébergé : ${projectRef}`)
console.log(`Fonctions migrées : ${expected.functions.size} · en base : ${dbFnMap.size}`)
console.log(`Triggers migrés : ${expected.triggers.size} · en base : ${dbTrigSet.size}`)
for (const w of warnings) console.warn(`⚠ AVERTISSEMENT ${w}`)
if (drift.length > 0) {
  console.error(`\nDÉRIVE (${drift.length}) :`)
  for (const d of drift) console.error(`  ✗ ${d}`)
  process.exit(1)
}
console.log('\nAucune dérive : fonctions et triggers hébergés = migrations commitées.')
