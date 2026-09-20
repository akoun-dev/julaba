// Chiffres → mots parlés pour les voix MMS (MODE-917).
//
// ── Le défaut corrigé ─────────────────────────────────────────────────────
// Les checkpoints MMS ne parlent pas les chiffres :
// • DYU : le vocab char-level (32 symboles) n'a AUCUN chiffre — « 5000 »
//   était supprimé par la whitelist du tokenizer → TROU SILENCIEUX au
//   milieu de la phrase, or un marché parle de PRIX. (constaté dans les
//   tests mms-tts : « vente 1500 FCFA » → « vente FCFA »).
// • BCI (pilote, donor akan) : le vocab ne contient QUE « 2 » et « 3 » —
//   tout autre chiffre était supprimé, et « 2 »/« 3 » étaient lus avec un
//   audio akan non vérifié. « 1500 » → mutilation.
// Désormais les nombres sont écrits EN LETTRES dans la langue de la voix
// AVANT la normalisation orthographique : tous les caractères générés sont
// dans le vocab (propre de tests), donc réellement prononcés.
//
// ── Numérales JULA (dioula) — registre de sources 2026-09-20 ─────────────
// • coastsystems.net (page Dyula, numérotation et monnaie) : 1 kelen,
//   2 fila, 3 saba, 4 naani, 5 looru, 6 wɔɔrɔ, 7 woronfila, 8 seegi,
//   9 kɔnɔtɔ, 10 tan ; « dɔrɔmɛ » = franc CFA.
// • omniglot.com (Bambara — même système mandé que le jula) : 20 mugan ;
//   dizaines 30–90 = « bi X » (waa bi saba = 30 000) ; 1 000 = waa.
// • Thèse HAL (transferts d'apprentissage, Bambara) : 100 = kɛmɛ ;
//   construction additive « ni » (« 21 = mugan ni kelen » ; « 11 =
//   tan ni kelen » — 101languages.net).
// Construction retenue : milliers/centaines multiplicatifs postposés
// (waa fila = 2000, kɛmɛ looru = 500), liaison additive « ni » entre les
// groupes. BÊTA assumée : variations dialectales possibles (duuru/looru,
// seegi/sɛɛgi) — à confirmer par les locuteurs natifs comme le reste de la
// chaîne bêta (chrF++ du finetune, voix pilote).
//
// ── Numérales BAOULÉ (pilote) — périmètre SERRÉ, honnête ─────────────────
// • omniglot.com + baoule.ci + desmotsetdeslangues (compter en baoulé) :
//   1 kun, 2 nnyɔn, 3 nsan, 4 nnan, 5 nnun, 6 nsiɛn ; 7 nso, 8 mɔcuɛ,
//   9 ngwlan (décompositions « ablaɔn kin nso » = 27 etc.) ; 10 blu
//   (« blu nin kun » = 11) ; 20 ablaɔn.
// • CENTAINES/MILLIERS NON SOURCÉES → NON converties : au-delà de 10, les
//   nombres restent inchangés (comportement actuel) plutôt qu'inventés.
// • Adaptation de prononciation : « 8 » s'écrit mɔcuɛ en baoulé mais le
//   vocab akan du checkpoint n'a pas de « c » → forme adaptée « mɔsuɛ »
//   (consonne préservée plutôt que suppression par la whitelist).
//
// ── Garde-fous ────────────────────────────────────────────────────────────
// • RUNS LONGS NON CONVERTIS (> 7 chiffres : téléphones, identifiants) —
//   lire un numéro de téléphone comme un seul nombre serait FAUX ; muet
//   vaut mieux que faux (et ces données ne sont jamais narrées en bci/dyu).
// • 0 et valeurs non convertibles → inchangés (pause, comportement actuel).
// • Idempotent : la sortie ne contient plus de chiffres convertissables.

/** Unités jula 1–9 (coastsystems, Dyula). */
const DYU_UNITS = [
  'kelen', // 1
  'fila', // 2
  'saba', // 3
  'naani', // 4
  'looru', // 5
  'wɔɔrɔ', // 6
  'woronfila', // 7
  'seegi', // 8
  'kɔnɔtɔ', // 9
] as const

