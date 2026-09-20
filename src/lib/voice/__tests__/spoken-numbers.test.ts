import { describe, it, expect } from 'vitest'

import {
  dyuNumberToWords,
  spellNumbersForDyu,
  bciNumberToWords,
  spellNumbersForBci,
} from '../spoken-numbers'
import { MMS_DYU_VOCAB } from '../mms-dyu-assets'

describe('dyuNumberToWords — numérales jula (sources croisées, MODE-917)', () => {
  it('unités 1–9 (coastsystems Dyula : looru, wɔɔrɔ, woronfila, seegi, kɔnɔtɔ)', () => {
    expect(dyuNumberToWords(1)).toBe('kelen')
    expect(dyuNumberToWords(2)).toBe('fila')
    expect(dyuNumberToWords(5)).toBe('looru')
    expect(dyuNumberToWords(6)).toBe('wɔɔrɔ')
    expect(dyuNumberToWords(7)).toBe('woronfila')
    expect(dyuNumberToWords(8)).toBe('seegi')
    expect(dyuNumberToWords(9)).toBe('kɔnɔtɔ')
  })

  it('dizaines : tan (10), « tan ni X » (11–19), mugan (20), « bi X » (30–90)', () => {
    expect(dyuNumberToWords(10)).toBe('tan')
    expect(dyuNumberToWords(11)).toBe('tan ni kelen')
    expect(dyuNumberToWords(19)).toBe('tan ni kɔnɔtɔ')
    expect(dyuNumberToWords(20)).toBe('mugan')
    expect(dyuNumberToWords(21)).toBe('mugan ni kelen')
    expect(dyuNumberToWords(30)).toBe('bi saba')
    expect(dyuNumberToWords(40)).toBe('bi naani')
    expect(dyuNumberToWords(99)).toBe('bi kɔnɔtɔ ni kɔnɔtɔ')
  })

  it('centaines multiplicatives (kɛmɛ) et liaison additive « ni »', () => {
    expect(dyuNumberToWords(100)).toBe('kɛmɛ')
    expect(dyuNumberToWords(105)).toBe('kɛmɛ ni looru')
    expect(dyuNumberToWords(200)).toBe('kɛmɛ fila')
    expect(dyuNumberToWords(999)).toBe('kɛmɛ kɔnɔtɔ ni bi kɔnɔtɔ ni kɔnɔtɔ')
  })

  it('milliers (waa) et millions (milyɔn) — prix du marché couverts', () => {
    expect(dyuNumberToWords(1000)).toBe('waa')
    expect(dyuNumberToWords(1500)).toBe('waa ni kɛmɛ looru')
    expect(dyuNumberToWords(2000)).toBe('waa fila')
    expect(dyuNumberToWords(5000)).toBe('waa looru')
    expect(dyuNumberToWords(25000)).toBe('waa mugan ni looru')
    // 2 500 000 = 2 millions + 500 000 (= waa × 500 → waa kɛmɛ looru).
    expect(dyuNumberToWords(2500000)).toBe('milyɔn fila ni waa kɛmɛ looru')
  })

  it('hors périmètre → null (l appelant garde le comportement actuel)', () => {
    expect(dyuNumberToWords(0)).toBeNull()
    expect(dyuNumberToWords(-5)).toBeNull()
    expect(dyuNumberToWords(1.5)).toBeNull()
    expect(dyuNumberToWords(1_000_000_000)).toBeNull()
  })
})

describe('spellNumbersForDyu — les prix deviennent audibles (MODE-917)', () => {
  it('convertit les montants chiffrés en mots jula', () => {
    expect(spellNumbersForDyu('vente 1500 FCFA')).toBe('vente waa ni kɛmɛ looru FCFA')
    expect(spellNumbersForDyu('An bɛ sara 5000 F ye.')).toBe('An bɛ sara waa looru F ye.')
  })

  it('ne convertit PAS les runs longs (téléphones, identifiants) : muet vaut mieux que faux', () => {
    expect(spellNumbersForDyu('pin 0701020304')).toBe('pin 0701020304')
  })

  it('zéro et cas non convertibles → inchangés (pause, comportement actuel)', () => {
    expect(spellNumbersForDyu('stock 0')).toBe('stock 0')
  })

  it('idempotent (la sortie ne contient plus de chiffres convertissables)', () => {
    const once = spellNumbersForDyu('Tomates : 2500 F. Riz : 12000 F.')
    // 2500 = waa fila ni kɛmɛ looru ; 12000 = waa × 12 = waa tan ni fila.
    // La ponctuation reste (elle devient des pauses côté normalisateur).
    expect(once).toBe('Tomates : waa fila ni kɛmɛ looru F. Riz : waa tan ni fila F.')
    expect(spellNumbersForDyu(once)).toBe(once)
  })
})

