import { describe, expect, it } from 'vitest'
import {
  MAX_SEARCH_TERM_LENGTH,
  isUuid,
  sanitizeSearchTerm,
} from '../postgrest-search'

// AUDIT-005 — durcissement des filtres de recherche PostgREST. Les valeurs
// interpolées dans la grammaire .or("col.ilike.%<valeur>%") d'une route
// service_role doivent être neutralisées (séparateurs, jokers) et les
// identifiants UUID validés strictement avant interpolation.

describe('sanitizeSearchTerm', () => {
  it('conserve un terme de recherche légitime', () => {
    expect(sanitizeSearchTerm('Awa KONE')).toBe('Awa KONE')
    expect(sanitizeSearchTerm('contact@julaba.ci')).toBe('contact@julaba.ci')
    expect(sanitizeSearchTerm("d'exploitation")).toBe("d'exploitation")
  })

  it('neutralise les séparateurs de la grammaire .or()', () => {
    // Injection classique : fermer la valeur et ajouter un filtre arbitraire.
    expect(sanitizeSearchTerm('a),zone.eq.WORLD')).toBe('a zone.eq.WORLD')
    expect(sanitizeSearchTerm('a,(b)')).toBe('a b')
  })

  it('neutralise les jokers LIKE % et _', () => {
    expect(sanitizeSearchTerm('50%_réduction')).toBe('50 réduction')
  })

  it('neutralise les backslashes (caractère d\u2019échappement)', () => {
    expect(sanitizeSearchTerm('a\\b')).toBe('a b')
  })

  it('compacte les espaces et trim', () => {
    expect(sanitizeSearchTerm('   awa     kone   ')).toBe('awa kone')
  })

  it('borne la longueur à MAX_SEARCH_TERM_LENGTH', () => {
    const long = 'x'.repeat(200)
    expect(sanitizeSearchTerm(long)).toHaveLength(MAX_SEARCH_TERM_LENGTH)
  })

  it('entrée non-chaîne → chaîne vide (l\u2019appelant omet le filtre)', () => {
    expect(sanitizeSearchTerm(null)).toBe('')
    expect(sanitizeSearchTerm(undefined)).toBe('')
    expect(sanitizeSearchTerm(42)).toBe('')
    expect(sanitizeSearchTerm({ evil: true })).toBe('')
  })

  it('injection PostgREST réelle : la grammaire .or() reste invalide', () => {
    const payload = "x),zone.eq.*),id.eq.1234"
    const clean = sanitizeSearchTerm(payload)
    expect(clean).not.toContain('(')
    expect(clean).not.toContain(')')
  })
})

describe('isUuid', () => {
  it('accepte un UUID canonique (toutes casses)', () => {
    expect(isUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true)
    expect(isUuid('123E4567-E89B-12D3-A456-426614174000')).toBe(true)
  })

  it('refuse les variantes injectables', () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000,id.eq.other")).toBe(false)
    expect(isUuid('123e4567-e89b-12d3-a456-42661417400')).toBe(false)
    expect(isUuid('123e4567e89b12d3a456426614174000')).toBe(false)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(null)).toBe(false)
    expect(isUuid(undefined)).toBe(false)
    expect(isUuid(123)).toBe(false)
  })
})
