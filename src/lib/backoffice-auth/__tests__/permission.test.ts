import { describe, expect, it } from 'vitest'
import { canAccessZone } from '../permission'
import type { BoSessionUser } from '../session'

// AUDIT-005 — canAccessZone FAIL-CLOSED : un rôle zoné sans zone assignée
// n'accède à rien, et une ressource sans zone est hors de portée d'un rôle
// zoné. AVANT, les deux cas étaient fail-open (contrôle contourné).

function user(overrides: Partial<BoSessionUser>): BoSessionUser {
  return {
    id: 'u-1',
    email: 'u@julaba.ci',
    name: 'Agent',
    role: 'gestionnaire_zone',
    zone: 'Abidjan',
    isActive: true,
    mustChangePassword: false,
    ...overrides,
  }
}

describe('canAccessZone — rôles non zonés (accès national)', () => {
  it('super_admin : accès à tout, même sans zone', () => {
    expect(canAccessZone(user({ role: 'super_admin', zone: null }), 'Abidjan')).toBe(true)
    expect(canAccessZone(user({ role: 'super_admin', zone: null }), null)).toBe(true)
  })

  it('admin_national : accès à tout', () => {
    expect(canAccessZone(user({ role: 'admin_national', zone: null }), 'Bouaké')).toBe(true)
  })
})

describe('canAccessZone — rôle zoné avec zone assignée', () => {
  it('sa propre zone : autorisé', () => {
    expect(canAccessZone(user({ zone: 'Abidjan' }), 'Abidjan')).toBe(true)
  })

  it('une autre zone : refusé', () => {
    expect(canAccessZone(user({ zone: 'Abidjan' }), 'Bouaké')).toBe(false)
  })

  it('ressource sans zone (périmètre national) : refusé (fail-closed)', () => {
    expect(canAccessZone(user({ zone: 'Abidjan' }), null)).toBe(false)
    expect(canAccessZone(user({ zone: 'Abidjan' }), undefined)).toBe(false)
    expect(canAccessZone(user({ zone: 'Abidjan' }), '')).toBe(false)
  })
})

describe('canAccessZone — rôle zoné SANS zone assignée (fail-closed)', () => {
  it('aucune ressource n\u2019est accessible, même sans zone', () => {
    expect(canAccessZone(user({ zone: null }), null)).toBe(false)
    expect(canAccessZone(user({ zone: null }), 'Abidjan')).toBe(false)
    expect(canAccessZone(user({ zone: '' }), 'Abidjan')).toBe(false)
  })

  it('operateur_terrain suit la même règle que gestionnaire_zone', () => {
    expect(canAccessZone(user({ role: 'operateur_terrain', zone: null }), 'Abidjan')).toBe(false)
    expect(canAccessZone(user({ role: 'operateur_terrain', zone: 'Abidjan' }), 'Abidjan')).toBe(true)
    expect(canAccessZone(user({ role: 'operateur_terrain', zone: 'Abidjan' }), 'Bouaké')).toBe(false)
  })
})
