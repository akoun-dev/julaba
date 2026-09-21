import { describe, expect, it } from 'vitest'
import { canPerformAction, hasModuleAccess } from '@/lib/backoffice-permissions'

describe('gouvernance Back-office des coopératives', () => {
  it('n’accorde pas la gestion coopérative à un opérateur terrain', () => {
    expect(hasModuleAccess('operateur_terrain', 'cooperatives')).toBe(false)
    expect(canPerformAction('operateur_terrain', 'cooperatives', 'update')).toBe(false)
  })

  it('autorise les administrateurs à administrer les coopératives', () => {
    expect(canPerformAction('super_admin', 'cooperatives', 'create')).toBe(true)
    expect(canPerformAction('gestionnaire_zone', 'cooperatives', 'update')).toBe(true)
  })
})
