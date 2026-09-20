import { describe, it, expect } from 'vitest'
import {
  normalizeLitteratieText,
  parseLitteratieReponse,
  guidanceLitteratie,
} from '../litteratie'

describe('normalizeLitteratieText', () => {
  it('retire les tons (NFD), unifie apostrophes, minuscule et compacte', () => {
    expect(normalizeLitteratieText('  OUI ! ')).toBe('oui')
    expect(normalizeLitteratieText("Oui, j'ai dit.")) // ponctuation → espace
      .toBe("oui j'ai dit")
    expect(normalizeLitteratieText('  UN   PETIT   PEU ')).toBe('un petit peu')
  })
})

describe('parseLitteratieReponse — « Oui »', () => {
  it.each(['oui', 'Oui', 'OUI', 'oui oui', 'ouais', "d'accord", "D'accord", "C'est bon", 'exact', 'bien sûr'])(
    'oui : « %s »',
    (input) => {
      expect(parseLitteratieReponse(input)).toBe('oui')
    },
  )

  it('reconnaît le oui baoulé (liste pilote, cf. confirmations.ts)', () => {
    expect(parseLitteratieReponse('ɛhɛ')).toBe('oui')
    expect(parseLitteratieReponse('Ɛhɛ́')).toBe('oui')
    expect(parseLitteratieReponse('ehe')).toBe('oui')
  })

  it('« oui oui » matche au premier token', () => {
    expect(parseLitteratieReponse('oui oui je sais lire')).toBe('oui')
  })
})

describe('parseLitteratieReponse — « Non »', () => {
  it.each(['non', 'NON', 'non non', 'nan', 'pas du tout'])('non : « %s »', (input) => {
    expect(parseLitteratieReponse(input)).toBe('non')
  })

  it('reconnaît le non baoulé (liste pilote)', () => {
    expect(parseLitteratieReponse('ao')).toBe('non')
    expect(parseLitteratieReponse('àó')).toBe('non')
    expect(parseLitteratieReponse('a o')).toBe('non')
  })

  it('« non, je ne sais pas » matche au premier token', () => {
    expect(parseLitteratieReponse('non je ne sais pas')).toBe('non')
  })
})

describe('parseLitteratieReponse — « Un peu »', () => {
  it.each(['un peu', 'Un peu.', 'un petit peu', 'UN PETIT PEU', 'juste un peu', 'un peu seulement'])(
    'un peu : « %s »',
    (input) => {
      expect(parseLitteratieReponse(input)).toBe('un_peu')
    },
  )

  it('le token « peu » couvre les variantes orales composées', () => {
    expect(parseLitteratieReponse('un tout petit peu')).toBe('un_peu')
    expect(parseLitteratieReponse('peu')).toBe('un_peu')
  })

  it('une réponse mixte « oui, un peu » est lue comme un_peu (guidage le plus aidant)', () => {
    expect(parseLitteratieReponse('oui, un peu')).toBe('un_peu')
  })
})

describe('parseLitteratieReponse — réponses inconnues', () => {
  it('retourne null (jamais de reconnaissance implicite)', () => {
    expect(parseLitteratieReponse('je vends des tomates')).toBeNull()
    expect(parseLitteratieReponse('')).toBeNull()
    expect(parseLitteratieReponse('   ')).toBeNull()
    expect(parseLitteratieReponse('tomates deux mille')).toBeNull()
  })

  it('n\'interprète PAS « ouvre la caisse » comme un oui', () => {
    expect(parseLitteratieReponse('ouvre la caisse')).toBeNull()
  })
})

describe('guidanceLitteratie — guidage adapté', () => {
  it('« oui » : parcours standard, aucun réglage forcé', () => {
    const g = guidanceLitteratie('oui')
    expect(g.soleil).toBe(false)
    expect(g.proposerVoix).toBe(false)
    expect(g.message).toMatch(/Suivant/)
  })

  it('« un peu » : Mode Soleil activé, voix guidante assurée', () => {
    const g = guidanceLitteratie('un_peu')
    expect(g.soleil).toBe(true)
    expect(g.proposerVoix).toBe(false)
    expect(g.message).toMatch(/Suivant/)
  })

  it('« non » : Mode Soleil + guidage vocal assumé + proposition d\'activer la voix', () => {
    const g = guidanceLitteratie('non')
    expect(g.soleil).toBe(true)
    expect(g.proposerVoix).toBe(true)
    expect(g.message).toMatch(/Suivant/)
  })

  it('chaque message de guidage oriente vers l\'étape suivante', () => {
    for (const niveau of ['oui', 'un_peu', 'non'] as const) {
      expect(guidanceLitteratie(niveau).message).toContain('Appuyez sur Suivant')
    }
  })
})
