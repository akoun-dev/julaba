// Normalisation « texte parlé » pour la voix de Tata : les MONTANTS seuls
// sont verbalisés en toutes lettres, rien d'autre n'est modifié.
//
// Problème corrigé : « Vente de 1 500 FCFA » était lu « un cinq zéro zéro
// FCFA » (Piper épelait chaque chiffre, Web Speech/natif lisaient « mille
// cinq cents » correctement mais « FCFA » restait une suite de lettres
// approximative selon les moteurs). Désormais tous les moteurs reçoivent
// « Vente de mille cinq cents francs CFA ».
//
// Périmètre volontairement RESTREINT aux montants (nombre + devise) :
// - PIN, numéros de téléphone, codes (JID-…), dates et références ne sont
//   PAS touchés — ils doivent rester lisibles chiffre par chiffre ou tels
//   quels ;
// - les nombres sans devise (quantités, années) ne sont pas transformés ;
// - formatFCFA() (affichage visuel) n'est pas concerné : cette
//   normalisation n'existe que dans la couche voix.
//
// Idempotent : appliquer toSpeechText deux fois ne change rien (le texte
// converti ne contient plus de chiffres devant une devise).

import { numberToFrenchWords } from './french-number'

// Séparateurs de milliers acceptés : espace ordinaire, espace insécable
// (\u00A0), espace insécable étroit (\u202F, produit par certains
// formatages ICU) et espace fine (\u2009).
const THOUSANDS_SEPARATORS = '\\u00A0\\u202F\\u2009 '

// Devise reconnue après un montant : FCFA, franc(s), ou F/f isolé.
// L'ordre de l'alternation compte : « fcfa » doit être essayé avant « f ».
const CURRENCY_TOKEN = '(?:fcfa|francs?|f)'

// Un montant = un nombre (groupes de 3 chiffres séparés par un séparateur
// de milliers, ou une suite simple de chiffres) suivi d'au moins un token
// devise. Lookbehind : le nombre ne doit pas être la fin d'un autre nombre
// ou d'une valeur décimale (1500.50 → le « 50 » ne doit pas matcher).
// La répétition finale absorbe les devises déjà présentes en double
// (« 1 500 FCFA FCFA ») pour éviter un « francs CFA FCFA » à la sortie.
const AMOUNT_PATTERN = new RegExp(
  `(?<![\\d.,])(\\d{1,3}(?:[${THOUSANDS_SEPARATORS}]\\d{3})+|\\d+)\\s*${CURRENCY_TOKEN}\\b(?:\\s*${CURRENCY_TOKEN}\\b)*`,
  'gi',
)
const SEPARATORS_RE = new RegExp(`[${THOUSANDS_SEPARATORS}]`, 'g')

/**
 * Verbalise les montants d'un texte pour la synthèse vocale.
 *
 * « 1 500 FCFA » / « 1500 FCFA » / « 1 500 francs » / « 1500 f » /
 * « 25 000 F » → « mille cinq cents francs CFA ».
 *
 * Tout le reste (PIN, téléphones, codes, dates, nombres sans devise,
 * montants déjà écrits en lettres) est conservé à l'identique. Si un
 * montant détecté s'avère non convertible (valeur hors entiers sûrs),
 * l'extrait d'origine est restitué sans modification.
 */
export function toSpeechText(text: string): string {
  if (!text) return text
  return text.replace(AMOUNT_PATTERN, (matched, numberToken: string) => {
    const value = Number(String(numberToken).replace(SEPARATORS_RE, ''))
    if (!Number.isSafeInteger(value) || value < 0) return matched
    const words = numberToFrenchWords(value)
    if (!words) return matched
    // Accord : « 1 franc CFA » / « zéro franc CFA » au singulier,
    // « 500 francs CFA » au pluriel.
    const noun = value <= 1 ? 'franc' : 'francs'
    return `${words} ${noun} CFA`
  })
}

// Épellation chiffre par chiffre — partagée par les moteurs neuronaux
// (Piper, Kokoro) qui ne savent pas lire « 0700000000 » comme un numéro de
// téléphone : ces valeurs doivent être épelées (« zéro sept zéro… »), pas
// lues comme un nombre géant. Ne JAMAIS appliquer au texte Web Speech/natif.
const FRENCH_DIGITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf']

/**
 * Épelle chaque chiffre restant d'un texte déjà normalisé par
 * toSpeechText() : « PIN 2580 » → « PIN deux cinq huit zéro ».
 * Les montants convertis en lettres n'ont plus de chiffres et repassent
 * inchangés. Idempotent une fois les chiffres épelés (plus aucun chiffre).
 */
export function spellDigits(text: string): string {
  if (!text) return text
  return text.replace(/\d/g, (digit) => ` ${FRENCH_DIGITS[Number(digit)]} `)
}
