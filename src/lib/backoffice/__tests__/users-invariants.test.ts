import { describe, expect, it } from 'vitest'
import { invariantCreationRole, invariantModificationCompte } from '../users-invariants'

/**
 * AUDIT-012 P1-9 — invariants de gouvernance des comptes back-office :
 * aucun agent ne crée un rôle supérieur au sien, ne se rétrograde/se
 * désactive lui-même, ne modifie un compte supérieur, ne désactive le
 * dernier super_admin actif.
 */

describe('invariantCreationRole', () => {
  it('un super_admin peut créer n\u2019importe quel rôle connu', () => {
    expect(invariantCreationRole('super_admin', 'gestionnaire_zone')).toEqual({ ok: true })
    expect(invariantCreationRole('super_admin', 'super_admin')).toEqual({ ok: true })
  })

  it('un gestionnaire_zone ne peut PAS créer un admin_national (supérieur)', () => {
    const v = invariantCreationRole('gestionnaire_zone', 'admin_national')
    expect(v).toEqual({ ok: false, status: 403, erreur: expect.stringContaining('supérieur') })
  })

  it('un opérateur terrain ne peut pas créer un gestionnaire_zone', () => {
    expect(invariantCreationRole('operateur_terrain', 'gestionnaire_zone').ok).toBe(false)
  })

  it('rôle cible inconnu → 400 (doublon défensif de A11-F15)', () => {
    const v = invariantCreationRole('super_admin', 'empereur')
    expect(v).toEqual({ ok: false, status: 400, erreur: 'Role inconnu' })
  })

  it('créer un rôle de MÊME niveau est permis (ex. admin_national → admin_national)', () => {
    expect(invariantCreationRole('admin_national', 'admin_national')).toEqual({ ok: true })
  })
})

describe('invariantModificationCompte', () => {
  it('modification d\u2019un compte de rôle supérieur → 403', () => {
    const v = invariantModificationCompte({
      roleActeur: 'gestionnaire_zone', roleCible: 'super_admin',
      cibleEstActeur: false, desactiveCible: false, autresSuperAdminsActifs: 2,
    })
    expect(v.ok).toBe(false)
    expect(v).toMatchObject({ status: 403 })
  })

  it('auto-désactivation interdite même pour un super_admin', () => {
    const v = invariantModificationCompte({
      roleActeur: 'super_admin', roleCible: 'super_admin',
      cibleEstActeur: true, desactiveCible: true, autresSuperAdminsActifs: 3,
    })
    expect(v.ok).toBe(false)
    expect(v).toMatchObject({ erreur: expect.stringContaining('Auto-rétrogradation') })
  })

  it('auto-rétrogradation interdite (rolePropose inférieur)', () => {
    const v = invariantModificationCompte({
      roleActeur: 'admin_general', roleCible: 'admin_general',
      cibleEstActeur: true, rolePropose: 'operateur_terrain',
      desactiveCible: false, autresSuperAdminsActifs: 2,
    })
    expect(v.ok).toBe(false)
  })

  it('la désactivation du DERNIER super_admin actif → 409', () => {
    const v = invariantModificationCompte({
      roleActeur: 'super_admin', roleCible: 'super_admin',
      cibleEstActeur: false, desactiveCible: true, autresSuperAdminsActifs: 0,
    })
    expect(v).toEqual({ ok: false, status: 409, erreur: expect.stringContaining('dernier super-administrateur') })
  })

  it('la rétrogradation du DERNIER super_admin actif → 409', () => {
    const v = invariantModificationCompte({
      roleActeur: 'super_admin', roleCible: 'super_admin',
      cibleEstActeur: false, rolePropose: 'admin_general',
      desactiveCible: false, autresSuperAdminsActifs: 0,
    })
    expect(v.ok).toBe(false)
    expect(v).toMatchObject({ status: 409 })
  })

  it('désactiver un super_admin parmi d\u2019autres actifs → permis', () => {
    expect(invariantModificationCompte({
      roleActeur: 'super_admin', roleCible: 'super_admin',
      cibleEstActeur: false, desactiveCible: true, autresSuperAdminsActifs: 2,
    })).toEqual({ ok: true })
  })

  it('renommage d\u2019un compte pair sans changement de rôle/activité → permis', () => {
    expect(invariantModificationCompte({
      roleActeur: 'admin_national', roleCible: 'admin_national',
      cibleEstActeur: false, desactiveCible: false, autresSuperAdminsActifs: 1,
    })).toEqual({ ok: true })
  })

  it('rôle proposé inconnu → 400', () => {
    const v = invariantModificationCompte({
      roleActeur: 'super_admin', roleCible: 'operateur_terrain',
      cibleEstActeur: false, rolePropose: 'empereur',
      desactiveCible: false, autresSuperAdminsActifs: 1,
    })
    expect(v).toEqual({ ok: false, status: 400, erreur: 'Role inconnu' })
  })
})
