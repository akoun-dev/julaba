# VoiceService — moteur vocal unifié (Task 31)

Plugin Capacitor local (`VoiceService`) qui unifie la reconnaissance vocale de
Jùlaba derrière l'API de façade définie par la mission POC Baoulé :

```
initialize() → isReady() → startRecording() → stopRecording() → transcribe() → release()
```

Architecture cible : **un routeur, un reconnaisseur par langue**.

```
                    ┌──────────────────────────────────────────┐
   UI (push-to-talk)│  src/lib/voice/voice-service.ts          │
                    │  createVoiceServiceSingleShotSTT()       │
                    └───────────────┬──────────────────────────┘
                                    │ lang
                 ┌──────────────────┴───────────────────┐
                 ▼                                      ▼
        lang = 'fr'                             lang = 'bci' (Baoulé)
        FrenchRecognizer                        BaouleRecognizer
        sherpa-onnx zipformer FR int8           Omnilingual ASR CTC 300M int8
        (mode batch, 100 % offline)             bci_Latn — modèle embarqué
                 │                              (Task 35, 100 % offline)
                 ▼                                      │
        VoiceServicePlugin.java                         ▼
        (AudioRecord 16 kHz mono PCM16,         OfflineRecognizer CTC
         buffer mémoire, métriques RTF)         (erreur BAOULE_NOT_READY
                                                explicite si le modèle
                                                n'est pas dans le build)
```

## Fichiers

