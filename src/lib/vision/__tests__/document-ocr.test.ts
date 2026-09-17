import { describe, expect, it } from 'vitest'

import { extractCniNumber, parseCniFields } from '../document-ocr'

describe('parseCniFields', () => {
  it('lit le layout classique étiqueté (NOM / PRENOMS / SEXE / NNI)', () => {
    const text = [
      "RÉPUBLIQUE DE CÔTE D'IVOIRE",
      'CARTE NATIONALE D\'IDENTITÉ',
      'NOM : KONE',
      'PRENOMS : AWA',
      'SEXE : F',
      'NÉE LE : 01.01.1990',
      'NNI : 0123456789',
      'CI0123456789',
    ].join('\n')

    expect(parseCniFields(text)).toEqual({
      lastName: 'Kone',
      firstName: 'Awa',
      sexe: 'feminin',
      cniNumero: 'CI0123456789',
      nni: '0123456789',
    })
  })

  it('lit le layout numéroté (1. NOM, 2. PRENOMS, 3. SEXE)', () => {
    const text = [
      '1. NOM KONE',
      '2. PRENOMS AWA FATOU',
      '3. SEXE M',
      '5. NNI 9876543210',
    ].join('\n')

    const fields = parseCniFields(text)
    expect(fields.lastName).toBe('Kone')
    // Seul le premier prénom est gardé (champ prénom simple du dossier)
    expect(fields.firstName).toBe('Awa')
    expect(fields.sexe).toBe('masculin')
    expect(fields.nni).toBe('9876543210')
  })

  it('gère les séparateurs variés et espaces OCR', () => {
    const text = 'NOM  YAO\nPRENOMS  KOFFI\nSEXE : M\nNNI  0123456789\nCI0123456789'
    const fields = parseCniFields(text)
    expect(fields.lastName).toBe('Yao')
    expect(fields.firstName).toBe('Koffi')
    expect(fields.sexe).toBe('masculin')
    expect(fields.cniNumero).toBe('CI0123456789')
  })

  it('tombe en repli sur un nombre à 10 chiffres sans étiquette NNI', () => {
    const text = 'NOM DIABATE\nPRENOMS MARIAM\nSEXE F\n0222333444'
    const fields = parseCniFields(text)
    expect(fields.nni).toBe('0222333444')
    expect(fields.sexe).toBe('feminin')
  })

  it('retourne un objet vide sur un texte hors CNI', () => {
    expect(parseCniFields('Facture marché Gone Todo Ba')).toEqual({})
    expect(parseCniFields('')).toEqual({})
  })

  it('ne prend pas PRENOMS pour le NOM', () => {
    const fields = parseCniFields('PRENOMS AWA\nSEXE F')
    expect(fields.lastName).toBeUndefined()
    expect(fields.firstName).toBe('Awa')
  })
})

describe('extractCniNumber', () => {
  it('extrait un numéro CI collé', () => {
    expect(extractCniNumber('Carte CI0123456789 valable')).toBe('CI0123456789')
  })

  it('extrait un numéro espacé et le normalise', () => {
    expect(extractCniNumber('N° CI 0123 4567 89')).toBe('CI0123456789')
  })

  it('retourne null sans motif CI', () => {
    expect(extractCniNumber('NNI 0123456789 seul')).toBeNull()
  })
})
