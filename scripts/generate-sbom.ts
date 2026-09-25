/**
 * MODE-1012/plan 30-90 j — génération d'un SBOM CycloneDX 1.5 (JSON).
 *
 * Source de vérité : l'arbre RÉELLEMENT installé (node_modules), pas le
 * lockfile brut — le SBOM décrit ce qui serait embarqué dans un build.
 * Usage : bun run scripts/generate-sbom.ts [chemin-de-sortie]
 * Sortie par défaut : sbom/cyclonedx.json (dossier gitignore — l'artefact
 * est généré en CI, actions/upload-artifact, jamais commité).
 */

import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface PkgJson {
  name?: string
  version?: string
  license?: string
  homepage?: string
  description?: string
}

interface CdxComponent {
  type: 'application' | 'library'
  'bom-ref': string
  name: string
  version: string
  licenses?: { license: { id?: string; name?: string } }[]
  purl: string
  description?: string
  homepage?: string
}

function readPkg(dir: string): PkgJson | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PkgJson
  } catch {
    return null
  }
}

function collect(dir: string, out: Map<string, CdxComponent>): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue
    if (entry.name.startsWith('@')) {
      // Portée npm : node_modules/@scope/<pkg>
      const scopeDir = join(dir, entry.name)
      for (const sub of readdirSync(scopeDir, { withFileTypes: true })) {
        if (!sub.isDirectory()) continue
        collectPkg(join(scopeDir, sub.name), out)
      }
      continue
    }
    collectPkg(join(dir, entry.name), out)
  }
}

function collectPkg(pkgDir: string, out: Map<string, CdxComponent>): void {
  const pkg = readPkg(pkgDir)
  if (!pkg?.name || !pkg.version) return
  const purl = `pkg:npm/${encodeURIComponent(pkg.name).replace(/%40/g, '@')}@${pkg.version}`
  if (out.has(purl)) return
  const component: CdxComponent = {
    type: 'library',
    'bom-ref': purl,
    name: pkg.name,
    version: pkg.version,
    purl,
  }
  if (pkg.license) {
    component.licenses = [
      pkg.license.startsWith('(') || pkg.license.includes('/')
        ? { license: { name: pkg.license } }
        : { license: { id: pkg.license } },
    ]
  }
  if (pkg.description) component.description = pkg.description.slice(0, 200)
  if (pkg.homepage) component.homepage = pkg.homepage
  out.set(purl, component)
  // Dépendances imbriquées (arborescence npm héritée).
  collect(join(pkgDir, 'node_modules'), out)
}

const root = process.cwd()
const rootPkg = readPkg(root)
if (!rootPkg?.name) {
  console.error('package.json racine illisible — exécuter depuis la racine du dépôt.')
  process.exit(1)
}

const components = new Map<string, CdxComponent>()
collect(join(root, 'node_modules'), components)

const rootRef = `pkg:npm/${rootPkg.name}@${rootPkg.version ?? '0.0.0'}`
const now = new Date().toISOString()
const serialNumber = `urn:uuid:${crypto.randomUUID()}`

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber,
  version: 1,
  metadata: {
    timestamp: now,
    tools: [{ vendor: 'julaba', name: 'generate-sbom.ts', version: '1.0' }],
    component: {
      type: 'application',
      'bom-ref': rootRef,
      name: rootPkg.name,
      version: rootPkg.version ?? '0.0.0',
      purl: rootRef,
    } as CdxComponent,
  },
  components: [...components.values()].sort((a, b) => a.name.localeCompare(b.name)),
}

const outputArg = process.argv[2]
const outputPath = outputArg ?? join(root, 'sbom', 'cyclonedx.json')
mkdirSync(outputPath.replace(/\/[^/]+$/, ''), { recursive: true })
writeFileSync(outputPath, JSON.stringify(bom, null, 2) + '\n')

console.log(`SBOM CycloneDX 1.5 : ${outputPath}`)
console.log(`Composants : ${bom.components.length} bibliothèques (arbre node_modules résolu).`)
console.log(`Serial : ${serialNumber}`)
