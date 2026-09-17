// Test E2E du pipeline Kokoro français en Node (hors navigateur) :
// 1. toSpeechText (montants FCFA → lettres)
// 2. espeak-ng WASM phonémisation fr-fr (argv UTF-8 via -b 1, fichier FS via preRun)
// 3. kokoro-js : tokenizer(phonèmes) puis generate_from_ids avec ff_siwis
//    (bypass de la carte VOICES figée qui ne contient que les voix anglaises)
// 4. export WAV pour vérification manuelle
import fs from 'node:fs/promises'
import ESpeakNg from 'espeak-ng'
import { KokoroTTS } from 'kokoro-js'
import { toSpeechText } from '../src/lib/voice/speech-text'

const OUT = '/tmp/kokoro-fr-e2e.wav'

async function phonemizeFr(text) {
  let fsHandle = null
  const espeak = await ESpeakNg({
    arguments: ['--phonout', 'g', '-q', '--ipa=3', '-v', 'fr-fr', '-f', 'in.txt', '-b', '1'],
    preRun: (m) => {
      fsHandle = m.FS
      fsHandle.writeFile('in.txt', text, { encoding: 'utf8' })
    },
  })
  const raw = fsHandle.readFile('g', { encoding: 'utf8' }).trim()
  return raw.replace(/\n/g, ' ')
}

const spoken = toSpeechText('Vente de tomates pour 1 500 FCFA, c est bien ça ?')
console.log('texte parlé :', spoken)
const phonemes = await phonemizeFr(spoken)
console.log('phonèmes fr :', phonemes.slice(0, 120), '…')

console.log('chargement du modèle (q8, ~86 Mo)…')
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8' })
console.log('modèle chargé')

const { input_ids } = tts.tokenizer(phonemes, { truncation: true })
console.log('input_ids dims :', input_ids.dims)

const audio = await tts.generate_from_ids(input_ids, { voice: 'ff_siwis', speed: 0.9 })
console.log('audio :', audio.audio.length, 'échantillons @', audio.sampling_rate, 'Hz =', (audio.audio.length / audio.sampling_rate).toFixed(2), 's')

// Export WAV PCM 16 bits mono
const wav = audio.toWav()
await fs.writeFile(OUT, Buffer.from(wav))
console.log('WAV écrit :', OUT)
