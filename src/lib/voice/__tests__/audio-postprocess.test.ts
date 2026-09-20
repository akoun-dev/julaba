import { describe, it, expect } from 'vitest'

import {
  trimSilence,
  normalizePeak,
  applyFades,
  concatWithPauses,
  buildSpokenUtterance,
  splitSpeechSegments,
} from '../audio-postprocess'

const SR = 16000

/** Signal sinusoïdal normalisé (amplitude `amp`) de `n` échantillons. */
function tone(n: number, amp: number, sampleRate = SR): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * 440 * i) / sampleRate)
  return out
}

/** Silence de `n` échantillons. */
const silence = (n: number): Float32Array => new Float32Array(n)

function peakOf(a: Float32Array): number {
  let p = 0
  for (let i = 0; i < a.length; i++) p = Math.max(p, Math.abs(a[i]))
  return p
}

describe('trimSilence — découpage du silence de tête/queue (MODE-917)', () => {
  it('retire le silence de tête et de queue en conservant la marge', () => {
    // 0,2 s de silence + 0,1 s de ton + 0,3 s de silence (16 kHz)
    const input = Float32Array.from([...silence(3200), ...tone(1600, 0.5), ...silence(4800)])
    const trimmed = trimSilence(input, SR)
    // Marge 50 ms = 800 échantillons de chaque côté du son détecté.
    expect(trimmed.length).toBe(1600 + 2 * 800)
    // Le contenu audible est intact : crête conservée.
    expect(peakOf(trimmed)).toBeCloseTo(0.5, 2)
  })

  it('segment entièrement silencieux → restitué inchangé (jamais de vide)', () => {
    const input = silence(1000)
    expect(trimSilence(input, SR)).toBe(input)
  })

  it('segment sans aucun silence → inchangé', () => {
    const input = tone(4000, 0.5)
    expect(trimSilence(input, SR).length).toBe(4000)
  })

  it('entrée vide → vide (aucune exception)', () => {
    expect(trimSilence(new Float32Array(0), SR).length).toBe(0)
  })
})

describe('normalizePeak — homogénéité du niveau par segment (MODE-917)', () => {
  it('ramène la crête à la cible (0,85 par défaut)', () => {
    const out = normalizePeak(tone(1000, 0.25))
     expect(peakOf(out)).toBeCloseTo(0.82, 3)
  })

  it('réduit un segment trop fort (protection anti-écrêtage)', () => {
    const out = normalizePeak(tone(1000, 1.2))
    // Crête ≈ cible (float32 près) et jamais au-dessus d'un poil de cible.
     expect(peakOf(out)).toBeCloseTo(0.82, 3)
     expect(peakOf(out)).toBeLessThanOrEqual(0.82 + 1e-5)
  })

  it('plafonne le gain (maxGain) pour ne pas réveiller le bruit de fond', () => {
    // Crête 0,02 : gain idéal serait 42,5 — plafonné à 4 ici.
    const out = normalizePeak(tone(1000, 0.02), { maxGain: 4 })
    expect(peakOf(out)).toBeCloseTo(0.08, 4)
  })

  it('segment silencieux → inchangé (pas d amplification de zéros)', () => {
    const input = silence(500)
    expect(normalizePeak(input)).toBe(input)
  })
})

describe('applyFades — fondus anti-clic (MODE-917)', () => {
  it('ouvre et ferme à zéro avec rampe linéaire', () => {
    const input = tone(4000, 0.5)
    const out = applyFades(input, SR)
    expect(out[0]).toBeCloseTo(0, 6)
    expect(out[out.length - 1]).toBeCloseTo(0, 6)
    // Le corps du signal n'est pas touché (au-delà des fondus).
    expect(out[2000]).toBeCloseTo(input[2000], 6)
  })

  it('segment plus court que la somme des fondus → inchangé', () => {
    const input = tone(100, 0.5)
    expect(applyFades(input, SR)).toEqual(input)
  })
})

describe('concatWithPauses — pauses inter-phrases (MODE-917)', () => {
  it('concatène avec une pause silencieuse entre segments', () => {
    const a = tone(1000, 0.5)
    const b = tone(2000, 0.5)
    const out = concatWithPauses([a, b], SR, 220)
    expect(out.length).toBe(3000 + Math.round(SR * 0.22))
    // La pause est à zéro.
    const pause = out.slice(1000, 1000 + Math.round(SR * 0.22))
    expect(peakOf(pause)).toBe(0)
  })

  it('ignore les segments vides et retourne vide sans segment utile', () => {
    expect(concatWithPauses([], SR).length).toBe(0)
    expect(concatWithPauses([new Float32Array(0)], SR).length).toBe(0)
    const a = tone(100, 0.5)
    expect(concatWithPauses([a, new Float32Array(0)], SR).length).toBe(100)
  })
})

describe('buildSpokenUtterance — chaîne complète (MODE-917)', () => {
  it('trim + normalisation homogène + pauses, sur des segments bruts', () => {
    // Deux segments bruts : niveaux différents (0,15 et 0,45), silences encadrants.
    const raw1 = Float32Array.from([...silence(1600), ...tone(1600, 0.15), ...silence(1600)])
    const raw2 = Float32Array.from([...silence(1600), ...tone(1600, 0.45), ...silence(1600)])
    const out = buildSpokenUtterance([raw1, raw2], SR, { pauseMs: 220 })

    const pause = Math.round(SR * 0.22)
    const kept = Math.round(1600 + 2 * 800) // trim, marge 50 ms
    expect(out.length).toBe(kept * 2 + pause)

    // Niveau homogène : crête de chaque segment traité = cible 0,85.
     expect(peakOf(out.slice(0, kept))).toBeCloseTo(0.82, 3)
     expect(peakOf(out.slice(kept + pause, kept * 2 + pause))).toBeCloseTo(0.82, 3)
    expect(peakOf(out.slice(kept, kept + pause))).toBe(0)
  })

  it('segments tous muets → tableau vide (l appelant décide du repli)', () => {
    const out = buildSpokenUtterance([silence(100), silence(100)], SR)
    expect(out.length).toBe(0)
  })
})

describe('splitSpeechSegments — découpage en phrases (MODE-917)', () => {
  it('coupe sur la ponctuation forte suivie d un blanc, et sur les sauts de ligne', () => {
    expect(splitSpeechSegments('I ni ce ! N ye Tata ye. An bɛ sara ye.')).toEqual([
      'I ni ce !',
      'N ye Tata ye.',
      'An bɛ sara ye.',
    ])
    expect(splitSpeechSegments('Première phrase\nDeuxième phrase')).toEqual([
      'Première phrase',
      'Deuxième phrase',
    ])
  })

  it('ne coupe PAS les décimales (12.50 sans blanc après le point)', () => {
    expect(splitSpeechSegments('Le prix est 12.50 F')).toEqual(['Le prix est 12.50 F'])
  })

  it('texte sans ponctuation forte → un seul segment', () => {
    expect(splitSpeechSegments('An bɛ se ka baara kɛ')).toEqual(['An bɛ se ka baara kɛ'])
  })

  it('vide / ponctuation pure → aucun segment', () => {
    expect(splitSpeechSegments('')).toEqual([])
    expect(splitSpeechSegments('   ')).toEqual([])
    expect(splitSpeechSegments('   .  !  ')).toEqual([])
  })
})
