# Changelog — Jùlaba

*Format : date · commit · type · description. Les entrées antérieures au 2026-09-18 sont dans `worklog.md` (racine du dépôt).*

## 2026-09-19 (système multi-agents — session Task 50, boucle autonome)

- **[NORM-302]** Code mort supprimé après vérification **0 importeur** : `src/lib/supabase/browser.ts`, `src/components/identificateur/ident-top-bar.tsx`, `db/custom.db` (vestige Prisma), `examples/websocket/`, dépendance `z-ai-web-dev-sdk` (package.json + bun.lock synchronisés, 1 paquet retiré). Suite 598/598 · tsc 0 · lint 0 · **build prod validé** · CSP intacte.

## 2026-09-19 (système multi-agents — session Task 49, boucle autonome)

- **[B5-051]** Branchement de la façade BaouleVoiceEngine (REQ-B5b) :
  - `stt-factory` : la route bci de `createSmartSingleShotSTT` passe par `createBaouleTranscriptionSession` (la façade délègue au VoiceService — comportement strictement identique, point d'entrée unifié) ; route fr inchangée.
  - `voice-modal` + `prod-voice-modal` : migration vers la façade (`prepareBaouleParserInput` / `speakBaoule` / `describeBaouleEngineError`) ; `fetchJsonWithTimeout` ré-exporté par la façade — **BaouleVoiceEngine est l'entrée UNIQUE de la chaîne baoulé côté UI**.
  - Correction de charge : mock `@capacitor/core` de `stt-routing.test.ts` complété (`registerPlugin` — la façade introduit native-tts dans la chaîne d'import) ; `stt-factory.test.ts` l'avait déjà.
  - Non-régression fr : 32 tests tata-tts verts, route fr de stt-factory inchangée, 598/598 · tsc 0 · lint 0 · **build prod validé**.

## 2026-09-19 (système multi-agents — session Task 48, boucle autonome)

- **[B5-050]** Façade unifiée `src/lib/voice/baoule-engine.ts` livrée (REQ-B5a) :
  - Contrat `initialize/isReady/transcribe/speak` : `getBaouleEngineStatus` + `isBaouleEngineReady` (sondes sans effet de bord sur B1/B2/B3), `initializeBaouleEngine` (charge le moteur STT natif bci, **ne télécharge JAMAIS**, renvoie l'état exact des maillons manquants), `createBaouleTranscriptionSession` (STT baoulé offline, session inerte à erreur explicite hors coque native — jamais de repli fr), `translateBaouleToFrench`/`prepareBaouleParserInput` (garde B2-022, mapping NllbError → `BaouleEngineError`), `speakBaoule` (ne lève jamais, repli français hors chemin MMS), `installBaouleTranslator`/`installBaouleVoice` (installations OPT-IN explicites pour les réglages).
  - Erreurs dédiées : `BaouleEngineError` (7 codes : UNSUPPORTED, STT_UNAVAILABLE, TRANSLATOR_NOT_READY/ERROR, VOICE_NOT_READY/ERROR, EMPTY_INPUT) + `describeBaouleEngineError`.
  - **Façade pure** : aucune logique dupliquée — chaque maillon reste dans son module d'origine (voice-service, nllb-translation, mms-tts, conversation), source de vérité unique, tests existants inchangés.
  - Tests : `baoule-engine.test.ts` NOUVEAU 16 cas (sondes, initialize sans téléchargement, session STT, garde, mapping erreurs, speak, installs) → **suite 598/598 (38 fichiers)** · tsc 0 · lint 0 · **build prod validé**.

## 2026-09-19 (système multi-agents — session Task 47, boucle autonome)

- **[B4-041]** Confirmations oui/non bilingues + robustesse réseau livrées :
  - `src/lib/voice/confirmations.ts` — NOUVEAU : `parseConfirmation` bilingue fr + baoulé. **Liste PILOTE** (documentée dans le module, à confirmer par locuteur natif en B3-032) : oui = ɛhɛ/ɛhè/ɔ/ɔɔ/o/oo/ehe ; non = ao/a o. Normalisation NFD + strip tons (ɛhɛ́ → ɛhɛ) + apostrophes unifiées + ponctuation en espaces. Hors vocabulaire → null → la modale ré-analyse comme nouvelle commande (comportement historique conservé). Extensible : une forme = une entrée + un test.
  - Modales marchand + producteur : branches confirm migrées des regex 100 % françaises vers `parseConfirmation` — un « ɛhɛ » en session baoulé confirme désormais, un « ao » annule.
  - `conversation.ts` : `fetchJsonWithTimeout` (borne 10 s) — les fetch dépense/commande déclenchés en pleine conversation ne peuvent plus rester suspendus sur un serveur injoignable ; échec explicite → file offline existante (« en attente de synchronisation »). REQ-B4c couverte.
  - Tests : `confirmations.test.ts` NOUVEAU 39 cas + conversation.test.ts +4 (timeout, propagations) → **suite 582/582 (37 fichiers)** · tsc 0 · lint 0 · **build prod validé**.

## 2026-09-19 (système multi-agents — session Task 46, boucle autonome)

- **[B4-040]** Orchestrateur conversation bci→fr→IA→fr→bci livré :
  - `src/lib/voice/conversation.ts` — NOUVEAU nœud central de la chaîne : `resolveConversationInput` (lien montant — traduction bci→fr **obligatoire** via `resolveParserInput`, la garde B2-022 est désormais branchée en production : un échec traduction arrête la chaîne AVANT `parseIntent`, jamais de baoulé brut au parseur) et `narrateResponse` (lien descendant — réponse fr → NLLB fra→bci → `tataSpeak` avec le texte baoulé BRUT ; échec traduction → `tataSpeakWeb` **hors chemin MMS** : le français n'atteint jamais la voix akan + `translationError` explicite retourné à l'UI ; ne lève jamais).
  - `voice-modal.tsx` + `prod-voice-modal.tsx` : `handleTranscript` (transcript → orchestrateur → parseur) + 22 sites de narration migrés de `tataSpeak` vers `narrateResponse`. Session fr : pass-through strict (dispatch synchrone et chaîne historique inchangés — zéro régression).
  - Décision documentée : en session bci, `intent.rawTranscript` porte la **traduction française** (les correspondances catalogue `findCatalogEntry` et les descriptions synchronisées sont françaises côté données).
  - Limites honnêtes : les confirmations oui/non bci passent par la traduction NLLB (patterns natifs ɛhè… = B4-041) ; l'affichage des modales reste français.
  - Tests : `conversation.test.ts` NOUVEAU 13 cas (pass-through fr, garde B2-022, routage bci, repli hors-MMS, seams) → **suite 539/539 (36 fichiers)** · tsc 0 · eslint 0 · **build prod validé** (CSP wasm-unsafe-eval inchangée).

## 2026-09-19 (système multi-agents — session Task 44, boucle autonome)

- **[B3-031]** Moteur pilote TTS baoulé livré :
  - `src/lib/voice/mms-tts.ts` — `downloadMmsBciVoice` (opt-in, pré-remplissage du Cache API « transformers-cache » avec les clés URL HF exactes, progression, tokenizer.json **généré localement** — le port n'en fournit pas), `mmsBciSpeak` (normalizeBciText → pipeline → AudioContext, timeout, résolution à la fin réelle), `isMmsBciVoiceReady` (stricte : poids + tokenizer présents), `removeMmsBciVoice`, `MmsBciSpeak` ne télécharge jamais. Checkpoint proxy akan fp32 114 Mo (fp16 impossible en v2, documenté).
  - `normalizeBciText` : NFD + retrait des tons, ɛ/ɔ/'/ʼ préservés, ponctuation en pauses — sans lui le vocab 30 chars du donor mutilait le texte baoulé.
  - `tata-tts.ts` : chemin bci en amont de `tataSpeak` (texte BRUT — jamais `toSpeechText` français), repli français historique **inchangé** (extrait dans `dispatchFrenchNarration`, dispatch synchrone préservé) + signal une fois ; `tataStop`/`unlockTataAudio` étendus.
  - `src/components/shared/bci-voice-card.tsx` : carte réglages partagée marchand/producteur, libellé honnête « pilote — qualité limitée ».
  - Tests : `mms-tts.test.ts` (25 cas) + `tata-tts.test.ts` +6 cas bci → **suite 526/526 (35 fichiers)** · tsc 0 · eslint 0 · **build prod validé** (CSP wasm-unsafe-eval inchangée).
- **[B3-030]** Évaluation moteurs TTS Baoulé offline livrée (`.ai/EVAL_B3_TTS.md`). **Constat majeur : aucun TTS baoulé prêt à l'emploi n'existe** (facebook/mms-tts-bci absent de MMS ; le dépôt « bci-baseline » = kit de fine-tuning dont les poids restent ceux du donor akan). Corpus Waxal `bci_tts` (180 h mono-locuteur, CC-BY-4.0) disponible pour l'entraînement.
- **[MESURE B3-030]** Smoke réel sandbox (port ONNX donor akan, fp32 114 Mo) : chargement ~1 s, **RTF moyen 0,33**, synthèse phrase courte 250-350 ms, 4 WAV 16 kHz valides (`.ai/eval-b3/samples/`). Variante device cible : fp16 58 Mo.
- **[DÉCOUVERTE]** Vocab donor = 30 caractères sans diacritiques de tons → B3-031 devra inclure un **normalisateur orthographique bci** (strip tons, garder ɛ/ɔ/’). Port ONNX sans `tokenizer.json` → procédure fournie `.ai/eval-b3/build_tokenizer_json.py` (piège regex JS documenté).
- **[LICENCE]** Modèles MMS = CC-BY-NC-4.0 → pilote/évaluation uniquement ; la voie production licite = voix Piper custom (B3-034, runtime MIT) ou accord Waxal/UNIMA. Registre : B3-031 redéfinie (moteur pilote), B3-033/B3-034 créées (entraînements GPU, décision utilisateur), B3-032 élargie (écoute comparative).

## 2026-09-18 (système multi-agents — session Task 43, boucle autonome)

- **[CORRECTION]** `b0a95e1` fix(lint) : BUG-001 fermé — cycle de callbacks `vente-rapide-modal.tsx` cassé via refs d'indirection + `useEffect` (comportement inchangé ; lint 0, 480/480 tests).
- **[B2]** Module `src/lib/voice/nllb-translation.ts` livré : traduction offline bci_Latn↔fra_Latn (Xenova/nllb-200-distilled-600M q8), erreurs typées `NllbError` (7 codes) + messages FR, téléchargement opt-in avec progression agrégée, Cache API, timeout 20 s, **garde `resolveParserInput`** (le parseur ne reçoit jamais de bci brut). 21 tests de contrat → suite 501/501.
- **[MESURE B2-021]** Taille réelle du modèle : **≈ 872 Mo** (encoder q8 400 Mo + decoder q8 454 Mo + tokenizer 17 Mo) — variante la plus légère disponible (q4 2,2 Go / int8 1,8 Go / fp16 1,7 Go sont pires). Implication : téléchargement opt-in obligatoire, jamais embarqué dans l'APK.
- **[CONSTAT]** Le chargement du modèle dépasse la RAM du sandbox de build (OOM kill ~2,3 Go, exit 137) → mesure de latence et validation qualité des traductions réelles reportées sur appareil (rejoint B1-010).
- **[OUTIL]** `scripts/smoke-nllb.mjs` : mesure taille/latence + round-trip, réexécutable sur hôte ≥ 4 Go RAM (option `--local`).

## 2026-09-18 (avant prise en charge multi-agents — historique récent)

- `ce8aa12` feat(vente) : enregistrer les ventes vocales et gérer la synchronisation — `src/lib/quick-sale.ts` (service partagé), étape de confirmation vocale dans `vente-rapide-modal.tsx`, bascule `voice-modal.tsx` sur `completeQuickSale`. ⚠️ Introduit 2 erreurs lint (BUG-001).
- `6c3f77d` fix(voix) : CSP `'wasm-unsafe-eval'` — Kokoro/Piper instanciables en production (Task 41) + messages d'erreur de téléchargement.
- `bfec4f8` feat(voix) : langue par défaut Français/Baoulé dans les réglages marchand + producteur (Task 40).
- `601da3b` fix(auth) : voix de la connexion toujours en français.
- `b1ab5f4` feat(auth) : redesign section code secret « terre ».
- `3ebadec` fix(session) : retrait du blocage « compte déjà utilisé sur un autre appareil ».

## 2026-09-18 (système multi-agents)

- **[ANALYSE]** Analyse complète du projet exécutée (AGENT 1 audit technique + AGENT 2 inventaire fonctionnel) après réinitialisation du sandbox (repo re-cloné, deps réinstallées, baseline revalidée).
- **[PILOTAGE]** Création du dossier `.ai/` (14 fichiers) + registre `TASKS.xlsx` — référentiel initial : 10 fonctionnalités livrées, 5 étapes roadmap Baoulé (B1 existant/B2-B5 à construire), 5 tâches de normalisation, 2 tâches d'infra, 1 bug (BUG-001).
- **[BASELINE]** 480/480 tests verts · tsc 0 erreur · eslint 2 erreurs (BUG-001, préexistantes).

## Décisions d'architecture enregistrées

1. **DADR-001** — La traduction NLLB-200 (B2) suivra le pattern établi des modèles opt-in (`kokoro-tts.ts`) : téléchargement sur action utilisateur, Cache API, progression, erreurs explicites, compat CSP `'wasm-unsafe-eval'`.
2. **DADR-002** — Le module `BaouleVoiceEngine` (B5) sera un module TS unifié côté app (comme `voice-service.ts`), les modèles lourds restant côté natif (pattern VoiceServicePlugin) ou WASM opt-in.
3. **DADR-003** — Ne pas introduire de couche repository côté serveur dans l'immédiat (pas de violation client actuelle ; normalisation serveur différée NORM-30x, non bloquante pour la roadmap).
