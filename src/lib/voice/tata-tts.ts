// Tata Nanti Lou - TTS Voice Feedback System
// Engine chain: native system TTS (Capacitor shell — Android/iOS), optional
// opt-in Piper neural TTS (see piper-tts.ts), Web Speech Synthesis API with
// French voice as the browser fallback.
//
// BCI PILOT PATH (B3-031): when the user selects « Baoulé » as the voice
// language AND has installed the pilot MMS voice (mms-tts.ts — donor akan
// checkpoint, quality-limited, see .ai/EVAL_B3_TTS.md), tataSpeak routes
// the RAW text (no French amount normalisation) to the MMS engine first;
// if it is not installed or fails, the historic French chain below runs
// unchanged and the limitation is announced once per session (never a
// silent fallback).
import { piperSpeak, piperStop, isPiperVoiceReady, unlockPiperAudio } from './piper-tts'
import { kokoroSpeak, kokoroStop, isKokoroVoiceReady, unlockKokoroAudio } from './kokoro-tts'
import { mmsBciSpeak, mmsDyuSpeak, mmsStop, isMmsBciVoiceReady, isMmsDyuVoiceReady, unlockMmsAudio } from './mms-tts'
import { TataTts, isNativeTtsAvailable } from './native-tts'
import { toSpeechText } from './speech-text'
import { notifySpokenChain } from './spoken-chain'
import { getSelectedTtsLanguage } from '../stores/voice-language-store'

let frenchVoice: SpeechSynthesisVoice | null = null
let isSpeaking = false

type TataCallback = (state: 'done' | 'error') => void
type TtsEngine = 'webspeech' | 'piper' | 'kokoro'

/**
 * Langue baoulé sélectionnée pour Tata sans voix pilote disponible (non
 * installée, ou chemin hors interaction où le moteur MMS n'est pas tenté) :
 * la narration continue en français et le signale UNE fois par session
 * (mission : jamais de repli silencieux, l'utilisateur sait ce qu'il
 * entend). B3-031 : le message pointe désormais vers l'installation de la
 * voix pilote (réglages voix).
 */
let _bciNarrationNotified = false
function notifyBciNarrationLimitOnce(): void {
  if (_bciNarrationNotified) return
  _bciNarrationNotified = true
  if (getSelectedTtsLanguage() === 'bci') {
    console.info(
      '[tata-tts] Langue baoulé sélectionnée : voix pilote non disponible ici — ' +
      'Tata narré en français (installer la voix pilote dans les réglages voix)'
    )
  }
}

/**
 * Dioula : la voix TTS dyu (MODE-914 — port ONNX facebook/mms-tts-dyu) est
 * OPT-IN : tant qu'elle n'est pas installée (réglages voix), la narration
 * reste en français ET le signale UNE fois par session — l'écoute et la
 * compréhension dioula sont elles complètes.
 */
let _dyuNarrationNotified = false
function notifyDioulaNarrationLimitOnce(): void {
  if (_dyuNarrationNotified) return
  _dyuNarrationNotified = true
  if (getSelectedTtsLanguage() === 'dyu') {
    console.info(
      '[tata-tts] Langue dioula sélectionnée : voix dioula non installée ici — ' +
      'Tata narré en français (installer la voix dioula dans les réglages voix)'
    )
  }
}

const TTS_ENGINE_KEY = 'julaba-tts-engine'
const TTS_ENGINE_VALUES: readonly TtsEngine[] = ['webspeech', 'piper', 'kokoro']

// Lazy-loaded store getter to avoid circular imports
let _getVoiceSettings: (() => { volume: number; rate: number }) | null = null
function getVoiceSettings(): { volume: number; rate: number } {
  if (!_getVoiceSettings) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useAppStore } = require('@/lib/stores/app-store')
      _getVoiceSettings = () => {
        const s = useAppStore.getState()
        return { volume: s.voiceVolume ?? 100, rate: s.voiceRate ?? 0.9 }
      }
    } catch {
      _getVoiceSettings = () => ({ volume: 100, rate: 0.9 })
    }
  }
  return _getVoiceSettings()
}

export function getTtsEngine(): TtsEngine {
  if (typeof window === 'undefined') return 'webspeech'
  const stored = localStorage.getItem(TTS_ENGINE_KEY)
  return TTS_ENGINE_VALUES.includes(stored as TtsEngine) ? (stored as TtsEngine) : 'webspeech'
}

export type EffectiveTtsEngine = 'kokoro' | 'piper' | 'native' | 'webspeech'

