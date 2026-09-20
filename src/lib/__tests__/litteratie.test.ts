import { describe, it, expect } from 'vitest'
import {
  normalizeLitteratieText,
  parseLitteratieReponse,
  guidanceLitteratie,
  rateLitteratie,
  aideVocaleLitteratie,
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

describe('rateLitteratie — dictée assistée (branchement surfaces)', () => {
  it('« non » : débit ralenti de 0,05, plafonné à 0,7', () => {
    expect(rateLitteratie(0.9, 'non')).toBe(0.85)
    expect(rateLitteratie(0.7, 'non')).toBe(0.7)
    expect(rateLitteratie(0.5, 'non')).toBe(0.7) // jamais en dessous
  })

  it('« un peu » : réduction légère, plafonnée à 0,75', () => {
    expect(rateLitteratie(0.9, 'un_peu')).toBe(0.87)
    expect(rateLitteratie(0.75, 'un_peu')).toBe(0.75)
    expect(rateLitteratie(0.6, 'un_peu')).toBe(0.75)
  })

  it('« oui » ou niveau inconnu : débit utilisateur INCHANGÉ', () => {
    expect(rateLitteratie(0.9, 'oui')).toBe(0.9)
    expect(rateLitteratie(0.9, null)).toBe(0.9)
    expect(rateLitteratie(0.9, undefined)).toBe(0.9)
  })

  it('n\u2019accélère jamais un utilisateur qui parle lentement', () => {
    expect(rateLitteratie(0.72, 'oui')).toBe(0.72)
    expect(rateLitteratie(0.78, 'un_peu')).toBe(0.75) // ici on ralentit encore
  })
})

describe('aideVocaleLitteratie — bandeau contextuel (branchement surfaces)', () => {
  it('« non » : bandeau d\u2019aide au micro affiché', () => {
    const message = aideVocaleLitteratie('non')
    expect(message).toMatch(/micro/)
    expect(message).toMatch(/Tata Nanti Lou/)
  })

  it('« un peu » : bandeau d\u2019aide adapté affiché', () => {
    expect(aideVocaleLitteratie('un_peu')).toMatch(/micro/)
  })

  it('« oui » ou niveau inconnu : AUCUN bandeau (ne pas narguer les lecteurs)', () => {
    expect(aideVocaleLitteratie('oui')).toBeNull()
    expect(aideVocaleLitteratie(null)).toBeNull()
    expect(aideVocaleLitteratie(undefined)).toBeNull()
  })
})