/** Convertit un entier ≥ 1 en mots jula (numérales mandé sourcées). */
export function dyuNumberToWords(value: number): string | null {
  if (!Number.isInteger(value) || value < 1 || value > 999_999_999) return null

  // 1–99 (unités, tan, mugan, dizaines « bi X », liaison « ni »).
  const sousCent = (n: number): string => {
    if (n <= 9) return DYU_UNITS[n - 1]
    if (n === 10) return 'tan'
    if (n < 20) return `tan ni ${DYU_UNITS[n - 11]}`
    if (n === 20) return 'mugan'
    const dizaines = Math.floor(n / 10)
    const unites = n % 10
    const motDizaines = dizaines === 2 ? 'mugan' : `bi ${DYU_UNITS[dizaines - 1]}`
    return unites ? `${motDizaines} ni ${DYU_UNITS[unites - 1]}` : motDizaines
  }
  // 1–999 : centaines multiplicatives (kɛmɛ fila = 200) + reste.
  const sousMille = (n: number): string => {
    if (n < 100) return sousCent(n)
    const centaines = Math.floor(n / 100)
    const reste = n % 100
    const motCentaines = centaines === 1 ? 'kɛmɛ' : `kɛmɛ ${DYU_UNITS[centaines - 1]}`
    return reste ? `${motCentaines} ni ${sousCent(reste)}` : motCentaines
  }

  const groupes: string[] = []
  const millions = Math.floor(value / 1_000_000)
  const resteMillier = value % 1_000_000
  if (millions > 0) groupes.push(millions === 1 ? 'milyɔn' : `milyɔn ${sousMille(millions)}`)
  if (resteMillier > 0) {
    const milliers = Math.floor(resteMillier / 1000)
    const reste = resteMillier % 1000
    if (milliers > 0) groupes.push(milliers === 1 ? 'waa' : `waa ${sousMille(milliers)}`)
    if (reste > 0) groupes.push(sousMille(reste))
  }
  return groupes.join(' ni ')
}

/**
 * Écrit les nombres d'un texte en mots jula, juste avant la normalisation
 * orthographique dyu. Runs ≤ 7 chiffres seulement ; 0 et hors bornes →
 * inchangés (pause — comportement actuel, honnête).
 */
export function spellNumbersForDyu(text: string): string {
  return text.replace(/\d+/g, (run) => {
    if (run.length > 7) return run
    return dyuNumberToWords(Number(run)) ?? run
  })
}

/** Unités baoulé 1–10 (omniglot + baoule.ci + desmotsetdeslangues). */
const BCI_UNITS: readonly string[] = [
  'kun', // 1
  'nnyɔn', // 2
  'nsan', // 3
  'nnan', // 4
  'nnun', // 5
  'nsiɛn', // 6
  'nso', // 7
  'mɔsuɛ', // 8 (mɔcuɛ — « c » absent du vocab akan, adaptation documentée)
  'ngwlan', // 9
  'blu', // 10
]

/**
 * Convertit un entier en mot baoulé — SEULEMENT 1–10 (périmètre vérifié ;
 * au-delà, aucune source des centaines/milliers : on ne convertit PAS).
 */
export function bciNumberToWords(value: number): string | null {
  if (!Number.isInteger(value) || value < 1 || value > 10) return null
  return BCI_UNITS[value - 1]
}

/**
 * Écrit en baoulé les nombres ISOLÉS d'un seul chiffre (1–10). Un run
 * multi-chiffres (« 20 », « 1500 ») reste inchangé : convertir chiffre à
 * chiffre serait faux (« 20 » ≠ « nnyɔn zéro ») et inventer des
 * centaines/milliers serait pire. Limitation bêta documentée.
 */
export function spellNumbersForBci(text: string): string {
  return text.replace(/(?<!\d)\d(?!\d)/g, (d) => bciNumberToWords(Number(d)) ?? d)
}