/**
 * Which engine ACTUALLY speaks right now — as opposed to getTtsEngine(),
 * which only reports the user's stored preference. Inside the native shell
 * the system TTS engine handles every non-neural utterance (the WebView has
 * no Web Speech at all — see native-tts.ts), so reporting 'webspeech' there
 * misled the diagnostics UI (audit F11).
 */
export function getEffectiveTtsEngine(): EffectiveTtsEngine {
  const engine = getTtsEngine()
  if (engine === 'kokoro') return 'kokoro'
  if (engine === 'piper') return 'piper'
  if (isNativeTtsAvailable()) return 'native'
  return 'webspeech'
}

/**
 * Switches the active TTS engine ('webspeech' | 'piper' | 'kokoro').
 * Callers should only set a neural engine after confirming the matching
 * is*VoiceReady() — tataSpeak falls back automatically if the model isn't
 * actually downloaded yet, but the settings UI should reflect real
 * availability rather than surprise the user with a silent fallback.
 */
export function setTtsEngine(engine: TtsEngine): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(TTS_ENGINE_KEY, engine)
}

/**
 * Initialize TTS and find a French voice
 */
export function initTata(): void {
  if (typeof window === 'undefined' || typeof speechSynthesis === 'undefined') return
  const voices = speechSynthesis.getVoices()
  frenchVoice = voices.find(v => v.lang.startsWith('fr')) || voices[0] || null
}

export type WebSpeechStatus = 'ready' | 'unsupported' | 'no-voice'