describe('bciNumberToWords — numérales baoulé, périmètre serré (MODE-917)', () => {
  it('1–10 sources (omniglot + baoule.ci + desmotsetdeslangues)', () => {
    expect(bciNumberToWords(1)).toBe('kun')
    expect(bciNumberToWords(2)).toBe('nnyɔn')
    expect(bciNumberToWords(3)).toBe('nsan')
    expect(bciNumberToWords(4)).toBe('nnan')
    expect(bciNumberToWords(5)).toBe('nnun')
    expect(bciNumberToWords(6)).toBe('nsiɛn')
    expect(bciNumberToWords(7)).toBe('nso')
    expect(bciNumberToWords(8)).toBe('mɔsuɛ')
    expect(bciNumberToWords(9)).toBe('ngwlan')
    expect(bciNumberToWords(10)).toBe('blu')
  })

  it('au-delà de 10 → null (centaines/milliers NON sourcées : on n invente pas)', () => {
    expect(bciNumberToWords(0)).toBeNull()
    expect(bciNumberToWords(11)).toBeNull()
    expect(bciNumberToWords(20)).toBeNull()
    expect(bciNumberToWords(100)).toBeNull()
  })
})

describe('spellNumbersForBci — nombres isolés d un seul chiffre uniquement', () => {
  it('convertit les quantités unitaires du marché', () => {
    expect(spellNumbersForBci('3 kilo de riz')).toBe('nsan kilo de riz')
    expect(spellNumbersForBci('A ni 2 ye')).toBe('A ni nnyɔn ye')
  })

  it('ne touche PAS aux runs multi-chiffres (20, 1500) : chiffre à chiffre serait faux', () => {
    expect(spellNumbersForBci('1500 F')).toBe('1500 F')
    expect(spellNumbersForBci('20 kilo')).toBe('20 kilo')
  })

  it('idempotent', () => {
    const once = spellNumbersForBci('2 kilo, 3 sacs — 1500 F')
    expect(spellNumbersForBci(once)).toBe(once)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// GARDE ANTI-TROU SILENCIEUX : tout mot généré doit être composé UNIQUEMENT
// de caractères présents dans le vocab du checkpoint — sinon la whitelist du
// tokenizer supprimerait des lettres (texte mutilé) ou le mot entier.
// ════════════════════════════════════════════════════════════════════════════

describe('conformité vocab — aucun caractère hors checkpoint (MODE-917)', () => {
  /** Vocab char-level du checkpoint akan pilote (onnx-community/mms-tts-aka-ONNX,
   * vocab.json — vérifié au sandbox 2026-09-20 : PAS de « c », « q », « x »…). */
  const BCI_VOCAB_CHARS = new Set([
    ' ', "'", '-', '2', '3', '_', 'a', 'b', 'd', 'e', 'f', 'g', 'h', 'i', 'k',
    'l', 'm', 'n', 'o', 'p', 'r', 's', 't', 'u', 'w', 'y', 'á', 'ɔ', 'ɛ', 'ʼ',
  ])

  function assertCharsInVocab(words: string[], vocab: Set<string>, label: string): void {
    for (const word of words) {
      for (const ch of word) {
        expect(vocab.has(ch), `${label} « ${word} » : caractère hors vocab « ${ch} »`).toBe(true)
      }
    }
  }

  it('dyu : numérales ⊆ vocab dyu embarqué (32 symboles, ŋ ɔ ɛ ɲ)', () => {
    const dyuVocab = new Set(Object.keys(MMS_DYU_VOCAB))
    const samples: number[] = []
    for (let n = 1; n <= 999; n++) samples.push(n)
    for (const n of [1500, 5000, 25000, 123456, 999999]) samples.push(n)
    const words = samples
      .map((n) => dyuNumberToWords(n))
      .filter((w): w is string => w !== null)
    expect(words.length).toBeGreaterThan(1000)
    assertCharsInVocab(words, dyuVocab, 'dyu')
  })

  it('bci : numérales 1–10 ⊆ vocab akan pilote (adaptation mɔsuɛ incluse)', () => {
    const words: string[] = []
    for (let n = 1; n <= 10; n++) {
      const w = bciNumberToWords(n)
      if (w) words.push(w)
    }
    expect(words).toHaveLength(10)
    assertCharsInVocab(words, BCI_VOCAB_CHARS, 'bci')
  })

  it('dyu/bci : sortie de spellNumbers sans chiffres restants (cas convertibles)', () => {
    expect(spellNumbersForDyu('sara 250 F')).not.toMatch(/\d/)
    expect(spellNumbersForBci('5 kilo')).not.toMatch(/\d/)
  })
})
