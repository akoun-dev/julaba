// Registre unifié des PACKS VOCAUX de Jùlaba (Sprint V, MODE-952).
//
// Jùlaba embarquait jusqu'ici TOUS ses modèles vocaux dans l'APK
// (scripts/fetch-android-deps.sh : zipformer FR int8 + omnilingual CTC
// 300M int8 = 349 Mo) — un APK ≈ 400 Mo inlivrable sur le Play Store
// (limite de l'APK de base : 150 Mo). Décision d'architecture (propriétaire,
// 2026-09-21) : séparer en trois niveaux — APK de base léger / pack vocal
// téléchargé avec CONSENTEMENT EXPLICITE / packs spécialisés optionnels.
//
// CE REGISTRE est la carte unique de ces packs : un descripteur par
// ressource lourde, avec sa taille honnête (vérifiée ou estimée ET
// signalée comme telle — jamais un chiffre inventé présenté comme mesuré),
// son mécanisme de stockage réel et le module propriétaire qui l'installe.
//
// RÈGLE DU PROJET (inchangée) : le téléchargement n'est JAMAIS implicite.
// Chaque installation part d'une action utilisateur explicite (réglages
// voix) — le pack-manager (pack-manager.ts) est le contrat uniforme, les
// modules existants (piper-tts, kokoro-tts, nllb-translation, mms-tts,
// voice-service) restent les SEULES sources de vérité de leurs mécanismes.
// Ce registre ne duplique aucune logique : il décrit et oriente.

/** Identifiants stables des packs — ne JAMAIS renommer (persistés côté UI). */
export type VoicePackId =
  | 'stt-fr-native'
  | 'stt-locales-native'
  | 'tts-piper-fr'
  | 'tts-kokoro-fr'
  | 'nllb-bci'
  | 'nllb-dyu'
  | 'tts-mms-bci'
  | 'tts-mms-dyu'

/** Où vit réellement la ressource une fois installée. */
export type VoicePackMechanism =
  | 'apk-assets' // embarqué dans l'APK au build (fetch-android-deps.sh) — MODE-953 ajoute le chemin disque pour les builds lite
  | 'opfs' // OPFS géré par @mintplex-labs/piper-tts-web
  | 'cache-api' // Cache API de la WebView (Transformers.js / kokoro-js)

export type VoicePackDescriptor = {
  id: VoicePackId
  /** Libellé affiché (réglages voix). */
  label: string
  /** Description utilisateur — dit CE QUE le pack débloque, sans jargon. */
  description: string
  /** Codes de langue du stack vocal (fr / bci / dyu). */
  languages: readonly ('fr' | 'bci' | 'dyu')[]
  /** Poids en Mo — HONNÊTE : vérifié au téléchargement, ou estimation SIGNALÉE (sizeVerified=false). */
  sizeMb: number
  sizeVerified: boolean
  mechanism: VoicePackMechanism
  /**
   * true = jamais installé sans consentement explicite (téléchargement
   * lourd) ; false = cœur du produit, présent dans l'APK de base.
   */
  optIn: boolean
  /** true = embarqué dans l'APK « full » (fetch-android-deps.sh actuel). */
  bundledInFullApk: boolean
  /** Peut-on le désinstaller (libérer l'espace) depuis les réglages ? */
  removable: boolean
  /** Module propriétaire du mécanisme (traçabilité, aucun re-branchement). */
  ownerModule: string
}

/**
 * Tailles :
 * - stt-locales-native : 349 Mo — VÉRIFIÉ (docs/VOICE_SERVICE.md §Task 35,
 *   model.int8.onnx embarqué via fetch-android-deps.sh).
 * - nllb-bci 893 Mo, nllb-dyu 872 Mo, mms 114 Mo, kokoro 86 + espeak 18 Mo,
 *   piper ~25 Mo : valeurs portées par les modules propriétaires
 *   (nllb-translation.ts, mms-tts.ts, kokoro-tts.ts, piper-tts.ts).
 * - stt-fr-native : ESTIMATION (~90 Mo d'après la page du modèle
 *   sherpa-onnx-streaming-zipformer-fr-2023-04-14 variante int8) — non
 *   mesurable dans cet environnement (assets hors git) ; MODE-953 mesurera
 *   la valeur réelle au premier build lite et corrigera ce descripteur.
 */
