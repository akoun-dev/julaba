import { describe, expect, it } from 'vitest'

// MODE-941 (AUDIT-003 I-09/F-18) — actor_id séquentiel « #X-NNNN ».
// Fin du 4 chiffres aléatoires sur colonne UNIQUE (~120 collisions
// attendues à 10 000 acteurs → la validation d'un dossier pouvait 500) :
// la plus grande séquence existante + 1, à l'image du pipeline JID.
// F-18 : les coopératives ne sont plus rangées sous #M- mais #C-.

import { acteurPrefixPourType, buildActeurId, nextActeurId } from '../actor-id'

describe('actor-id — préfixe par type (F-18)', () => {
  it('mappe marchand/producteur/coopératif sur M/P/C', () => {
    expect(acteurPrefixPourType('marchand')).toBe('M')
    expect(acteurPrefixPourType('MARCHAND')).toBe('M')
    expect(acteurPrefixPourType('producteur')).toBe('P')
    expect(acteurPrefixPourType('cooperatif')).toBe('C')
    expect(acteurPrefixPourType('coopérative')).toBe('C')
    expect(acteurPrefixPourType('')).toBe('M')
    expect(acteurPrefixPourType('inconnu')).toBe('M')
  })
})

describe('actor-id — séquence libre (I-09)', () => {
  it('commence à #M-0001 sur une base vide', () => {
    expect(nextActeurId([], 'M')).toBe('#M-0001')
  })

  it('prend max+1 en ignorant les autres préfixes et les formats exotiques', () => {
    const ids = ['#M-0004', '#P-0019', '#C-0002', 'legacy-ancien', '']
    expect(nextActeurId(ids, 'M')).toBe('#M-0005')
    expect(nextActeurId(ids, 'P')).toBe('#P-0020')
    expect(nextActeurId(ids, 'C')).toBe('#C-0003')
  })

  it('saute les trous comblés manuellement (séquence prise)', () => {
    const ids = ['#M-0001', '#M-0002', '#M-0005']
    expect(nextActeurId(ids, 'M')).toBe('#M-0006')
  })

  it('est insensible à la casse/espaces des ids existants', () => {
    expect(nextActeurId([' #m-0007 '], 'M')).toBe('#M-0008')
  })

  it('formate toujours sur 4 chiffres', () => {
    expect(buildActeurId('P', 42)).toBe('#P-0042')
    expect(buildActeurId('C', 12345)).toBe('#C-12345')
  })
})
