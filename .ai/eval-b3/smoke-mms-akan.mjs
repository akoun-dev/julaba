// B3-030 — Smoke test TTS « proxy akan » (piste C de l'évaluation)
//
// But : mesurer RÉELLEMENT, dans ce sandbox, le plombage d'un moteur VITS
// MMS via transformers.js (le même moteur que le futur module `mms-tts.ts`
// de B3-031) :
//   1. le port ONNX onnx-community/mms-tts-aka-ONNX se charge-t-il en Node ?
//   2. la synthèse produit-elle un WAV 16 kHz valide ?
//   3. latence et RTF (temps de synthèse / durée audio) indicatifs CPU.
//
// ⚠️ LIMITE LINGUISTIQUE : ce checkpoint a les poids du DONOR akan
// (facebook/mms-tts-aka). Les textes baoulé y sont lus avec la phonologie
// akan (langue cousine Kwa). Les échantillons produits valident le
// PLOMBAGE technique, pas la qualité baoulé — celle-ci exige soit un
// fine-tune sur Waxal `bci_tts` (CC-BY-4.0), soit B3-032 (locuteur natif).
//
// Usage : node .ai/eval-b3/smoke-mms-akan.mjs   (depuis la racine du dépôt)
// Sortie : .ai/eval-b3/samples/<id>.wav + rapport JSON sur stdout.

// Le port onnx-community/mms-tts-aka-ONNX n'a PAS de tokenizer.json
// (requis par transformers.js v2). Procédure (voir rapport B3-030) :
//   1. Assembler un dossier modèle local : config.json, vocab.json,
//      tokenizer_config.json, special_tokens_map.json, onnx/model.onnx
//      (téléchargés du port) ;
//   2. Générer le tokenizer.json :  python3 .ai/eval-b3/build_tokenizer_json.py <dir>
//   3. Point :  JULABA_MMS_MODEL_DIR=<dir> node .ai/eval-b3/smoke-mms-akan.mjs

import { pipeline, env } from '@xenova/transformers'
import fs from 'node:fs'
import path from 'node:path'

const MODEL_BASE = process.env.JULABA_MMS_MODEL_BASE // ex: /home/z/my-project
const MODEL_NAME = process.env.JULABA_MMS_MODEL_NAME // ex: eval-b3-model
if (
  !MODEL_BASE || !MODEL_NAME
  || !fs.existsSync(path.join(MODEL_BASE, MODEL_NAME, 'onnx/model.onnx'))
) {
  console.error(
    'ERREUR explicite : JULABA_MMS_MODEL_BASE + JULABA_MMS_MODEL_NAME doivent'
    + ' pointer vers un dossier modèle local (base/nom/onnx/model.onnx +'
    + ' tokenizer.json généré par build_tokenizer_json.py).'
    + ' Le port HF seul ne suffit pas (pas de tokenizer.json).'
  )
  process.exit(1)
}

// Cache HF local (hors dépôt). Surchargeable : JULABA_HF_CACHE=... node ...
env.cacheDir = process.env.JULABA_HF_CACHE
  || path.join(process.env.HOME, '.cache', 'julaba-hf-tts')
// Chargement local uniquement : résolution <localModelPath>/<nom>/…
env.localModelPath = MODEL_BASE
env.allowRemoteModels = false

// fp32 (114 Mo) : le plus sûr pour onnxruntime-node (fp16 CPU expérimental).
// Pour le device Android on visera model_fp16.onnx (58 Mo) — voir rapport.
const OUT_DIR = path.resolve('.ai/eval-b3/samples')

// Formules baoulé sûres (orthographe standard). La validité linguistique
// du rendu n'est PAS l'objet de ce smoke — voir en-tête.
const SAMPLES = [
  { id: 'akwaba', text: 'Akwaba !' },
  { id: 'ahou', text: 'Ahou ! Ahou !' },
  { id: 'yako', text: 'Yako.' },
  { id: 'phrase-longue', text: 'Akwaba. Ahou. Yako. Akwaba. Ahou. Yako.' },
]

function encodeWav(float32, sampleRate) {
  const n = float32.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2)
  }
  return buf
}

const ms = (t) => `${(t / 1000).toFixed(2)} s`
const report = { model: `${MODEL_BASE}/${MODEL_NAME}`, dtype: 'fp32', samples: [], errors: [] }

console.log(`[1/3] Chargement depuis ${MODEL_BASE}/${MODEL_NAME} (fp32) — cache: ${env.cacheDir}`)
const tLoad0 = Date.now()
let synthesizer
try {
  synthesizer = await pipeline('text-to-speech', MODEL_NAME, { quantized: false })
} catch (err) {
  console.error('ÉCHEC chargement (erreur explicite, pas de fallback) :', err.message)
  report.errors.push(`load: ${err.message}`)
  process.exit(1)
}
const tLoad = Date.now() - tLoad0
report.loadMs = tLoad
console.log(`      chargé en ${ms(tLoad)}`)

fs.mkdirSync(OUT_DIR, { recursive: true })

console.log('[2/3] Synthèse des échantillons :')
for (const s of SAMPLES) {
  const t0 = Date.now()
  try {
    const out = await synthesizer(s.text)
    const tSynth = Date.now() - t0
    const wav = encodeWav(out.audio, out.sampling_rate)
    const file = path.join(OUT_DIR, `${s.id}.wav`)
    fs.writeFileSync(file, wav)
    const durSec = out.audio.length / out.sampling_rate
    const entry = {
      id: s.id,
      text: s.text,
      synthMs: tSynth,
      audioSec: +durSec.toFixed(2),
      rtf: +(tSynth / 1000 / durSec).toFixed(3),
      samplingRate: out.sampling_rate,
      file,
      bytes: wav.length,
    }
    report.samples.push(entry)
    console.log(
      `  ${s.id.padEnd(14)} synthèse ${ms(tSynth)} | audio ${entry.audioSec}s`
      + ` | RTF ${entry.rtf} | ${(wav.length / 1024).toFixed(0)} Ko`
    )
  } catch (err) {
    console.error(`  ${s.id} ÉCHEC synthèse :`, err.message)
    report.errors.push(`${s.id}: ${err.message}`)
  }
}

console.log('[3/3] Résumé :')
const ok = report.samples.filter((r) => r.rtf !== undefined)
if (ok.length) {
  const avgRtf = ok.reduce((a, r) => a + r.rtf, 0) / ok.length
  report.avgRtf = +avgRtf.toFixed(3)
  console.log(`  RTF moyen (CPU sandbox) : ${report.avgRtf}`)
}
console.log(JSON.stringify(report, null, 2))
process.exit(report.errors.length ? 2 : 0)