export function getWebSpeechStatus(): WebSpeechStatus {
  if (typeof window === 'undefined' || typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return 'unsupported'
  initTata()
  return frenchVoice || speechSynthesis.getVoices().length > 0 ? 'ready' : 'no-voice'
}

export function unlockTataAudio(): void {
  if (typeof window === 'undefined' || typeof speechSynthesis === 'undefined') return
  try {
    speechSynthesis.resume()
    initTata()
    if (getTtsEngine() === 'piper') unlockPiperAudio()
    if (getTtsEngine() === 'kokoro') unlockKokoroAudio()
    // La voix bci pilote et la voix dyu (MODE-914) sont orthogonales au
    // moteur : débloquer l'AudioContext du MMS uniquement quand une langue
    // qui l'utilise est demandée (création d'AudioContext inutile sinon).
    const voiceLang = getSelectedTtsLanguage()
    if (voiceLang === 'bci' || voiceLang === 'dyu') unlockMmsAudio()
  } catch { /* Browser audio can remain unavailable until a later gesture. */ }
}

// Re-init when voices load. Assigned once and idempotently: re-running this
// module (HMR, multiple imports under test) must not stack handlers (audit
// F10 — module-level listeners are never removed, so keep exactly one).
if (typeof window !== 'undefined' && typeof speechSynthesis !== 'undefined') {
  if (!speechSynthesis.onvoiceschanged) {
    speechSynthesis.onvoiceschanged = () => initTata()
  }
  // Try immediately
  setTimeout(initTata, 100)
}

function speakWithWebSpeech(text: string, callback?: TataCallback, rate: number = 0.9, volume: number = 1): void {
  if (getWebSpeechStatus() === 'unsupported') {
    // Diagnostic unique observable : "aucun son" doit pouvoir s'expliquer
    // (WebView sans Web Speech + pont natif absent = environnement cassé).
    console.warn('[tata-tts] Web Speech indisponible dans cet environnement — narration muette')
    callback?.('error')
    return
  }
  unlockTataAudio()
  // Traçabilité (spoken-chain.ts) : déclaré au moment où Web Speech s'engage
  // à parler, jamais pour un simple essai.
  notifySpokenChain('webspeech')

  try {
    speechSynthesis.cancel()
    // Chrome/Safari can keep the synthesis queue paused after canceling a
    // previous utterance. Resume before enqueueing the next one or speak()
    // succeeds while producing no audio.
    speechSynthesis.resume()
  } catch { /* WebView may throw or block */ }

  try {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'fr-FR'
    utterance.rate = rate
    utterance.pitch = 1.1
    utterance.volume = volume

    if (frenchVoice) {
      utterance.voice = frenchVoice
    }

    isSpeaking = true

    utterance.onend = () => {
      isSpeaking = false
      callback?.('done')
    }

    utterance.onerror = () => {
      isSpeaking = false
      callback?.('error')
    }

    speechSynthesis.speak(utterance)
  } catch {
    isSpeaking = false
    callback?.('error')
  }
}

/** Use the browser voice explicitly for automatic narrations that can happen
 * outside a direct gesture, such as onboarding step transitions. Inside the
 * native shell, the system TTS engine speaks instead (the WebView has no
 * Web Speech API at all — see native-tts.ts). Piper is deliberately skipped:
 * non-gesture narrations must not depend on a WASM model or an AudioContext
 * that autoplay policy can keep suspended. */
export function tataSpeakWeb(text: string, callback?: TataCallback, rate?: number, volume?: number): void {
  // Montants verbalisés une seule fois ici : le texte arrive déjà en
  // « mille cinq cents francs CFA » quel que soit le moteur en dessous.
  const spokenText = toSpeechText(text)
  const settings = getVoiceSettings()
  const effectiveRate = rate ?? settings.rate
  const effectiveVolume = (volume ?? settings.volume) / 100
  notifyBciNarrationLimitOnce()
  if (isNativeTtsAvailable()) {
    nativeSpeak(spokenText, callback, effectiveRate, effectiveVolume)
    return
  }
  speakWithWebSpeech(spokenText, callback, effectiveRate, effectiveVolume)
}

/** Speak through the native system TTS bridge (TataTtsPlugin). The plugin
 * resolves exactly once per utterance ({spoken:boolean}); a watchdog below
 * guarantees our callback still fires even if a broken system engine never
 * answers, so caller chains (speak → close modal → navigate) can never
 * freeze. */
function nativeSpeak(text: string, callback?: TataCallback, rate: number = 0.9, volume: number = 1): void {
  isSpeaking = true
  // Traçabilité : le pont natif est le maillon qui va réellement parler.
  notifySpokenChain('native')
  let settled = false
  const finish = (state: 'done' | 'error') => {
    if (settled) return
    settled = true
    clearTimeout(watchdog)
    isSpeaking = false
    callback?.(state)
  }
  // System engines always answer in practice; if one never does (exotic
  // device, killed TTS process), release the chain instead of hanging.
  const watchdog = setTimeout(() => {
    console.warn('[tata-tts] Watchdog moteur natif déclenché — libération du callback')
    try { void TataTts.stop() } catch { /* bridge gone */ }
    finish('done')
  }, 30_000 + Math.min(120_000, text.length * 80))

  TataTts.speak({ text, rate, volume })
    .then((res) => finish(res?.spoken === false ? 'error' : 'done'))
    .catch((err) => {
      console.warn('[tata-tts] Pont natif TTS en échec :', err)
      finish('error')
    })
}

/** Guaranteed-audible fallback after a Piper failure: native system voice
 * inside the shell (Web Speech doesn't exist there), Web Speech otherwise. */
function speakReliableFallback(text: string, callback?: TataCallback, rate?: number, volume?: number): void {
  if (isNativeTtsAvailable()) {
    nativeSpeak(text, callback, rate, volume)
    return
  }
  setTtsEngine('webspeech')
  speakWithWebSpeech(text, callback, rate, volume)
}

/**
 * Chaîne de narration FRANÇAISE historique — extraite telle quelle de
 * tataSpeak() pour servir de repli au chemin bci (comportement strictement
 * inchangé) :
 *  - sélection « webspeech » : dispatch SYNCHRONE (natif dans la coquille,
 *    sinon Web Speech) — ne jamais la rendre asynchrone : des appels
 *    chaînés et des tests dépendent du déclenchement dans le même tick ;
 *  - moteurs neuronaux (Kokoro/Piper) : chaîne async avec repli garanti.
 * ORDRE IMPOSÉ : Kokoro si sélectionné et prêt → Piper → TTS natif
 * Capacitor → Web Speech. Chaque maillon retourne false sans jamais lancer
 * de téléchargement : la narration ne peut rester ni bloquée ni muette.
 */
function dispatchFrenchNarration(
  spokenText: string,
  callback?: TataCallback,
  engine: TtsEngine = 'webspeech',
  rate: number = 0.9,
  volume: number = 1,
): void {
  if (engine === 'webspeech') {
    if (isNativeTtsAvailable()) {
      nativeSpeak(spokenText, callback, rate, volume)
      return
    }
    speakWithWebSpeech(spokenText, callback, rate, volume)
    return
  }

  isSpeaking = true

  const tryKokoro = async (): Promise<boolean> => {
    if (engine !== 'kokoro') return false
    // Prêt = modèle chargé ou déjà en cache. Sans cela, ne touche JAMAIS
    // au réseau (pas de téléchargement automatique depuis une narration).
    if (!(await isKokoroVoiceReady())) return false
    const played = await kokoroSpeak(spokenText, { rate, volume })
    if (played) notifySpokenChain('kokoro')
    return played
  }
  const tryPiper = async (): Promise<boolean> => {
    // Repli de Kokoro (engine 'kokoro') ou chemin principal (engine 'piper') :
    // ce maillon n'est atteint QUE pour ces deux valeurs — le chemin
    // 'webspeech' a déjà retourné plus haut, donc Piper (modèle WASM lourd)
    // n'est jamais tenté pour une sélection Web Speech.
    if (!(await isPiperVoiceReady())) return false
    const played = await piperSpeak(spokenText)
    if (played) notifySpokenChain('piper')
    return played
  }

  Promise.resolve()
    .then(tryKokoro)
    .then((played) => (played ? true : tryPiper()))
    .then((played) => {
      isSpeaking = false
      if (played) {
        callback?.('done')
        return
      }
      // Aucun moteur neuronal disponible/opérationnel : voix réellement
      // audible (native dans la coquille, Web Speech dans le navigateur).
      speakReliableFallback(spokenText, callback, rate, volume)
    })
    .catch((err) => {
      isSpeaking = false
      console.warn('[tata-tts] Chaîne de moteurs neuronaux en échec, repli :', err)
      speakReliableFallback(spokenText, callback, rate, volume)
    })
}

/**
 * Speak text with Tata's voice.
 *
 * Deux grands chemins, disjoints :
 *  1. LANGUE BCI DEMANDÉE (voice-language-store ttsLanguage = 'bci') — la
 *     voix pilote MMS (mms-tts.ts) reçoit le texte BRUT (pas de
 *     toSpeechText : c'est du baoulé, les montants français n'y ont pas de
 *     sens) et il est normalisé côté moteur. Sans voix installée/échec →
 *     signal une fois + chaîne française historique ci-dessous.
 *  2. LANGUE FRANÇAISE — chaîne historique inchangée (Piper/Kokoro opt-in,
 *     repli natif/Web Speech).
 *
 * `callback` fires exactly once, when speech finishes ('done') or fails
 * ('error') — every caller in this app treats it as a single completion
 * callback (chaining a navigate/close/state-change after it), so it must
 * never fire early. It used to also fire once immediately with 'speaking'
 * before either engine had produced any audio, which silently double-ran
 * every such callback (e.g. the wake-word handler below would open the
 * voice modal twice per detection, tearing down its own in-flight
 * auto-listen before it could start — see wake-word.ts/handleWakeWordDetected).
 */
export function tataSpeak(
  text: string,
  callback?: TataCallback,
  rate?: number,
  volume?: number
): void {
  if (typeof window === 'undefined') {
    callback?.('done')
    return
  }

  // Normalisation centrale des montants (intégration unique, aucun appelant
  // à modifier) : « 1 500 FCFA » → « mille cinq cents francs CFA » pour les
  // quatre moteurs (Kokoro, Piper, natif, Web Speech). Les PIN, téléphones
  // et codes ne matchent pas (aucune devise) et restent épelés chiffre par
  // chiffre côté Piper / intacts côté Kokoro. Idempotent.
  // ⚠️ Le chemin bci (1) passe le texte BRUT au moteur MMS — ce texte
  // normalisé français ne doit PAS atteindre la narration baoulé.
  const spokenText = toSpeechText(text)

  const settings = getVoiceSettings()
  const effectiveRate = rate ?? settings.rate
  const effectiveVolume = (volume ?? settings.volume) / 100

  const engine = getTtsEngine()

  if (getSelectedTtsLanguage() === 'bci') {
    // Chemin (1) — async : isMmsBciVoiceReady() est asynchrone par contrat
    // (Cache API). isSpeaking=true couvre toute la durée, comme la chaîne
    // neurale ; le callback ne part qu'une fois (done après lecture réelle,
    // ou via le repli français).
    isSpeaking = true
    Promise.resolve()
      .then(async () => {
        // Prêt = voix installée (cache) ou instance chargée. Ne télécharge
        // JAMAIS depuis une narration (garde dans mms-tts.ts aussi).
        if (!(await isMmsBciVoiceReady())) return false
        return mmsBciSpeak(text, { rate: effectiveRate, volume: effectiveVolume })
      })
      .then((played) => {
        if (played) {
          isSpeaking = false
          callback?.('done')
          return
        }
        // Voix pilote non installée ou synthèse en échec : narration
        // française habituelle, avec signal explicite (une fois).
        notifyBciNarrationLimitOnce()
        dispatchFrenchNarration(spokenText, callback, engine, effectiveRate, effectiveVolume)
      })
      .catch((err) => {
        isSpeaking = false
        console.warn('[tata-tts] Chemin bci en échec, repli français :', err)
        notifyBciNarrationLimitOnce()
        dispatchFrenchNarration(spokenText, callback, engine, effectiveRate, effectiveVolume)
      })
    return
  }

  // Langue dioula demandée (MODE-914) — chemin async symétrique du chemin
  // bci : la voix dyu reçoit le texte BRUT (pas de toSpeechText : en session
  // dioula ce texte est déjà en dioula — phrase de test ou réponse traduite
  // fra→dyu par conversation.ts). Sans voix installée/échec → signal une
  // fois + chaîne française historique ci-dessous.
  if (getSelectedTtsLanguage() === 'dyu') {
    isSpeaking = true
    Promise.resolve()
      .then(async () => {
        // Prêt = voix installée (cache) ou instance chargée. Ne télécharge
        // JAMAIS depuis une narration (garde dans mms-tts.ts aussi).
        if (!(await isMmsDyuVoiceReady())) return false
        return mmsDyuSpeak(text, { rate: effectiveRate, volume: effectiveVolume })
      })
      .then((played) => {
        if (played) {
          isSpeaking = false
          callback?.('done')
          return
        }
        // Voix dioula non installée ou synthèse en échec : narration
        // française habituelle, avec signal explicite (une fois).
        notifyDioulaNarrationLimitOnce()
        dispatchFrenchNarration(spokenText, callback, engine, effectiveRate, effectiveVolume)
      })
      .catch((err) => {
        isSpeaking = false
        console.warn('[tata-tts] Chemin dyu en échec, repli français :', err)
        notifyDioulaNarrationLimitOnce()
        dispatchFrenchNarration(spokenText, callback, engine, effectiveRate, effectiveVolume)
      })
    return
  }

  // Chemin (2) — français : dispatch historique, strictement inchangé.
  dispatchFrenchNarration(spokenText, callback, engine, effectiveRate, effectiveVolume)
}

/**
 * Stop current speech (any engine)
 */
export function tataStop(): void {
  kokoroStop()
  piperStop()
  mmsStop()
  if (isNativeTtsAvailable()) {
    try { void TataTts.stop() } catch { /* bridge gone */ }
  }
  if (typeof window !== 'undefined' && typeof speechSynthesis !== 'undefined') {
    try { speechSynthesis.cancel() } catch { /* WebView may block */ }
  }
  isSpeaking = false
}

/**
 * Check if Tata is currently speaking
 */
export function tataIsSpeaking(): boolean {
  return isSpeaking
}

/**
 * Play a beep sound (for push-to-talk feedback)
 * Uses a shared AudioContext to avoid exhausting the browser limit (~6)
 */
let _audioCtx: AudioContext | null = null
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!_audioCtx || _audioCtx.state === 'closed') {
    try { _audioCtx = new AudioContext() } catch { return null }
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {})
  }
  return _audioCtx
}

