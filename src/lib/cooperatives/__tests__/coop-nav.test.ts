import { describe, it, expect } from 'vitest'

/**
 * MODE-974 (AUDIT-007) — Contrats de la navigation coopérative :
 * source unique COOP_NAV_GROUPS (drawer mobile + sidebar ≥ lg), dérivés
 * sans duplication (COOP_NAV_ITEMS), méta-écran hub 'coop-gestion' en
 * onglet seul (pattern Administration du BO), icônes toutes résolvables
 * par CoopIconProxy (sinon la navigation perd son libellé visuel).
 */

import { COOP_NAV_GROUPS, COOP_NAV_ITEMS, coopNavLabel } from '@/components/cooperative/coop-nav'
import { COOP_ICON_MAP } from '@/components/cooperative/coop-icon-proxy'

describe('coop-nav — source unique de navigation (MODE-974)', () => {
  it('COOP_NAV_ITEMS est dérivé de COOP_NAV_GROUPS (pas de duplication)', () => {
    const attendus = COOP_NAV_GROUPS.flatMap((g) => g.items)
    expect(COOP_NAV_ITEMS).toEqual(attendus)
  })

  it('tous les ids sont uniques, préfixés coop-, avec label et description', () => {
    const ids = COOP_NAV_ITEMS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const item of COOP_NAV_ITEMS) {
      expect(item.id.startsWith('coop-')).toBe(true)
      expect(item.label.trim().length).toBeGreaterThan(0)
      expect(item.description.trim().length).toBeGreaterThan(0)
    }
  })

  it('les groupes ont des ids/labels uniques et non vides', () => {
    const ids = COOP_NAV_GROUPS.map((g) => g.id)
    const labels = COOP_NAV_GROUPS.map((g) => g.label)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(labels).size).toBe(labels.length)
    for (const g of COOP_NAV_GROUPS) {
      expect(g.id.trim().length).toBeGreaterThan(0)
      expect(g.label.trim().length).toBeGreaterThan(0)
      expect(g.items.length).toBeGreaterThan(0)
    }
  })

  it("le hub 'coop-gestion' est un méta-écran : ABSENT de la navigation groupée (onglet seul, pattern Administration BO)", () => {
    expect(COOP_NAV_ITEMS.some((i) => i.id === 'coop-gestion')).toBe(false)
  })

  it('toutes les icônes sont résolvables par CoopIconProxy (jamais de nom orphelin)', () => {
    for (const item of COOP_NAV_ITEMS) {
      expect(COOP_ICON_MAP[item.icon], `icône non mappée : ${item.icon}`).toBeDefined()
    }
  })

  it('coopNavLabel retourne le bon label et undefined pour un id inconnu', () => {
    expect(coopNavLabel('coop-membres')).toBe('Membres')
    expect(coopNavLabel('coop-tresorerie')).toBe('Trésorerie')
    expect(coopNavLabel('coop-gestion')).toBeUndefined()
    expect(coopNavLabel('ecran-inconnu')).toBeUndefined()
  })

  it("les 6 écrans du président sont tous atteignables (home, membres, trésorerie, stock, besoins, profil)", () => {
    const ids = COOP_NAV_ITEMS.map((i) => i.id)
    for (const attendu of ['coop-home', 'coop-membres', 'coop-tresorerie', 'coop-stock', 'coop-besoins', 'coop-profil']) {
      expect(ids).toContain(attendu)
    }
  })

  // MODE-976 (G15) — les paramètres rejoignent le groupe « Mon compte ».
  it("les paramètres de l'espace sont atteignables dans le groupe Mon compte (MODE-976)", () => {
    const groupeCompte = COOP_NAV_GROUPS.find((g) => g.id === 'compte')
    expect(groupeCompte?.items.map((i) => i.id)).toContain('coop-parametres')
    expect(coopNavLabel('coop-parametres')).toBe('Paramètres')
  })
})
