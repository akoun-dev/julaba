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
        sherpa-onnx zipformer FR int8           Omnilingual ASR omniASR-CTC-300M
        (mode batch, 100 % offline)             bci_Latn — EMPLACEMENT RÉSERVÉ
                 │                                      │
                 ▼                                      ▼
        VoiceServicePlugin.java                 stub : erreur BAOULE_NOT_READY
        (AudioRecord 16 kHz mono PCM16,         tant que le benchmark du POC
         buffer mémoire, métriques RTF)         julaba-baoule-asr-poc n'est pas
                                                validé sur appareil réel
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
| `BAOULE_NOT_READY` | Moteur Baoulé non intégré (état documenté, voir ci-dessous) |

## État du Baoulé — pourquoi BAOULE_NOT_READY

La mission POC (dépôt indépendant **`julaba-baoule-asr-poc`**, non intégré ici)
impose : **aucune intégration du Baoulé dans Jùlaba avant un
`docs/BENCHMARK.md` reproductible** mesuré sur appareil Android ARM64 réel
(≥ 10 phrases, RTF / RAM / taille modèle / CER-WER avec locuteurs natifs).

Tant que ce rapport n'existe pas :

- la route `bci` du VoiceService répond par l'erreur explicite
  `BAOULE_NOT_READY` — jamais par un fallback silencieux vers le français ;
- le slot natif existe déjà (`initialize({ language: 'bci' })` réussit,
  `isReady()` rapporte `ready: false`), l'API est donc **stable**.

Quand le benchmark sera validé, l'intégration se fera en portant
`OmnilingualBaouleRecognizer` (Kotlin, du POC) derrière cette même interface —
sans rien changer aux consommateurs TS.

## Branchement futur (préparé, pas encore actif)

La couche `createVoiceServiceSingleShotSTT()` respecte les conventions
`STTSession`/`STTCallbacks` de `src/lib/voice/stt.ts`, pour un branchement
trivial plus tard :

1. **stt-factory** — ajouter VoiceService en tête de chaîne
   (`createSmartSingleShotSTT`) : VoiceService natif → SherpaStt natif →
   Web Speech. Non fait dans cette tâche : les consommateurs existants ne
   changent pas de comportement.
2. **Modales vocales marchand/producteur** — passer `lang: 'bci'` quand
   l'utilisateur choisit le Baoulé (sélecteur à venir).
3. **Wake-word** — le mode continu reste assuré par SherpaStt
   (streaming) ; VoiceService est optimisé pour le push-to-talk.

## Garanties

- **100 % offline sur natif** : aucun appel réseau, l'audio ne quitte jamais
  l'appareil (contrainte absolue de la mission).
- **Sherpa-ONNX français intact** : `SherpaSttPlugin` n'est pas modifié ;
  VoiceService charge sa propre instance du modèle embarqué.
- **Pas de fine-tuning, pas d'API cloud, pas d'autres langues ivoiriennes**
  que le Baoulé (mission §18).
