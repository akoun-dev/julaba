import { describe, it, expect } from 'vitest'
import { toSpeechText } from '../speech-text'

describe('toSpeechText', () => {
  it('verbalise les formats de montants reconnus', () => {
    expect(toSpeechText('1 500 FCFA')).toBe('mille cinq cents francs CFA')
    expect(toSpeechText('1500 FCFA')).toBe('mille cinq cents francs CFA')
    expect(toSpeechText('1 500 francs')).toBe('mille cinq cents francs CFA')
    expect(toSpeechText('1500 f')).toBe('mille cinq cents francs CFA')
    expect(toSpeechText('Total : 25 000 F')).toBe('Total : vingt-cinq mille francs CFA')
  })

  it('exemples d’acceptation Tata', () => {
    expect(toSpeechText('Vente de 1 500 FCFA')).toBe('Vente de mille cinq cents francs CFA')
    expect(
      toSpeechText("Vente de tomates pour 1 500 FCFA, c'est bien ça ?"),
    ).toBe("Vente de tomates pour mille cinq cents francs CFA, c'est bien ça ?")
  })

  it('absence de doublon de devise', () => {
    expect(toSpeechText('1 500 FCFA FCFA')).toBe('mille cinq cents francs CFA')
    expect(toSpeechText('1 500 francs francs')).toBe('mille cinq cents francs CFA')
    expect(toSpeechText('1500 f francs')).toBe('mille cinq cents francs CFA')
  })

  it('traite chaque montant d’une phrase indépendamment', () => {
    expect(toSpeechText('2 000 FCFA, puis 3 000 FCFA')).toBe(
      'deux mille francs CFA, puis trois mille francs CFA',
    )
  })

  it('accorde franc/francs selon la valeur', () => {
    expect(toSpeechText('1 FCFA')).toBe('un franc CFA')
    expect(toSpeechText('0 FCFA')).toBe('zéro franc CFA')
    expect(toSpeechText('500 F')).toBe('cinq cents francs CFA')
  })

  it('ne modifie PAS les PIN, téléphones et codes', () => {
    expect(toSpeechText('PIN 2580')).toBe('PIN 2580')
    expect(toSpeechText('Téléphone 0700000000')).toBe('Téléphone 0700000000')
    expect(toSpeechText('Code JID-0042')).toBe('Code JID-0042')
    expect(toSpeechText('Entrez le code 1234 puis validez')).toBe(
      'Entrez le code 1234 puis validez',
    )
  })

  it('mêle montant et identifiant sans confusion', () => {
    expect(toSpeechText('PIN 2580 et total 25 000 F')).toBe(
      'PIN 2580 et total vingt-cinq mille francs CFA',
    )
  })

  it('laisse les dates et références intactes', () => {
    expect(toSpeechText('Le 12/05/2024')).toBe('Le 12/05/2024')
    expect(toSpeechText('Dossier n° 2024-77')).toBe('Dossier n° 2024-77')
    expect(toSpeechText('Facture 45, ligne 3')).toBe('Facture 45, ligne 3')
  })

  it('laisse les montants déjà écrits en lettres intacts (idempotence)', () => {
    expect(toSpeechText('mille cinq cents francs CFA')).toBe('mille cinq cents francs CFA')
    expect(toSpeechText('vingt-cinq mille francs')).toBe('vingt-cinq mille francs')
    expect(toSpeechText(toSpeechText('1 500 FCFA'))).toBe('mille cinq cents francs CFA')
  })

  it('gère les séparateurs de milliers insécables produits par le formatage', () => {
    expect(toSpeechText('1\u00A0500 FCFA')).toBe('mille cinq cents francs CFA')
    expect(toSpeechText('25\u202F000 F')).toBe('vingt-cinq mille francs CFA')
    expect(toSpeechText('1\u2009500 francs')).toBe('mille cinq cents francs CFA')
  })

  it('ne transforme pas les nombres sans devise (quantités, références)', () => {
    expect(toSpeechText('5 sacs de riz')).toBe('5 sacs de riz')
    expect(toSpeechText('Vente numéro 1500')).toBe('Vente numéro 1500')
    expect(toSpeechText('1500 fois plus petit')).toBe('1500 fois plus petit')
  })

  it('ne déforme pas les valeurs décimales (montants toujours entiers)', () => {
    expect(toSpeechText('1500.50 FCFA')).toBe('1500.50 FCFA')
  })

  it('gère les entrées dégénérées', () => {
    expect(toSpeechText('')).toBe('')
    expect(toSpeechText('Aucun montant ici')).toBe('Aucun montant ici')
    expect(toSpeechText('FCFA')).toBe('FCFA')
  })
})
