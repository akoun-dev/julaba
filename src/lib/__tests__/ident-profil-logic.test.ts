import { describe, it, expect, vi, beforeEach } from 'vitest'

const secureStore = vi.hoisted(() => {
  const store = new Map<string, string>()
  return {
    store,
    savePinHash: async (identifier: string, pinHash: string) => {
      store.set(identifier, pinHash)
    },
    getPinHash: async (identifier: string) => store.get(identifier) ?? null,
  }
})

vi.mock('@/lib/secure-storage', () => ({
  savePinHash: secureStore.savePinHash,
  getPinHash: secureStore.getPinHash,
}))

import {
  simpleHash,
  normalizePhone,
  loadAgent,
  saveAgent,
  loadAgentPinHash,
  computeMaskedPhone,
  computeInitials,
  computeTruncatedId,
  computeMemberSince,
  computeAutoLockLabel,
  pinStepTitleFor,
  pinLengthFor,
} from '@/lib/ident-profil-logic'
import { simpleHash as simpleHashAuth } from '@/lib/auth-login-flow'
import { simpleHash as simpleHashEnrolement } from '@/lib/ident-enrolement'

beforeEach(() => secureStore.store.clear())

describe('simpleHash — djb2 local (jamais serveur)', () => {
  it('valeur connue sur 1 caractère ("1" → code 49)', () => {
    expect(simpleHash('1')).toBe('49')
  })

  it('chaîne vide → "0"', () => {
    expect(simpleHash('')).toBe('0')
  })

  it('déterministe, chaîne numérique, entrées différentes → hashes différents', () => {
    expect(simpleHash('1234')).toBe(simpleHash('1234'))
    expect(typeof simpleHash('1234')).toBe('string')
    expect(simpleHash('1234')).not.toBe(simpleHash('4321'))
  })

  it('PREUVE CROISÉE : identique à auth-login-flow ET ident-enrolement (même djb2)', () => {
    for (const s of ['', '1', '1234', 'abcdef', 'Julaba-2026', '🇨🇮 accentuéé']) {
      expect(simpleHash(s)).toBe(simpleHashAuth(s))
      expect(simpleHash(s)).toBe(simpleHashEnrolement(s))
    }
  })
})

describe('normalizePhone — quirk figé : le "+225" n\'est JAMAIS retiré', () => {
  it('espaces/tiretements supprimés, chiffres conservés', () => {
    expect(normalizePhone('07 08 09 10 11')).toBe('0708091011')
    expect(normalizePhone('07-08.09')).toBe('070809')
  })

  it('quirk historique : "+225…" → le + est strippé AVANT la branche de préfixe (mort)', () => {
    expect(normalizePhone('+2250708091011')).toBe('2250708091011')
    expect(normalizePhone('2250708091011')).toBe('2250708091011')
  })

  it('sans chiffres → chaîne vide', () => {
    expect(normalizePhone('abc')).toBe('')
  })
})

describe('computeMaskedPhone — écran sensible', () => {
  it('hors mode sensible → numéro brut', () => {
    expect(computeMaskedPhone('0708091011', false)).toBe('0708091011')
  })
  it('sans numéro → tiret cadratin', () => {
    expect(computeMaskedPhone(null, true)).toBe('—')
    expect(computeMaskedPhone(null, false)).toBe('—')
  })
  it('numéro court (≤ 4) jamais masqué', () => {
    expect(computeMaskedPhone('0708', true)).toBe('0708')
  })
  it('mode sensible → 3 premiers + **** + 2 derniers', () => {
    expect(computeMaskedPhone('0708091011', true)).toBe('070****11')
  })
})

describe('computeInitials', () => {
  it('nom vide/null → "??"', () => {
    expect(computeInitials(null)).toBe('??')
    expect(computeInitials('')).toBe('??')
  })
  it('un seul mot → première lettre majuscule', () => {
    expect(computeInitials('awa')).toBe('A')
  })
  it('première + dernière initiale, espaces multiples', () => {
    expect(computeInitials('Awa Diop')).toBe('AD')
    expect(computeInitials('  awa   diop  ')).toBe('AD')
    expect(computeInitials('Awa Ba Koffi')).toBe('AK')
  })
})

describe('computeTruncatedId', () => {
  it('id absent → tiret cadratin', () => {
    expect(computeTruncatedId(null)).toBe('—')
  })
  it('id court (≤ 12) inchangé', () => {
    expect(computeTruncatedId('ABCDEFGHIJKL')).toBe('ABCDEFGHIJKL')
  })
  it('id long → 6 premiers + "..." + 4 derniers', () => {
    expect(computeTruncatedId('ABCDEFGHIJKLMNOP')).toBe('ABCDEF...MNOP')
  })
})

describe('computeMemberSince — plus ancien dossier', () => {
  it('aucun dossier → "Aujourd\'hui"', () => {
    expect(computeMemberSince([])).toBe("Aujourd'hui")
  })
  it('dossiers en désordre → le PLUS ANCIEN gagne, format fr-FR', () => {
    const t1 = new Date(2026, 0, 15).getTime()
    const t2 = new Date(2026, 5, 2).getTime()
    expect(computeMemberSince([{ createdAt: t2 }, { createdAt: t1 }])).toBe('15 janvier 2026')
  })
})

describe('computeAutoLockLabel', () => {
  it('0 → "Désactivé"', () => {
    expect(computeAutoLockLabel(0)).toBe('Désactivé')
  })
  it('minutes → "N min"', () => {
    expect(computeAutoLockLabel(5)).toBe('5 min')
    expect(computeAutoLockLabel(30)).toBe('30 min')
  })
})

describe('pinStepTitleFor — intitulés des 3 étapes', () => {
  it('current / new / confirm', () => {
    expect(pinStepTitleFor('current')).toBe('Entrez votre code actuel')
    expect(pinStepTitleFor('new')).toBe('Entrez le nouveau code')
    expect(pinStepTitleFor('confirm')).toBe('Confirmez le nouveau code')
  })
})

describe('pinLengthFor — longueur affichée par étape', () => {
  it('lit la saisie de l\'étape courante', () => {
    expect(pinLengthFor('current', '12', '', '')).toBe(2)
    expect(pinLengthFor('new', '', '345', '')).toBe(3)
    expect(pinLengthFor('confirm', '', '', '9012')).toBe(4)
  })
})

describe('quirk loadAgent — toujours null (copie auth incomplète)', () => {
  it('quel que soit le téléphone, loadAgent répond null', () => {
    expect(loadAgent('0708091011')).toBeNull()
    expect(loadAgent('')).toBeNull()
  })
})

describe('saveAgent / loadAgentPinHash — persistance PIN (storage mocké)', () => {
  it('aller-retour : clé "ident-pin-<téléphone normalisé>", valeur = pinHash', async () => {
    await saveAgent({ id: 'A1', firstName: 'Awa', phone: '07 08 09 10 11', pinHash: '4321h' })
    expect(secureStore.store.get('ident-pin-0708091011')).toBe('4321h')
    expect(await loadAgentPinHash('07 08 09 10 11')).toBe('4321h')
  })

  it('pinHash vide → aucune écriture (garde if (pinHash))', async () => {
    await saveAgent({ id: 'A1', firstName: 'Awa', phone: '07 08 09 10 11', pinHash: '' })
    expect(secureStore.store.size).toBe(0)
  })

  it('hash inconnu → null (jamais de throw)', async () => {
    expect(await loadAgentPinHash('inconnu')).toBeNull()
  })
})
