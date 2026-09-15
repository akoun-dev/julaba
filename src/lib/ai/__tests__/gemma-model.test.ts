import { describe, expect, it } from 'vitest'
import { buildGemmaPrompt, GEMMA_ASSISTANT_NAME, GEMMA_MODEL_SIZE_BYTES, mapGemmaError } from '../gemma-model'

describe('gemma model configuration', () => {
  it('keeps the expected Q4 artifact size', () => {
    expect(GEMMA_MODEL_SIZE_BYTES).toBe(558 * 1024 * 1024)
  })

  it('maps native error codes to recoverable French messages', () => {
    expect(mapGemmaError(new Error('[CHECKSUM_MISMATCH] invalid file'))).toEqual({
      code: 'CHECKSUM_MISMATCH',
      message: 'Le fichier téléchargé est incomplet. Relancez le téléchargement.',
    })
  })

  it('uses a safe fallback for unknown native errors', () => {
    expect(mapGemmaError(new Error('socket closed')).code).toBe('UNKNOWN')
  })

  it('gives Gemma Tata Nanti Lou as its identity', () => {
    const prompt = buildGemmaPrompt('Comment tu t’appelles ?')
    expect(GEMMA_ASSISTANT_NAME).toBe('Tata Nanti Lou')
    expect(prompt).toContain('Si l’utilisateur demande ton nom')
    expect(prompt).toContain('Je m’appelle Tata Nanti Lou.')
  })
})
