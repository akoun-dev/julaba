import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = join(root, 'node_modules', 'tesseract.js-core')
const target = join(root, 'public', 'tesseract', 'core')

const entries = await readdir(source)
const coreAssets = entries.filter((entry) => entry.startsWith('tesseract-core-') || entry === 'tesseract-core.js' || entry === 'tesseract-core.wasm')

if (coreAssets.length === 0) {
  throw new Error('Les ressources tesseract.js-core sont introuvables.')
}

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await Promise.all(coreAssets.map((asset) => cp(join(source, asset), join(target, asset))))

console.info(`[ocr] ${coreAssets.length} ressources Tesseract locales préparées.`)
