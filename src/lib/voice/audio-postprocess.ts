// Post-traitement audio des voix MMS (MODE-917) — amélioration de la
// QUALITÉ PERÇUE des voix baoulé pilote et dioula, sans changer les
// checkpoints (le baoulé reste le donor akan 114 Mo, le dioula le port
// MMS dyu 114 Mo) ni le contrat de repli de tata-tts/mms-tts.
//
// ── Pourquoi ce module existe (constats sur la sortie VITS brute) ─────────
// • SILENCE DE TÊTE/QUEUE : la synthèse MMS-VITS encadre chaque énoncé de
//   silences qui retardsent la réponse et donnent une impression de lenteur
//   (mesuré : ≈ 0,3–0,6 s de silence de tête sur les échantillons du
//   sandbox). Le découpage (trim) à seuil adaptatif rend Tata immédiat.
// • NIVEAU INCONSTANT : le niveau de sortie varie d'une phrase à l'autre
//   (mesuré sur le sandbox : crêtes de ≈ 0,10 à ≈ 0,45 selon la phrase) —
//   dans une narration multi-phrases, l'utilisateur monte puis baisse le
//   son. La normalisation par segment à une cible de crête commune rend le
//   niveau homogène ET remonte le niveau général (sortie VITS ≈ -20 dBFS).
// • CLICS : chaque segment (et chaque arrêt) commence/termine à une valeur
//   arbitraire → clics audibles. Les fondus linéaires courts les suppriment.
// • PHRASES ENCHAÎNÉES : synthétiser « A. B. C. » d'un bloc fait disparaître
//   les pauses (la ponctuation est filtrée par la whitelist du tokenizer) —
//   la parole est un flot uniforme. La synthèse PAR PHRASE avec insertion
//   d'une vraie pause entre les segments restaure le rythme naturel ; elle
//   borne aussi la portée d'un éventuel dérapage de génération.
//
// ── Contrat ────────────────────────────────────────────────────────────────
// • Fonctions PURES (aucun import moteur, aucune dépendance DOM) — testables
//   sans mock, consommées par mms-tts.ts (speakWithMms).
// • Aucune fonction ne lève ; sur entrée vide/dégénérée elles restituent
//   l'entrée inchangée (ou un tableau vide) — un post-traitement ne doit
//   JAMAIS être la cause d'un échec de narration.
// • Idempotence par conception : réappliquer une fonction sur sa sortie ne
//   dégrade pas l'audio (tests de non-régression).
// • Les amplitudes restent dans [-1, 1] : normalizePeak plafonne le gain ;
//   les fondus ne peuvent que descendre vers 0.

/** Options du découpage du silence. */
export type TrimSilenceOptions = {
  /** Seuil RMS relatif à la crête du segment (défaut 0,02 = -34 dBFS). */
  thresholdRatio?: number
  /** Marge de silence conservée de chaque côté (défaut 50 ms). */
  marginMs?: number
  /** Taille de la fenêtre d'analyse RMS (défaut 5 ms). */
  windowMs?: number
}

/** Options de la normalisation de crête. */
export type NormalizePeakOptions = {
  /** Crête cible (défaut 0,85 ≈ -1,4 dBFS — marge anti-écrêtage). */
  target?: number
  /** Gain maximal appliqué (défaut 8 = +18 dB — ne pas réveiller le bruit). */
  maxGain?: number
}

/** Options des fondus linéaires. */
export type FadeOptions = {
  /** Fondu d'ouverture (défaut 12 ms). */
  fadeInMs?: number
  /** Fondu de fermeture (défaut 30 ms). */
  fadeOutMs?: number
}

/** Options d'assemblage d'une narration multi-segments. */
export type SpokenUtteranceOptions = TrimSilenceOptions &
  NormalizePeakOptions &
  FadeOptions & {
    /** Pause insérée entre deux segments (défaut 220 ms). */
    pauseMs?: number
  }

/** Crête absolue d'un signal. */
function peakOf(audio: Float32Array): number {
  let peak = 0
  for (let i = 0; i < audio.length; i++) {
    const v = Math.abs(audio[i])
    if (v > peak) peak = v
  }
  return peak
}

/**
 * Retire le silence de tête et de queue d'un segment : balayage par
 * fenêtres RMS, seuil adaptatif relatif à la CRÊTE du segment (pas une
 * constante absolue — le niveau VITS varie), marge conservée de chaque
 * côté pour ne pas rognner les attaques douces. Segment entièrement
 * silencieux → restitué INCHANGÉ (le filtrage des segments vides est du
 * ressort de l'assemblage, pas du découpage).
 */
export function trimSilence(
  audio: Float32Array,
  sampleRate: number,
  options?: TrimSilenceOptions,
): Float32Array {
  const n = audio.length
  if (n === 0) return audio
  const peak = peakOf(audio)
  const threshold = Math.max((options?.thresholdRatio ?? 0.02) * peak, 1e-5)
  const win = Math.max(1, Math.round((sampleRate * (options?.windowMs ?? 5)) / 1000))
  const margin = Math.round((sampleRate * (options?.marginMs ?? 50)) / 1000)

  let first = -1
  let last = -1
  for (let start = 0; start < n; start += win) {
    const end = Math.min(n, start + win)
    let sum = 0
    for (let i = start; i < end; i++) sum += audio[i] * audio[i]
    const rms = Math.sqrt(sum / (end - start))
    if (rms > threshold) {
      if (first === -1) first = start
      last = end
    }
  }
  if (first === -1) return audio
  const from = Math.max(0, first - margin)
  const to = Math.min(n, last + margin)
  return audio.slice(from, to)
}

