import { describe, it, expect } from 'vitest'
import {
  simpleHash,
  patternToHash,
  validateIdentiteDossier,
  fusionnerChampsCni,
  basculeMulti,
  avecDocumentAjoute,
  erreurGpsWeb,
} from '../ident-enrolement'
import { simpleHash as authSimpleHash, patternToHash as authPatternToHash } from '../auth-login-flow'
import { createEmptyDossier, type Dossier } from '../../lib/stores/identificateur-store'

const dossierNeuf = () => createEmptyDossier('m-1', 'Agent Test')

describe('djb2 local (brouillons ident)', () => {
  it('produit la même valeur que la couche login (compat brouillons)', () => {
    // Les brouillons ident et l'auth marchand partagent le même espace
    // djb2 : l'équivalence algorithmique est verrouillée par ce croisement.
    for (const s of ['1234', '0000', '987654', '1-2-3-4', '']) {
      expect(simpleHash(s)).toBe(authSimpleHash(s))
    }
    expect(patternToHash([1, 5, 9])).toBe(authPatternToHash([1, 5, 9]))
    expect(patternToHash([3, 2, 1])).toBe(simpleHash('3-2-1'))
  })

  it('déterministe, format string, signé 32 bits', () => {
    expect(simpleHash('1234')).toBe(simpleHash('1234'))
    expect(typeof simpleHash('abcd')).toBe('string')
    expect(Number.isNaN(Number(simpleHash('abcd')))).toBe(false)
  })
})

describe('validateIdentiteDossier (étape 2)', () => {
  const base = (d: Dossier) => {
    d.actorType = 'marchand'
    d.firstName = 'Awa'
    d.lastName = 'Koné'
    d.phone = '0701020304'
    d.activite = 'Vente de riz'
    d.zone = 'Treichel'
    d.categorieMarchand = 'detaillant'
    return d
  }

  it('dossier null → message dédié', () => {
    expect(validateIdentiteDossier(null)).toBe('Dossier non disponible')
  })

  it('dossier complet → null', () => {
    expect(validateIdentiteDossier(base(dossierNeuf()))).toBeNull()
  })

  it('chaque règle obligatoire parle et bloque', () => {
    const cas: Array<[keyof Dossier | 'actorType', string]> = [
      ['actorType', 'Type d\'acteur obligatoire'],
      ['firstName', 'Prénom obligatoire'],
      ['lastName', 'Nom obligatoire'],
      ['phone', 'Téléphone obligatoire'],
      ['activite', 'Activité obligatoire'],
      ['zone', 'Zone / Marché obligatoire'],
      ['categorieMarchand', 'Catégorie du marchand obligatoire'],
    ]
    for (const [champ, message] of cas) {
      const d = base(dossierNeuf())
      if (champ === 'actorType') (d as any).actorType = undefined
      else (d as any)[champ] = champ === 'categorieMarchand' ? undefined : ''
      expect(validateIdentiteDossier(d)).toBe(message)
    }
  })

  it('la catégorie marchand n’est exigée que pour les marchands', () => {
    const d = base(dossierNeuf())
    d.actorType = 'producteur'
    d.categorieMarchand = undefined
    expect(validateIdentiteDossier(d)).toBeNull()
  })

  it('adhésion cochée sans coopérative → refus à la source (DET-COOP-007)', () => {
    const d = base(dossierNeuf())
    d.estMembreCooperative = true
    d.cooperativeId = undefined
    expect(validateIdentiteDossier(d)).toBe('Coopérative obligatoire quand l’adhésion est cochée')
    d.cooperativeId = 'coop-1'
    expect(validateIdentiteDossier(d)).toBeNull()
  })
})