export const VOICE_PACKS: readonly VoicePackDescriptor[] = [
  {
    id: 'stt-fr-native',
    label: 'Dictée française (hors-ligne)',
    description:
      "Moteur de reconnaissance du français qui reste sur l'appareil. Présent dans l'APK de base ; dans les builds allégés, il est téléchargé une seule fois.",
    languages: ['fr'],
    sizeMb: 90,
    sizeVerified: false,
    mechanism: 'apk-assets',
    optIn: false,
    bundledInFullApk: true,
    removable: false,
    ownerModule: 'src/lib/voice/sherpa-stt.ts + voice-service.ts',
  },
  {
    id: 'stt-locales-native',
    label: 'Dictée baoulé & dioula (hors-ligne)',
    description:
      "Un seul moteur reconnaît le baoulé ET le dioula, sans réseau (349 Mo). Installation recommandée en Wi-Fi ; la dictée française reste disponible sans ce pack.",
    languages: ['bci', 'dyu'],
    sizeMb: 349,
    sizeVerified: true,
    mechanism: 'apk-assets',
    optIn: true,
    bundledInFullApk: true,
    removable: true,
    ownerModule: 'src/lib/voice/voice-service.ts (Omnilingual ASR CTC 300M)',
  },
  {
    id: 'tts-piper-fr',
    label: 'Voix haute qualité (Piper)',
    description:
      'Voix française neuronale pour Tata, plus naturelle que la voix du système. Téléchargée une seule fois, fonctionne ensuite hors-ligne.',
    languages: ['fr'],
    sizeMb: 25,
    sizeVerified: false,
    mechanism: 'opfs',
    optIn: true,
    bundledInFullApk: false,
    removable: true,
    ownerModule: 'src/lib/voice/piper-tts.ts',
  },
  {
    id: 'tts-kokoro-fr',
    label: 'Voix haute qualité Kokoro',
    description:
      'Seconde voix française neuronale (alternative à Piper). Téléchargement unique incluant le moteur de prononciation, puis hors-ligne.',
    languages: ['fr'],
    sizeMb: 104,
    sizeVerified: true,
    mechanism: 'cache-api',
    optIn: true,
    bundledInFullApk: false,
    removable: true,
    ownerModule: 'src/lib/voice/kokoro-tts.ts (modèle 86 Mo + espeak-ng WASM 18 Mo)',
  },
  {
    id: 'nllb-bci',
    label: 'Traduction baoulé ↔ français',
    description:
      "Permet à Tata de comprendre une dictée baoulé en la traduisant vers le français (893 Mo — Wi-Fi vivement conseillé). Sans ce pack, la dictée baoulé annonce explicitement ce qui manque.",
    languages: ['bci'],
    sizeMb: 893,
    sizeVerified: true,
    mechanism: 'cache-api',
    optIn: true,
    bundledInFullApk: false,
    removable: true,
    ownerModule: 'src/lib/voice/nllb-translation.ts (finetune nllb-baoule-v1)',
  },
  {
    id: 'nllb-dyu',
    label: 'Traduction dioula ↔ français',
    description:
      'Permet à Tata de comprendre une dictée dioula en la traduisant vers le français (872 Mo — Wi-Fi vivement conseillé).',
    languages: ['dyu'],
    sizeMb: 872,
    sizeVerified: true,
    mechanism: 'cache-api',
    optIn: true,
    bundledInFullApk: false,
    removable: true,
    ownerModule: 'src/lib/voice/nllb-translation.ts (NLLB-200-distilled-600M)',
  },
  {
    id: 'tts-mms-bci',
    label: 'Voix baoulé (pilote)',
    description:
      'Fait parler Tata en baoulé (voix pilote de qualité limitée, dite honnêtement). 114 Mo, téléchargement unique.',
    languages: ['bci'],
    sizeMb: 114,
    sizeVerified: true,
    mechanism: 'cache-api',
    optIn: true,
    bundledInFullApk: false,
    removable: true,
    ownerModule: 'src/lib/voice/mms-tts.ts (MMS-TTS akan, donor)',
  },
  {
    id: 'tts-mms-dyu',
    label: 'Voix dioula',
    description:
      'Fait parler Tata en dioula (qualité validée produit). 114 Mo, téléchargement unique via le serveur Jùlaba.',
    languages: ['dyu'],
    sizeMb: 114,
    sizeVerified: true,
    mechanism: 'cache-api',
    optIn: true,
    bundledInFullApk: false,
    removable: true,
    ownerModule: 'src/lib/voice/mms-tts.ts (MMS-TTS dyu, proxy /api/voix/dyu-model)',
  },
] as const

const VOICE_PACK_IDS = new Set<string>(VOICE_PACKS.map((p) => p.id))

export function getVoicePackDescriptor(id: VoicePackId): VoicePackDescriptor | null {
  return VOICE_PACKS.find((p) => p.id === id) ?? null
}

export function isVoicePackId(id: string): id is VoicePackId {
  return VOICE_PACK_IDS.has(id)
}