| Fichier | Rôle |
|---|---|
| `android/app/src/main/java/ci/julaba/app/VoiceServicePlugin.java` | Plugin natif Java local (enregistré dans `MainActivity`) — capture micro + inférence + métriques |
| `src/plugins/voice-service/definitions.ts` | Types TypeScript (API, `VoiceRecognitionResult`, codes d'erreur) |
| `src/plugins/voice-service/web.ts` | Implémentation web (échec explicite — pas d'ASR natif dans un navigateur) |
| `src/plugins/voice-service/index.ts` | `registerPlugin('VoiceService')` |
| `src/lib/voice/voice-service.ts` | Couche haut niveau : routing de langue, session `STTSession`, traduction des erreurs |
| `src/lib/voice/__tests__/voice-service.test.ts` | Tests unitaires (routing, push-to-talk, erreurs, fallback web) |

## API du plugin natif

- `initialize({ language?, modelPath? })` — charge le moteur. `'fr'` : modèle
  zipformer FR int8 embarqué dans `assets/models/` (le MÊME que
  `SherpaSttPlugin`, mais en mode batch push-to-talk — le plugin streaming
  existant reste intact). `'bci'` : réussit mais réserve seulement le slot
  (moteur indisponible → `ready: false`).
- `isReady()` → `{ ready, language, engine }` — état natif exact, pour
  diagnostics et écrans de statut.
- `startRecording({ maxDurationMs? })` — ouvre le micro (16 kHz, mono, PCM
  16 bits), buffer en mémoire, auto-stop natif à `maxDurationMs`
  (30 000 ms par défaut). Demande la permission `RECORD_AUDIO` au besoin.
- `stopRecording()` → `{ audioDurationMs, sampleCount }` — arrête la capture,
  conserve le buffer pour `transcribe()`.
- `transcribe({ language? })` → `VoiceRecognitionResult` — inférence batch sur
  le buffer, sur thread dédié. **Stoppe implicitement** la capture si elle est
  encore active (push-to-talk permissif). Si `language: 'bci'` → rejet
  `BAOULE_NOT_READY`.
- `release()` — libère moteur, micro et buffer.

`VoiceRecognitionResult` reprend **exactement** les champs de la mission (§6) :
`text`, `language`, `audioDurationMs`, `inferenceDurationMs`, `realtimeFactor`
(RTF < 1 = inférence plus rapide que l'audio). Les résultats du plugin sont donc
directement comparables aux benchmarks du POC `julaba-baoule-asr-poc`.

## Codes d'erreur (mission §15)

Chaque rejet natif préfixe son code ; `mapVoiceServiceError()` (couche TS) le
traduit en message utilisateur :

| Code | Signification |
|---|---|
| `ENGINE_NOT_INITIALIZED` | `initialize()` non appelé ou moteur relâché |
| `ALREADY_RECORDING` | `startRecording()` appelé deux fois |
| `NO_RECORDING` | `transcribe()` sans audio enregistré |
| `PERMISSION_DENIED` | Permission microphone refusée |
| `MIC_UNAVAILABLE` | Impossible d'initialiser l'`AudioRecord` |
| `ENGINE_ERROR` | Échec de chargement/inférence du moteur |
| `BAOULE_NOT_READY` | Moteur Baoulé non chargé / modèle non embarqué dans ce build (voir ci-dessous) |

## État du Baoulé — intégré (Task 35)

La mission POC (dépôt indépendant **`julaba-baoule-asr-poc`**) imposait :
aucune intégration du Baoulé avant un `docs/BENCHMARK.md` reproductible.
**Le propriétaire du projet a levé ce verrou (Task 35)** : le moteur omnilingual
CTC 300M (k2-fsa, 1600 langues, int8) est intégré au VoiceService natif.

- le modèle `model.int8.onnx` (349 Mo) est **embarqué dans les assets** de
  l'APK via `scripts/fetch-android-deps.sh` (100 % offline — aucun envoi
  d'audio, aucune API cloud) ;
- `initialize({ language: 'bci' })` charge le modèle sur thread dédié
  (quelques secondes au premier usage, puis idempotent) ;
- `transcribe({ language: 'bci' })` décode l'utterance complète
  (OfflineRecognizer CTC) et renvoie texte + métriques (RTF) ;
- garde-fous maintenus : si le modèle n'est pas embarqué dans le build (APK
  allégé) ou le chargement échoue, l'erreur reste **explicite**
  (`BAOULE_NOT_READY`) — jamais un fallback silencieux vers le français ;
- en écoute continue (mot d'appel), le Baoulé reste refusé explicitement :
  le CTC est un moteur offline (utterance complète), sans variante streaming.

> **Validation qualité recommandée** : le `docs/BENCHMARK.md` du POC
> (≥ 10 phrases, CER/WER avec locuteurs natifs, RTF/RAM mesurés) reste le
> passage obligé avant un usage terrain intensif — l'intégration est
> fonctionnelle, sa précision en conditions réelles n'est pas encore mesurée.

## Branchement (Tasks 32 & 35 — ACTIF)

VoiceService est branché dans `src/lib/voice/stt-factory.ts` via
un **sélecteur de langue** persisté (`src/lib/stores/voice-language-store.ts`,
zustand + localStorage) :

```
createSmartSingleShotSTT(callbacks, options?)
  ├─ lang 'bci' (options.lang ou sélecteur « Baoulé β »)
  │    → route DÉDIÉE VoiceService, AUCUN fallback :
  │      moteur omnilingual CTC offline (Task 35) ; erreur explicite
  │      BAOULE_NOT_READY si le modèle n'est pas embarqué dans ce build
  │      (jamais de fallback silencieux vers le français)
  ├─ lang 'fr' sur coque native
  │    → VoiceService (batch push-to-talk offline, métriques RTF)
  │      → SherpaStt streaming (chaîne historique, si init VoiceService échoue)
  │      → Web Speech API
  └─ lang 'fr' sur web → chaîne historique (Web Speech), sans VoiceService
```

- `createSmartContinuousSTT` (mot d'appel « Julaba ») reste sur Sherpa
  streaming — le VoiceService est un moteur batch push-to-talk ; une
  demande continue en Baoulé est refusée explicitement.
- UI : `VoiceLanguageSelector` (`src/components/voice/language-selector.tsx`),
  contrôle segmenté « Français / Baoulé β » intégré aux deux modales vocales
  (marchand + producteur).
- La porte des boutons micro est `canAttemptSTT()` : sur coque native elle
  vaut true dès le démarrage (le VoiceService charge son moteur au premier
  usage — 1–2 s sur la première interaction).
- Les erreurs de session passent par `describeSTTError()` : les codes
  connus (Web Speech) gardent leurs messages dédiés, tout message déjà
  formulé (VoiceService : micro, moteur, Baoulé non prêt…) est affiché
  TEL QUEL dans les 5 consommateurs STT (modales marchand/producteur,
  ouverture caisse, montant vocal, écran d'authentification).

## Garanties

- **100 % offline sur natif** : aucun appel réseau, l'audio ne quitte jamais
  l'appareil (contrainte absolue de la mission).
- **Sherpa-ONNX français intact** : `SherpaSttPlugin` n'est pas modifié ;
  VoiceService charge sa propre instance du modèle embarqué.
- **Pas de fine-tuning, pas d'API cloud, pas d'autres langues ivoiriennes**
  que le Baoulé (mission §18).