/**
 * Ramène la crête d'un segment à la cible (homogénéité du niveau entre
 * segments et montée du niveau général). Gain plafonné (maxGain) pour ne
 * jamais réveiller le plancher de bruit d'un segment quasi muet ; gain < 1
 * possible (segment trop fort → protégé contre l'écrêtage). Segment
 * silencieux → inchangé (pas d'amplification de zéros).
 */
export function normalizePeak(
  audio: Float32Array,
  options?: NormalizePeakOptions,
): Float32Array {
  const n = audio.length
  if (n === 0) return audio
  const peak = peakOf(audio)
  if (peak < 1e-6) return audio
  const target = options?.target ?? 0.85
  const maxGain = options?.maxGain ?? 8
  const gain = Math.min(target / peak, maxGain)
  if (gain === 1) return audio
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = audio[i] * gain
  return out
}

/**
 * Fondus linéaires courts d'ouverture/fermeture — suppriment les clics au
 * début/fin de chaque segment. Un segment plus court que la somme des deux
 * fondus est restitué inchangé (dégradation évitée).
 */
export function applyFades(
  audio: Float32Array,
  sampleRate: number,
  options?: FadeOptions,
): Float32Array {
  const n = audio.length
  if (n === 0) return audio
  const fadeIn = Math.round((sampleRate * (options?.fadeInMs ?? 12)) / 1000)
  const fadeOut = Math.round((sampleRate * (options?.fadeOutMs ?? 30)) / 1000)
  if (fadeIn + fadeOut >= n) return audio
  const out = new Float32Array(n)
  out.set(audio)
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn
  for (let i = 0; i < fadeOut; i++) out[n - 1 - i] *= i / fadeOut
  return out
}

/**
 * Assemble des segments traités en UNE lecture : concaténation avec une
 * pause silencieuse entre segments (rythme de phrase naturel). Les
 * segments vides sont ignorés. Retourne au minimum un tableau vide —
 * l'appelant décide (contrat mms : false → repli français).
 */
export function concatWithPauses(
  segments: readonly Float32Array[],
  sampleRate: number,
  pauseMs = 220,
): Float32Array {
  const kept = segments.filter((s) => s.length > 0)
  if (kept.length === 0) return new Float32Array(0)
  const pause = Math.round((sampleRate * pauseMs) / 1000)
  const total = kept.reduce((sum, s) => sum + s.length, 0) + pause * (kept.length - 1)
  const out = new Float32Array(Math.max(0, total))
  let offset = 0
  for (let i = 0; i < kept.length; i++) {
    out.set(kept[i], offset)
    offset += kept[i].length
    if (i < kept.length - 1) offset += pause
  }
  return out
}

/**
 * Chaîne complète appliquée à chaque segment synthétisé : découpage du
 * silence → normalisation de crête → fondus — puis assemblage avec pauses.
 * C'est LA fonction consommée par mms-tts.ts ; les paramètres se passent
 * via un seul objet d'options (sous-ensembles acceptés).
 */
export function buildSpokenUtterance(
  segments: readonly Float32Array[],
  sampleRate: number,
  options?: SpokenUtteranceOptions,
): Float32Array {
  const processed = segments
    .map((segment) => {
      let x = trimSilence(segment, sampleRate, options)
      x = normalizePeak(x, options)
      x = applyFades(x, sampleRate, options)
      return x
    })
    // Un segment muet (sortie VITS dégénérée) ne doit produire ni audio ni
    // pause fantôme — il est retiré, comme les segments vides.
    .filter((x) => x.length > 0 && peakOf(x) >= 1e-6)
  return concatWithPauses(processed, sampleRate, options?.pauseMs ?? 220)
}

/** Frontières de phrases : ponctuation forte suivie d'un blanc, ou sauts de
 * ligne. Les décimales (« 12.50 », point NON suivi d'un blanc) ne coupent
 * pas — le point est consommé par la séparation seulement s'il précède un
 * blanc. Les « : » et « , » ne coupent pas (pauses trop fréquentes, le
 * VITS gère déjà le débit intra-phrase). */
const SENTENCE_SPLIT = /(?<=[.!?;…])\s+|\n+/

/** Un segment sans AUCUNE lettre ni chiffre ne produirait que du silence
 * (la whitelist du tokenizer supprime la ponctuation) : segment jeté. */
const HAS_SPEAKABLE = /[\p{L}\p{N}]/u

/**
 * Découpe un texte brut en segments de synthèse (une phrase par segment).
 * Appliqué SUR LE TEXTE AVANT normalisation orthographique (mms-tts) :
 * chaque segment passe ensuite par chiffres→mots + normalisateur de la
 * voix. Texte sans ponctuation forte → un seul segment. Jamais de segment
 * vide ni de segment purement ponctué dans la sortie.
 */
export function splitSpeechSegments(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  return trimmed
    .split(SENTENCE_SPLIT)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && HAS_SPEAKABLE.test(part))
}
