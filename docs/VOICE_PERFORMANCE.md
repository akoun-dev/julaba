# Performance voix — chargement à la demande (MODE-962)

Problème traité : ralentissements marqués (voire gel) de l'application
lors du changement de langue Français → Baoulé ou Français → Dioula dans
le WebView Android. La correction est un changement de politique de cycle
de vie des modèles, pas une optimisation cosmétique : **aucun loader
ajouté pour masquer le problème — le problème a été supprimé.**

## Cause racine (prouvée)

Commit `52badec` (« feat(voix): préchauffer les modèles et mettre en cache
les traductions ») branchait, à chaque clic du sélecteur de langue vers
bci/dyu :

```ts
// src/components/voice/language-selector.tsx (AVANT)
setVoiceLanguage(opt.value)
if (opt.value !== 'fr') warmMultilingualVoice(opt.value)
```

et `warmMultilingualVoice` (src/lib/voice/voice-warmup.ts) faisait :

```ts
void Promise.all([
  import('./nllb-translation').then(({ warmNllbModel }) => warmNllbModel(language)),
  import('./mms-tts').then(({ warmMmsVoice }) => warmMmsVoice(language)),
])
```

Conséquence : à un simple changement d'état de langue, le WebView lançait
EN PARALLÈLE le chargement mémoire de NLLB (~870–893 Mo de poids q8,
davantage décompressés à l'exécution) et du TTS MMS (~114 Mo fp32), plus
l'initialisation du runtime ONNX/WASM de Transformers.js — même quand les
fichiers venaient du cache local. Sur Android (Capacitor), cette
concurrence mémoire WebView + ONNX Runtime + modèles se traduisait par
jank, gel perçu, voire arrêt du processus WebView. Le changement de langue,
opération qui devrait coûter quelques microsecondes (un `set` zustand),
sous-tendait ~1 Go de données en RAM.

## Architecture avant / après

```
AVANT
Sélection Baoulé
      ↓
warmMultilingualVoice()
      ↓
Promise.all [ NLLB ~893 Mo  +  MMS ~114 Mo ]
      ↓
runtime ONNX/WASM + poids décompressés en RAM WebView
      ↓
forte consommation RAM/CPU → jank / gel

APRÈS (MODE-962)
Sélection Baoulé
      ↓
setVoiceLanguage('bci')   ← pur état, < 1 ms
      ↓
UI immédiate — aucun modèle lourd
      ↓ (chargements différés, un à la fois, au premier usage réel)
Micro            → probe → initVoiceService('bci')  → ASR omnilingual
Traduction       → translateText()                  → loadNllb()
Narration locale → mms*Speak()                      → loadMms()
```

## Cycle de vie des modèles

| Modèle | Avant | Après |
|---|---|---|
| Omnilingual ASR (349 Mo, partagé bci/dyu) | Chargé uniquement au micro (déjà lazy) — mais bci↔dyu méconnu | Idem + probe `PACK_MISSING` avant init ; bci↔dyu = bascule d'étiquette native (pas de rechargement) |
| NLLB (~870–893 Mo) | Chargé au CLIC de langue via warm-up (en parallèle du MMS) | Chargé uniquement à la première traduction réelle (`translateText` → `loadNllb`) |
| MMS / TTS local (~114 Mo) | Chargé au CLIC de langue via warm-up (en parallèle du NLLB) | Chargé uniquement à la première narration locale (`mms*Speak` → `loadMms`) |
| ASR français (sherpa-onnx, embarqué) | Lazy au premier micro, sans probe | Identique — chemin historique intact, aucun probe, aucun passage par NLLB/MMS/Omnilingual |

Garanties transverses inchangées : téléchargements uniquement sur action
utilisateur explicite (réglages voix), `PACK_MISSING` explicite (jamais de
repli silencieux vers le français), 100 % offline une fois les packs
installés, une langue = une instance réutilisables (caches NLLB/MMS).

## Anti-race (déduplication par langue)

`initVoiceService` garantit qu'au plus UNE initialisation lourde est
active, et que chaque demandeur reçoit la promesse de SA langue :

- même langue déjà prête → `true` immédiat ;
- même langue en vol → la promesse en cours est partagée (un seul
  chargement sous clics répétés du micro) ;
- autre langue en vol → elle se termine d'abord, puis la nouvelle démarre
  (séquentiel — jamais deux modèles lourds en concurrence, jamais une
  promesse d'une autre langue résolue à la place).

## Instrumentation (dev uniquement)

`src/lib/voice/voice-perf.ts` — no-op en production :

| Métrique | Point de mesure |
|---|---|
| `language_switch_ms` | clic du sélecteur (`language-selector.tsx`) |
| `asr_load_ms` | `initVoiceService` (`voice-service.ts`) |
| `nllb_load_ms` | `loadNllb` (`nllb-translation.ts`) |
| `nllb_inference_ms` | `translateText` (`nllb-translation.ts`) |
| `tts_load_ms` | `loadMms` (`mms-tts.ts`) |
| `tts_generation_ms` | `speakWithMms` (`mms-tts.ts`) |

Format : `[Voice] language_switch_ms from=fr to=bci 0ms`.

## Comment vérifier

1. **Banc automatisé** : `bun run test` —
   `src/lib/voice/__tests__/voice-lazy-loading.test.ts` verrouille les 9
   scénarios d'acceptation (le changement de langue sans chargement, ASR à
   l'appui micro, anti-race, PACK_MISSING, français intact, garde-fou de
   régression sur le sélecteur).
2. **Banc Android réel** (à exécuter par le porteur, APK full avec packs) :
   lancer l'app → Français → Baoulé → Dioula → Baoulé → micro → traduction
   → TTS, en observant fluidité, RAM (adb shell dumpsys meminfo) et absence
   d'ANR. Les logs `[Voice] …ms` (build debug) donnent les latences réelles
   de chaque étape ; le changement de langue doit rester sous quelques ms
   et n'entraîner AUCUN log de chargement.
