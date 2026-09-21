import { describe, expect, it } from 'vitest'
import {
  hasUsableChecksums,
  isProtectedVoiceContext,
  prepareIvorianVoiceText,
  validateVoicePackManifest,
  type VoicePackManifest,
} from '../voice-pack'

const manifest: VoicePackManifest = {
  manifestVersion: 1,
  pack: {
    id: 'ivoirian-tts-nouchi-v1',
    version: '1.0.0',
    minAppVersion: '1.0.0',
    status: 'pilot',
    supportedLocales: ['fr-CI'],
    supportedRegisters: ['clear', 'natural-ivorian', 'nouchi-controlled'],
  },
  artifacts: {
    model: { relativePath: 'model.onnx', sizeBytes: 100, sha256: 'a'.repeat(64) },
    tokens: { relativePath: 'tokens.txt', sizeBytes: 10, sha256: 'd'.repeat(64) },
    espeakData: { relativePath: 'espeak-ng-data.zip', sizeBytes: 20, sha256: 'e'.repeat(64) },
    lexicon: { relativePath: 'lexicon.json', sha256: 'b'.repeat(64) },
    pronunciationRules: { relativePath: 'pronunciation-rules.json', sha256: 'c'.repeat(64) },
  },
  downloadPolicy: {
    delivery: 'explicit-opt-in',
    recommendedNetwork: 'wifi',
    allowMeteredNetwork: false,
    allowCellularOverride: true,
    requiresFreeSpaceBytes: 100,
    verifyBeforeActivation: true,
    activationRequiresChecksum: true,
    offlineAfterInstall: true,
  },
  deviceRequirements: { minimumAndroidSdk: 26, minimumRamMb: 512, recommendedRamMb: 1024 },
  license: { commercialUseAllowed: true, commercialUseReviewRequired: false, attributionRequired: true },
  languagePolicy: {
    canonicalTextLanguage: 'fr',
    nouchiIsControlledRegister: true,
    neverInventNouchi: true,
    neverUseNouchiForFinancialConfirmation: true,
    fallbackRegister: 'clear',
  },
  lexicon: [
    {
      id: 'lex-001',
      surface: 'gbê',
      normalized: 'gbê',
      spokenForm: 'gbê',
      category: 'encouragement',
      register: 'nouchi-controlled',
      contextsAllowed: ['encouragement'],
      contextsForbidden: ['sale_confirmation'],
      semanticRisk: 'medium',
      review: { status: 'approved', reviewers: ['locuteur-1'] },
    },
  ],
  protectedPhrases: [],
  normalization: {
    amounts: { currency: 'XOF', spokenCurrency: 'francs CFA', spellOutNumbers: true, maxDigits: 9 },
    abbreviations: { FCFA: 'francs CFA' },
  },
}

describe('voice-pack', () => {
  it('valide un manifeste version 1 avec garde-fous obligatoires', () => {
    expect(validateVoicePackManifest(manifest)).toBe(manifest)
    expect(hasUsableChecksums(manifest)).toBe(true)
  })

  it('refuse un manifeste qui autorise le nouchi dans les confirmations financières', () => {
    expect(() => validateVoicePackManifest({
      ...manifest,
      languagePolicy: { ...manifest.languagePolicy, neverUseNouchiForFinancialConfirmation: false },
    })).toThrow('VOICE_PACK_INVALID_MANIFEST')
  })

  it('force le registre clair pour une vente', () => {
    const prepared = prepareIvorianVoiceText(
      'Vente enregistrée pour 1 500 FCFA',
      'sale_confirmation',
      'nouchi-controlled',
      manifest,
    )
    expect(prepared.effectiveRegister).toBe('clear')
    expect(prepared.lexiconIdsApplied).toEqual([])
    expect(prepared.protected).toBe(true)
    expect(prepared.text).toContain('mille cinq cents francs CFA')
  })

  it('applique uniquement un terme approuvé dans son contexte', () => {
    const prepared = prepareIvorianVoiceText('On va gbê', 'encouragement', 'nouchi-controlled', manifest)
    expect(prepared.effectiveRegister).toBe('nouchi-controlled')
    expect(prepared.lexiconIdsApplied).toEqual(['lex-001'])
  })

  it('identifie tous les contextes sensibles', () => {
    expect(isProtectedVoiceContext('payment_confirmation')).toBe(true)
    expect(isProtectedVoiceContext('security_code')).toBe(true)
    expect(isProtectedVoiceContext('encouragement')).toBe(false)
  })
})