describe('fusionnerChampsCni (pré-remplissage doux)', () => {
  it('pré-remplit uniquement les champs vides', () => {
    const d = dossierNeuf()
    d.firstName = 'Awa'
    d.lastName = ' '
    const out = fusionnerChampsCni(d, { lastName: 'KONÉ', firstName: 'Marie', cniNumero: 'C12345' })
    // lastName vide après trim → OCR retenu ; firstName déjà saisi → JAMAIS écrasé
    expect(out?.lastName).toBe('KONÉ')
    expect(out?.firstName).toBe('Awa')
    expect(out?.cniNumero).toBe('C12345')
  })

  it('ne touche ni nni ni sexe quand l’OCR n’en trouve pas', () => {
    const d = dossierNeuf()
    d.sexe = 'feminin'
    const out = fusionnerChampsCni(d, {})
    expect(out?.sexe).toBe('feminin')
    expect(out?.nni).toBeUndefined()
  })

  it('l’OCR peut renseigner sexe/nni absents, jamais remplacer', () => {
    const d = dossierNeuf()
    d.sexe = 'autre'
    const out = fusionnerChampsCni(d, { sexe: 'masculin', nni: 'NNI99' })
    expect(out?.sexe).toBe('autre')
    expect(out?.nni).toBe('NNI99')
  })

  it('prev null → null (jamais de dossier fantôme)', () => {
    expect(fusionnerChampsCni(null, { lastName: 'KONÉ' })).toBeNull()
  })
})

describe('basculeMulti (cap 5)', () => {
  it('ajoute puis retire', () => {
    const { next } = basculeMulti(['riz', 'mani'], 'igname')
    expect(next).toEqual(['riz', 'mani', 'igname'])
    const { next: after } = basculeMulti(next!, 'igname')
    expect(after).toEqual(['riz', 'mani'])
  })

  it('refuse au-delà de 5 sans toucher la liste', () => {
    const plein = ['a', 'b', 'c', 'd', 'e']
    const { next, refuse } = basculeMulti(plein, 'f')
    expect(refuse).toBe(true)
    expect(next).toBeNull()
    expect(plein).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('retirer reste possible même à 5 (le cap ne bloque pas la sortie)', () => {
    const plein = ['a', 'b', 'c', 'd', 'e']
    const { next, refuse } = basculeMulti(plein, 'c')
    expect(refuse).toBe(false)
    expect(next).toEqual(['a', 'b', 'd', 'e'])
  })
})

describe('avecDocumentAjoute (cap 10)', () => {
  const doc = (n: string) => ({ name: n, base64: `data:${n}`, type: 'image/png' })

  it('ajoute à la liste existante', () => {
    const d = dossierNeuf()
    d.documents = [doc('a.png')]
    const out = avecDocumentAjoute(d, doc('b.png'))
    expect(out?.documents).toHaveLength(2)
    expect(out?.documents?.[1]).toEqual(doc('b.png'))
  })

  it('plafonne à 10 documents (le 11e est écarté)', () => {
    const d = dossierNeuf()
    d.documents = Array.from({ length: 10 }, (_, i) => doc(`d${i}.png`))
    const out = avecDocumentAjoute(d, doc('trop.png'))
    expect(out?.documents).toHaveLength(10)
    expect(out?.documents?.some((x) => x.name === 'trop.png')).toBe(false)
  })

  it('initialise la liste absente et respecte prev null', () => {
    const d = dossierNeuf()
    expect(avecDocumentAjoute(d, doc('seul.png'))?.documents).toHaveLength(1)
    expect(avecDocumentAjoute(null, doc('x.png'))).toBeNull()
  })
})

describe('erreurGpsWeb (mapping codes navigateur)', () => {
  it('code 1 → permission refusée + statut refused', () => {
    const { message, statut } = erreurGpsWeb(1)
    expect(message).toBe('Permission de localisation refusée')
    expect(statut).toBe('refused')
  })

  it('code 2 → position non disponible', () => {
    expect(erreurGpsWeb(2).message).toBe('Position non disponible')
    expect(erreurGpsWeb(2).statut).toBe('unavailable')
  })

  it('code 3 → délai expiré', () => {
    expect(erreurGpsWeb(3).message).toBe('Délai de localisation expiré')
  })

  it('code inconnu → message par défaut, jamais refused', () => {
    for (const code of [0, 99, -1]) {
      const { message, statut } = erreurGpsWeb(code)
      expect(message).toBe('Erreur lors de la capture de la position')
      expect(statut).toBe('unavailable')
    }
  })
})
