// Conversion de nombres entiers en français parlé, pour la synthèse vocale
// de Tata. Utilisé par speech-text.ts (toSpeechText) pour verbaliser les
// montants FCFA avant envoi aux moteurs TTS — Piper notamment, dont le
// phonemizer gère mal les chiffres isolés (table d'embedding à 130 entrées).
//
// Règles orthographiques françaises appliquées (usage recommandé) :
// - « vingt » et « cent » prennent un « s » uniquement s'ils terminent un
//   groupe multiplié ET ne sont pas suivis d'un autre adjectif numéral :
//   80 → « quatre-vingts », 200 → « deux cents », mais 80 000 →
//   « quatre-vingt mille » et 200 000 → « deux cent mille » ;
//   devant « million »/« milliard » (noms, pas adjectifs numéraux),
//   l'accord est conservé : « quatre-vingts millions », « cinq cents milliards ».
// - « mille » est toujours invariable : 2 000 → « deux mille ».
// - « million » / « milliard » sont des noms : ils s'accordent toujours au
//   pluriel et « 1 » se dit explicitement (« un million », pas « million »).
// - « et un » pour 21, 31, 41, 51, 61 et « soixante et onze » (71) ;
//   PAS de « et » dans la famille 80 (81 → « quatre-vingt-un »).
// - 70-79 → famille « soixante-… » ; 90-99 → famille « quatre-vingt-… ».

const UNITS: readonly string[] = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
]

const TENS: Record<number, string> = {
  2: 'vingt',
  3: 'trente',
  4: 'quarante',
  5: 'cinquante',
  6: 'soixante',
  8: 'quatre-vingt',
}

function below100(n: number): string {
  if (n < 20) return UNITS[n]
  const tens = Math.floor(n / 10)
  const unit = n % 10
  if (tens === 7 || tens === 9) {
    // 70-79 → soixante-dix, soixante et onze, soixante-douze… soixante-dix-neuf
    // 90-99 → quatre-vingt-dix, quatre-vingt-onze… quatre-vingt-dix-neuf
    const base = tens === 7 ? 'soixante' : 'quatre-vingt'
    const rest = n - (tens === 7 ? 60 : 80) // reste dans [10..19]
    if (tens === 7 && rest === 11) return 'soixante et onze'
    return `${base}-${UNITS[rest]}`
  }
  const tensWord = TENS[tens]
  if (unit === 0) return tens === 8 ? 'quatre-vingts' : tensWord
  // « et un » pour 21/31/41/51/61 — PAS dans la famille 80 (81 → « quatre-vingt-un »)
  if (unit === 1 && tens !== 8) return `${tensWord} et un`
  return `${tensWord}-${UNITS[unit]}`
}

function below1000(n: number): string {
  if (n < 100) return below100(n)
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const head = hundreds === 1 ? 'cent' : `${UNITS[hundreds]} cent`
  if (rest === 0) return hundreds === 1 ? 'cent' : `${head}s`
  return `${head} ${below100(rest)}`
}

// « quatre-vingts » et « cents » perdent leur « s » lorsqu'ils multiplient
// « mille » (adjectif numéral qui suit immédiatement) : 80 000 →
// « quatre-vingt mille », 200 000 → « deux cent mille ».
function pluralGroupForMille(n: number): string {
  return below1000(n)
    .replace(/quatre-vingts$/, 'quatre-vingt')
    .replace(/cents$/, 'cent')
}

/**
 * Convertit un entier positif en son équivalent en toutes lettres en
 * français standard. Retourne une chaîne vide pour toute entrée non
 * convertible (négatif, décimal, non fini, hors entiers sûrs) afin que
 * l'appelant conserve le texte d'origine plutôt que de déformer la valeur.
 * Gère les entiers de 0 à 999 milliards ; au-delà (hors périmètre réaliste
 * des montants Jùlaba), repli sur une lecture chiffre par chiffre.
 */
export function numberToFrenchWords(value: number): string {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isInteger(value) ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    return ''
  }
  if (value === 0) return 'zéro'
  if (value >= 1e12) {
    return Array.from(String(value), (d) => UNITS[Number(d)]).join(' ')
  }

  const parts: string[] = []
  let rest = value

  if (rest >= 1e9) {
    const count = Math.floor(rest / 1e9)
    rest -= count * 1e9
    parts.push(`${count === 1 ? 'un' : below1000(count)} milliard${count > 1 ? 's' : ''}`)
  }
  if (rest >= 1e6) {
    const count = Math.floor(rest / 1e6)
    rest -= count * 1e6
    parts.push(`${count === 1 ? 'un' : below1000(count)} million${count > 1 ? 's' : ''}`)
  }
  if (rest >= 1000) {
    const thousands = Math.floor(rest / 1000)
    rest -= thousands * 1000
    parts.push(`${thousands === 1 ? '' : `${pluralGroupForMille(thousands)} `}mille`)
  }
  if (rest > 0) parts.push(below1000(rest))

  return parts.join(' ')
}
