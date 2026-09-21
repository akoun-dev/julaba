/**
 * Définitions du plugin Capacitor `VoiceService` (Task 31) — moteur de
 * reconnaissance vocale unifié de Jùlaba.
 *
 * Implémentation native : android/app/src/main/java/ci/julaba/app/
 * VoiceServicePlugin.java (plugin local Java, pas un package npm).
 * Architecture cible issue de la mission POC Baoulé :
 *   VoiceService → FrenchRecognizer (Sherpa-ONNX, prêt)
 *               → BaouleRecognizer (Omnilingual ASR bci_Latn, réservé)
 *
 * Les noms de champs de VoiceRecognitionResult reprennent EXACTEMENT
 * l'interface RecognitionResult de la mission (§6) : text, language,
 * audioDurationMs, inferenceDurationMs, realtimeFactor — ce qui garantit
 * la comparabilité directe avec les benchmarks du POC
 * julaba-baoule-asr-poc (RTF = inferenceDurationMs / audioDurationMs).
 */

/**
 * Langues reconnues par le VoiceService. `bci` = Baoulé (bci_Latn),
 * `dyu` = Dioula/Jula (dyu_Latn) — les DEUX routent vers le MÊME moteur
 * Omnilingual ASR 1 600 langues (CTC 300M) : la couverture dioula est une
 * extension de code, pas un nouveau modèle.
 */
export type VoiceLanguage = 'fr' | 'bci' | 'dyu'

/** Moteurs sous-jacents, pour diagnostics et l'écran de statut. */
export const VOICE_ENGINES = {
  fr: 'sherpa-onnx-zipformer-fr-2023-04-14-int8',
  bci: 'omnilingual-asr-300M-ctc-int8-2025-11-12',
  dyu: 'omnilingual-asr-300M-ctc-int8-2025-11-12',
} as const

/** État du moteur pour la langue courante (réponse de isReady/initialize). */
export interface VoiceEngineStatus {
  /** true = le moteur peut transcrire MAINTENANT (fr chargé). */
  ready: boolean
  /** Langue du dernier initialize(), null si jamais initialisé. */
  language: VoiceLanguage | null
  /** Identifiant du moteur sous-jacent, null si jamais initialisé. */
  engine: string | null
}

/**
 * Résultat de transcription — champs identiques à RecognitionResult du POC
 * (mission §6) pour la comparabilité des benchmarks.
 */
export interface VoiceRecognitionResult {
  text: string
  language: VoiceLanguage
  /** Durée de l'audio enregistré (échantillons / 16 000). */
  audioDurationMs: number
  /** Durée d'inférence mesurée côté natif. */
  inferenceDurationMs: number
  /** RTF = inferenceDurationMs / audioDurationMs (< 1 = plus rapide que l'audio). */
  realtimeFactor: number
}

/** Options de initialize(). */
export interface VoiceInitializeOptions {
  /** Langue à charger (défaut 'fr'). 'bci' réserve le slot sans moteur prêt. */
  language?: VoiceLanguage
  /** Chemin d'assets du modèle français (défaut : modèle zipformer int8 embarqué). */
  modelPath?: string
}

/**
 * Disponibilité du MODÈLE pour une langue (sonde MODE-953, sans charger le
 * moteur) : assets de l'APK (build full), disque téléchargé (build allégé
 * + pack installé), ou absent des deux.
 */
export type VoiceModelAvailability = {
  available: boolean
  /** 'assets' = embarqué au build · 'disk' = pack téléchargé · 'none' = absent. */
  source: 'assets' | 'disk' | 'none'
}

/** Options de startRecording(). */
export interface VoiceStartRecordingOptions {
  /** Durée maximale d'enregistrement en ms (défaut 30 000, auto-stop natif). */
  maxDurationMs?: number
}

/** Options de transcribe(). */
export interface VoiceTranscribeOptions {
  /** Langue d'inférence (défaut : langue du dernier initialize()). */
  language?: VoiceLanguage
}

/** Résultat de stopRecording(). */
export interface VoiceStopRecordingResult {
  audioDurationMs: number
  sampleCount: number
}

/**
 * Codes d'erreur natifs (mission §15 + Sprint V MODE-953) — préfixés dans
 * le message de rejet :
 *   ENGINE_NOT_INITIALIZED, ALREADY_RECORDING, NO_RECORDING,
 *   PERMISSION_DENIED, MIC_UNAVAILABLE, ENGINE_ERROR, BAOULE_NOT_READY,
 *   PACK_MISSING (modèle absent des assets ET du disque — build allégé,
 *   pack vocal non encore installé ; l'utilisateur peut le télécharger
 *   depuis Réglages → Voix & Langue)
 */
export type VoiceServiceErrorCode =
  | 'ENGINE_NOT_INITIALIZED'
  | 'ALREADY_RECORDING'
  | 'NO_RECORDING'
  | 'PERMISSION_DENIED'
  | 'MIC_UNAVAILABLE'
  | 'ENGINE_ERROR'
  | 'BAOULE_NOT_READY'
  | 'PACK_MISSING'

/**
 * API du plugin natif — séquence d'appel prévue (push-to-talk) :
 *   await VoiceService.initialize({ language: 'fr' })
 *   await VoiceService.startRecording()          // appui
 *   await VoiceService.stopRecording()           // relâchement
 *   const r = await VoiceService.transcribe()    // texte + RTF
 */
export interface VoiceServicePlugin {
  initialize(options?: VoiceInitializeOptions): Promise<VoiceEngineStatus & { initialized: boolean }>
  isReady(): Promise<VoiceEngineStatus>
  /**
   * Sonde SANS effet de bord (MODE-953) : le modèle de la langue demandée
   * est-il disponible quelque part sur cet appareil (assets ou disque) ?
   * Ne charge RIEN — l'écran de réglages l'utilise pour l'état exact des
   * packs sans payer le chargement lourd du moteur.
   */
  isModelAvailable(options?: { language?: VoiceLanguage }): Promise<VoiceModelAvailability>
  startRecording(options?: VoiceStartRecordingOptions): Promise<{ started: boolean; maxDurationMs: number }>
  stopRecording(): Promise<VoiceStopRecordingResult>
  transcribe(options?: VoiceTranscribeOptions): Promise<VoiceRecognitionResult>
  release(): Promise<{ released: boolean }>
  removeAllListeners(): Promise<void>
}