export function playBeep(type: 'start' | 'stop' | 'success' | 'error'): void {
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    switch (type) {
      case 'start':
        osc.frequency.value = 880
        gain.gain.value = 0.15
        osc.start()
        osc.stop(ctx.currentTime + 0.1)
        break
      case 'stop':
        osc.frequency.value = 660
        gain.gain.value = 0.15
        osc.start()
        osc.stop(ctx.currentTime + 0.1)
        break
      case 'success':
        osc.frequency.value = 1047
        gain.gain.value = 0.15
        osc.start()
        setTimeout(() => {
          const osc2 = ctx.createOscillator()
          const gain2 = ctx.createGain()
          osc2.connect(gain2)
          gain2.connect(ctx.destination)
          osc2.frequency.value = 1319
          gain2.gain.value = 0.15
          osc2.start()
          osc2.stop(ctx.currentTime + 0.15)
        }, 120)
        osc.stop(ctx.currentTime + 0.15)
        break
      case 'error':
        osc.frequency.value = 330
        gain.gain.value = 0.2
        osc.start()
        osc.stop(ctx.currentTime + 0.3)
        break
    }
  } catch {
    // Audio not available
  }
}

/**
 * Vibrate device (mobile haptic feedback)
 */
export function haptic(pattern: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light'): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  switch (pattern) {
    case 'light': navigator.vibrate(30); break
    case 'medium': navigator.vibrate([30, 20, 30]); break
    case 'heavy': navigator.vibrate([50, 30, 50, 30, 50]); break
    case 'success': navigator.vibrate([30, 50, 30, 50, 100]); break
    case 'error': navigator.vibrate([100, 50, 100]); break
  }
}
