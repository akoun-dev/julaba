import { describe, expect, it } from 'vitest'
import { AGENT_CODE_PREFIX, buildAgentCode, maxAgentCodeSeq, nextAgentCode, normalizeAgentPhone } from '@/lib/agent-code'

describe('buildAgentCode', () => {
  it('formate une séquence simple sur 4 chiffres', () => {
    expect(buildAgentCode(1)).toBe('JID-0001')
    expect(buildAgentCode(42)).toBe('JID-0042')
    expect(buildAgentCode(1234)).toBe('JID-1234')
  })

  it('dépasse le padding au-delà de 9999 sans perdre de valeur', () => {
    expect(buildAgentCode(12345)).toBe('JID-12345')
  })

  it('retombe sur 1 pour une entrée invalide', () => {
    expect(buildAgentCode(0)).toBe('JID-0001')
    expect(buildAgentCode(-5)).toBe('JID-0001')
    expect(buildAgentCode(Number.NaN)).toBe('JID-0001')
    expect(buildAgentCode(1.9)).toBe('JID-0001')
  })
})

describe('maxAgentCodeSeq', () => {
  it('trouve la plus grande séquence existante', () => {
    expect(maxAgentCodeSeq(['JID-0001', 'JID-0009', 'JID-0042'])).toBe(42)
  })

  it('ignore les codes mal formés', () => {
    expect(maxAgentCodeSeq(['', 'AGENT-1', 'JID-', 'JID-00A', 'jid-0007'])).toBe(7)
  })

  it('renvoie 0 pour une liste vide', () => {
    expect(maxAgentCodeSeq([])).toBe(0)
  })
})

describe('nextAgentCode', () => {
  it('prend la suite de la plus grande séquence', () => {
    expect(nextAgentCode(['JID-0001', 'JID-0002', 'JID-0003'])).toBe('JID-0004')
  })

  it('renvoie JID-0001 pour un roster vide', () => {
    expect(nextAgentCode([])).toBe('JID-0001')
  })

  it('saute une séquence déjà prise (trou comblé manuellement)', () => {
    expect(nextAgentCode(['JID-0001', 'JID-0002'])).toBe('JID-0003')
  })

  it('est insensible à la casse et aux espaces', () => {
    expect(nextAgentCode([' jid-0001 ', 'JID-0002'])).toBe('JID-0003')
  })

  it('préfixe constant exposé pour l\'UI backoffice', () => {
    expect(AGENT_CODE_PREFIX).toBe('JID')
  })
})

describe('normalizeAgentPhone', () => {
  it('normalise espaces et indicatif +225', () => {
    expect(normalizeAgentPhone('05 55 55 55 55')).toBe('0555555555')
    expect(normalizeAgentPhone('+225 05 55 55 55 55')).toBe('0555555555')
    expect(normalizeAgentPhone('0700000001')).toBe('0700000001')
  })
})
