// Smoke NLLB-200 réel — mesure taille/latence du modèle offline (B2-021).
// Usage : node scripts/smoke-nllb.mjs
// Télécharge Xenova/nllb-200-distilled-600M (poids q8 ≈ 872 Mo MESURÉS) depuis
// Hugging Face puis traduit des phrases métier (agriculture/commerce) dans
// les deux sens bci_Latn ↔ fra_Latn. Node uniquement (ONNX Runtime Node) ;
// le runtime de production reste le navigateur/WebView (WASM, CSP
// 'wasm-unsafe-eval' déjà en place).
//
// ⚠️ REQUISEMENTS : ≥ 4 Go de RAM libre (le chargement du modèle dépasse la
// RAM du sandbox de build : OOM kill à ~2,3 Go, constaté 2026-09-18).
// Cache FS réel de Transformers.js v2 en Node :
//   node_modules/@xenova/transformers/.cache/Xenova/nllb-200-distilled-600M/
// (PAS ./.cache du projet — piège constaté ; les fichiers peuvent être
// pré-placés via curl pour économiser le réseau).
// OPTIONS : --local (aucun réseau, exige le cache complet).

const useLocal = process.argv.includes('--local')

import { pipeline } from '@xenova/transformers'

const MODEL_ID = 'Xenova/nllb-200-distilled-600M'

const sizes = new Map()
let lastFile = null
const onProgress = (info) => {
  if (info.status === 'progress' && info.file) {
    sizes.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 })
    if (info.file !== lastFile) {
      lastFile = info.file
      process.stdout.write(`\n  ↓ ${info.file}`)
    }
  }
}

console.log(`[1/3] Téléchargement/chargement de ${MODEL_ID} (q8)…`)
const t0 = Date.now()
const translator = await pipeline(
  'translation',
  MODEL_ID,
  useLocal ? { local_files_only: true } : { progress_callback: onProgress },
)
const loadMs = Date.now() - t0

let totalBytes = 0
const lines = []
for (const [file, { loaded, total }] of sizes) {
  const bytes = total || loaded
  totalBytes += bytes
  lines.push(`    ${file}: ${(bytes / 1048576).toFixed(1)} Mo`)
}
console.log('  Fichiers :')
console.log(lines.join('\n'))
console.log(
  `  TOTAL ≈ ${(totalBytes / 1048576).toFixed(1)} Mo · chargement ${loadMs / 1000} s\n`,
)

const cases = [
  { label: 'fra→bci agricole', src: 'fra_Latn', tgt: 'bci_Latn', text: "J'ai récolté cent kilos de manioc." },
  { label: 'fra→bci commerce ', src: 'fra_Latn', tgt: 'bci_Latn', text: 'Je vends un sac de riz à dix mille francs.' },
  { label: 'fra→bci question ', src: 'fra_Latn', tgt: 'bci_Latn', text: "Combien coûte le sac de riz ?" },
  { label: 'bci→fra (sample) ', src: 'bci_Latn', tgt: 'fra_Latn', text: 'Kun mɔ o su nun dunman ye' },
]

console.log('[2/3] Traductions (latence par phrase) :')
const results = []
for (const c of cases) {
  const t = Date.now()
  const out = await translator(c.text, { src_lang: c.src, tgt_lang: c.tgt, max_new_tokens: 128 })
  const ms = Date.now() - t
  const text = out?.[0]?.translation_text ?? '(vide)'
  results.push({ ...c, out: text, ms })
  console.log(`  [${c.label}] ${ms} ms`)
  console.log(`      IN : ${c.text}`)
  console.log(`      OUT: ${text}`)
}

const rt = results.find((r) => r.tgt === 'bci_Latn')
if (rt) {
  console.log('\n[3/3] Round-trip bci→fra (contrôle de sens) :')
  const t = Date.now()
  const back = await translator(rt.out, { src_lang: 'bci_Latn', tgt_lang: 'fra_Latn', max_new_tokens: 128 })
  console.log(`      fra→bci : ${rt.text}`)
  console.log(`      → bci   : ${rt.out}`)
  console.log(`      → fra   : ${back?.[0]?.translation_text ?? '(vide)'} (${Date.now() - t} ms)`)
}

console.log('\nSMOKE_NLLB_OK')
