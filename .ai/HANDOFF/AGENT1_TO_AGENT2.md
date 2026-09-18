# HANDOFF AGENT 1 → AGENT 2

## Passation n° 7 — 2026-09-19 : Façade unifiée BaouleVoiceEngine (B5-050) livrée

```
Tâche         : B5-050
Statut        : CODE_TERMINÉ (598/598 · tsc 0 · lint 0 · build prod OK)
Progression   : 90 % (branchement = B5-051 ; smoke APK = B5-052)
Objectif      : REQ-B5a — contrat unifié initialize/isReady/transcribe/speak encapsulant B1→B4
```

**Modifications** :
- `src/lib/voice/baoule-engine.ts` — NOUVEAU, FAÇADE PURE (aucune logique dupliquée, chaque maillon reste dans son module d'origine) :
  - `getBaouleEngineStatus` / `isBaouleEngineReady` : sondes sans effet de bord des 3 maillons (STT natif disponible, NLLB en cache, voix MMS installée) ;
  - `initializeBaouleEngine` : charge le moteur STT natif bci, NE TÉLÉCHARGE JAMAIS, renvoie l'état exact des maillons manquants (l'UI oriente vers les installations opt-in) ;
  - `createBaouleTranscriptionSession` : session STT baoulé offline (contrat STTSession) — hors coque native : session inerte à erreur explicite, jamais de repli fr ;
  - `translateBaouleToFrench` / `prepareBaouleParserInput` : garde B2-022, mapping `NllbError` → `BaouleEngineError` (messages français préservés) ;
  - `speakBaoule` : délègue `narrateResponse` (ne lève jamais, repli français hors chemin MMS) ;
  - `installBaouleTranslator` / `installBaouleVoice` : installations OPT-IN (réglages) ;
  - erreurs dédiées : `BaouleEngineError` (7 codes) + `describeBaouleEngineError`.
- Tests : `baoule-engine.test.ts` NOUVEAU 16 cas (sondes, initialize sans téléchargement — assertions `downloadNllbModel`/`downloadMmsBciVoice` non appelés —, session STT, garde, mapping erreurs, speak fr/bci/repli, installs).

**Points à vérifier par AGENT 2** :
1. La façade ne duplique RIEN : vérifier que voice-service/nllb-translation/mms-tts/conversation restent les sources de vérité (les suites existantes sont inchangées et vertes).
2. `initializeBaouleEngine` : aucun téléchargement (testé) — cohérent avec la règle opt-in mission.
3. Le mapping d'erreurs préserve les messages français (pattern Task 41).

**Prochaine action AGENT 1** : B5-051 — brancher stt-factory (bci → engine) + les 2 modales sur la façade, non-régression fr. Ensuite B5-052 (AGENT 2) : smoke APK.

---

## Passation n° 6 — 2026-09-19 : Confirmations bilingues + robustesse réseau (B4-041) livrées

```
Tâche         : B4-041
Statut        : CODE_TERMINÉ (582/582 · tsc 0 · lint 0 · build prod OK)
Progression   : 90 % (liste bci = PILOTE — validation natif B3-032 ; latence device avec B1-010)
Objectif      : REQ-B4b (oui/non baoulé) + REQ-B4c (interruption réseau explicite)
```

**Modifications** :
- `src/lib/voice/confirmations.ts` — NOUVEAU : `parseConfirmation` bilingue fr + baoulé. Liste **PILOTE** documentée dans le module : oui = ɛhɛ/ɛhè/ɔ/ɔɔ/o/oo/ehe ; non = ao/a o. Normalisation NFD + strip tons + apostrophes + ponctuation. Hors vocabulaire → null (ré-analyse comme nouvelle commande, comportement historique).
- `voice-modal.tsx` + `prod-voice-modal.tsx` — branches confirm migrées des regex 100 % fr vers `parseConfirmation`.
- `conversation.ts` — `fetchJsonWithTimeout` (10 s) : les fetch dépense/commande en pleine conversation ne peuvent plus rester suspendus ; échec explicite → file offline existante.
- Tests : `confirmations.test.ts` NOUVEAU (39 cas : fr, bci, accents, ponctuation, hors vocabulaire) + `conversation.test.ts` +4 (timeout réseau).

**Points à vérifier par AGENT 2** :
1. **Liste pilote bci** : les formes retenues (ɛhɛ = oui, ao = non) viennent des lexiques baoulé les plus courants — elles DOIVENT être confirmées/étendues par le locuteur natif en B3-032 (c'est le point d'entrée documenté du module).
2. « a o » (deux tokens) est testé AVANT « o » (oui) — l'ordre est significatif, testé.
3. Le fallback null conserve le comportement historique des 2 modales (marchand : re-parse dans le même tour ; producteur : idem).
4. `fetchJsonWithTimeout` : timeout → erreur explicite → `queuePendingSync` existant → narration « en attente de synchronisation ». Vérifier la cohérence avec la non-régression des 2 chemins métier (dépense, commande).

**Risques** : faux positifs « o » court (= oui) si l'ASR bci renvoie un « o » parasite en début de transcription —mitigé par l'ancrage (premier token uniquement) ; à surveiller au smoke appareil.

**Prochaine action AGENT 1** : B5-050 — `src/lib/voice/baoule-engine.ts` (contrat API unifié `initialize/isReady/transcribe/speak`, encapsule B1→B4, codes d'erreur dédiés). B4-042 (E2E mocks) côté AGENT 2 peut couvrir la chaîne complète orchestrée.

---

## Passation n° 5 — 2026-09-19 : Orchestrateur conversation bci→fr→IA→fr→bci (B4-040) livré

```
Tâche         : B4-040
Statut        : CODE_TERMINÉ (539/539 · tsc 0 · lint 0 · build prod OK + CSP inchangée)
Progression   : 90 % (E2E mocks = B4-042 ; smoke appareil regroupé avec B1-010)
Objectif      : la chaîne conversationnelle complète existe — dictée bci → trad fr →
                parseur/IA fr → réponse fr → trad bci → TTS bci
```

**Modifications** :
- `src/lib/voice/conversation.ts` — NOUVEAU nœud central :
  - `resolveConversationInput` (lien montant) : session fr → pass-through strict ; session bci → traduction **obligatoire** via `resolveParserInput` (garde B2-022 désormais branchée en production : échec traduction = chaîne arrêtée AVANT `parseIntent`, erreur typée affichée) ;
  - `narrateResponse` (lien descendant) : session fr → `tataSpeak` direct (dispatch synchrone inchangé) ; session bci → NLLB fra→bci puis `tataSpeak` avec le texte baoulé BRUT ; échec traduction → `tataSpeakWeb` (HORS chemin MMS : le français n'atteint jamais la voix akan) + `translationError` dans le résultat ; ne lève jamais ;
  - seams de test (`setConversationNllbForTests` / `resetConversationForTests`).
- `voice-modal.tsx` + `prod-voice-modal.tsx` : `handleTranscript` (transcript → orchestrateur → parseur) + 22 sites de narration migrés vers `narrateResponse` ; en cas d'échec de traduction montant : erreur explicite affichée + narrée, auto-close.
- `src/lib/voice/__tests__/conversation.test.ts` — NOUVEAU 13 cas (pass-through fr, garde B2-022 ×2, langue inconnue, routage bci, repli hors-MMS, non-levée, seams, reset).

**Décision d'architecture à valider par AGENT 2** :
1. En session bci, `intent.rawTranscript` porte la **traduction française** (pas le brut bci) : les correspondances catalogue (`findCatalogEntry`) et les descriptions synchronisées vers l'API sont françaises côté données. Implication : `voiceTranscript` des dépenses = traduction fr. Acceptable ? (alternative : conserver le brut bci dans un champ séparé — non fait pour éviter un nouveau champ de schéma).
2. Le repli descendant passe par `tataSpeakWeb` et non `tataSpeak` : en mode bci, `tataSpeak` donnerait le texte français au moteur MMS (phonèmes akan sur du français). `tataSpeakWeb` court-circuite le chemin MMS et signale la limite une fois/session — vérifier que ce comportement est bien couvert par les tests tata-tts existants.
3. Les confirmations oui/non en session bci passent par la traduction NLLB (le « oui » traduit matche généralement la regex fr existante) — patterns natifs baoulé (ɛhɛ…) = B4-041. Limitation assumée, documentée dans le module.

**Points à vérifier par AGENT 2** :
1. Zéro régression fr : 32 tests tata-tts verts + pass-through strict de `resolveConversationInput` en session fr (aucun appel traducteur).
2. Non-le chat : `narrateResponse` ne lève jamais (cas échec traduction testé) ; la conversation ne meurt jamais sur un maillon de narration.
3. B4-042 (E2E mocks) peut maintenant être écrit : scénario TEST_PLAN §3-B4 (dictée bci → vente confirmée → TTS bci) sur l'orchestrateur + modales.

**Risques** : latence NLLB sur appareil (2 traductions par tour de conversation — à mesurer, rejoint B2-021/B1-010) ; qualité traduction NLLB bci↔fr à valider par locuteur natif (rejoint B3-032).

**Prochaine action AGENT 1** : B4-041 — confirmations oui/non bilingues + robustesse réseau ; puis B5-050 (`baoule-engine.ts`, contrat API unifié).

---

## Passation n° 4 — 2026-09-19 : Moteur pilote TTS baoulé (B3-031) livré

```
Tâche         : B3-031
Statut        : CODE_TERMINÉ (526/526 · tsc 0 · lint 0 · build prod OK)
Progression   : 90 % (smoke sur appareil restant — rejoint B3-032)
Objectif      : première narration baoulé de la pile (moteur pilote, opt-in)
```

**Modifications** :
- `src/lib/voice/mms-tts.ts` — NOUVEAU : `downloadMmsBciVoice` (opt-in, cache pré-rempli avec clés HF exactes, tokenizer.json généré localement), `mmsBciSpeak` (normalisation bci → synthèse → lecture, timeout, jamais de téléchargement), `isMmsBciVoiceReady` (stricte), `removeMmsBciVoice`, `normalizeBciText`, `buildMmsTokenizerJson`
- `src/lib/voice/tata-tts.ts` — chemin bci en amont de `tataSpeak` (texte BRUT au MMS, jamais toSpeechText), repli français **inchangé** (extrait `dispatchFrenchNarration`, dispatch webspeech synchrone préservé), signal une fois si pilote indisponible ; `tataStop` + `mmsStop`, `unlockTataAudio` + `unlockMmsAudio` (langue bci seulement)
- `src/components/shared/bci-voice-card.tsx` — NOUVEAU carte réglages (marchand l.1264, producteur l.434), libellé honnête « pilote — qualité limitée »
- Tests : `mms-tts.test.ts` NOUVEAU (25 cas : normalisateur, tokenizer, gardes anti-téléchargement, download, synthèse, remove) + `tata-tts.test.ts` +6 cas (chemin bci, repli, zéro coût en fr)

**Points à vérifier par AGENT 2** :
1. La normalisation bci : ɛ/ɔ/'/ʼ préservés, tons retirés — cas limites (mots composés, chiffres 2/3 passent mais 0/1/4-9 filtrés par la whitelist tokenizer = silencieux, assumé pilote).
2. Le repli français est strictement inchangé (extraction `dispatchFrenchNarration`) : 32 tests tata-tts verts, dispatch synchrone webspeech préservé.
3. UI : la carte s'affiche seulement si `isMmsSupported()` (window+AudioContext+caches) — vérifier la cohérence visuelle avec les cartes Piper/Kokoro.

**Risques** : qualité voix = donor akan (attendue imparfaite pour du bci — c'est l'objet de B3-032) ; mémoire WebView avec 114 Mo WASM (comme Kokoro, à surveiller sur appareil) ; RTF WASM inconnu sur device (0,33 backend natif sandbox).

**Prochaine action AGENT 1** : B4-040 — orchestrateur conversation bci→fr→IA→fr→bci (les maillons B2 NLLB et B3 TTS sont prêts).

---

## Passation n° 3 — 2026-09-19 : Évaluation moteurs TTS Baoulé (B3-030) livrée

```
Tâche         : B3-030
Statut        : TERMINÉ (rapport + mesures réelles + échantillons)
Progression   : 100 %
Objectif      : évaluer les candidats TTS bci offline AVANT toute intégration (REQ-B3a)
```

**Livrables** :
- `.ai/EVAL_B3_TTS.md` — rapport complet (candidats, mesures, licences, pistes, replanification)
- `.ai/eval-b3/smoke-mms-akan.mjs` + `build_tokenizer_json.py` + `samples/*.wav` (4 WAV)

**Constats à retenir pour la suite QA** :
1. **Aucun TTS baoulé prêt à l'emploi n'existe** — le dépôt « bci-baseline » est un kit de fine-tuning (poids = donor akan). Toute attente d'un « modèle bci à brancher » est infondée.
2. Mesures réelles : port ONNX donor akan fp16 = **58 Mo** ; RTF 0,33 en CPU sandbox (4 WAV valides) ; latence device à mesurer (comme B2).
3. **Licence** : modèles MMS CC-BY-NC-4.0 → pilote uniquement. Production = Piper custom (B3-034) sur corpus Waxal CC-BY-4.0, ou accord Waxal/UNIMA.
4. Vocab donor = 30 chars sans diacritiques de tons → B3-031 doit livrer un **normalisateur orthographique bci** (à tester en priorité : strip de tons ne doit pas corrompre ɛ/ɔ/’ ni les montants).

**Points à vérifier par AGENT 2** : cohérence du registre (B3-031 redéfinie, B3-033/034 ajoutées), critères d'acceptation B3-031 dans TEST_PLAN §3-B3 (le normalisateur doit y être ajouté), aucune régression des suites voix à la prochaine intégration.

**Risques** : échantillons actuels = voix akan (plombage seulement — ne pas juger la qualité baoulé dessus) ; le « proxy » risque d'être jugé médiocre en B3-032 — c'est attendu et c'est l'objet de la comparaison.

**Prochaine action AGENT 1** : B3-031 — `src/lib/voice/mms-tts.ts` (pattern DADR-001) + normalisateur bci + branchement `tata-tts` + UI pilote.

---

## Passation n° 2 — 2026-09-18 : BUG-001 corrigé + module NLLB (B2) livré

```
Tâche         : BUG-001 + B2-020/021/022
Statut        : CODE_TERMINÉ (BUG-001 + B2-020 + B2-022 validés par AGENT 2)
Progression   : B2-021 à 90 % (latence → appareil)
Objectif      : débarrasser le gate lint puis livrer le cœur du pivot (traduction bci↔fra)
```

**Modifications** :
- `src/components/marchand/vente-rapide-modal.tsx` — refs d'indirection (BUG-001, commit `b0a95e1`)
- `src/lib/voice/nllb-translation.ts` — NOUVEAU : `translateText`, `resolveParserInput` (garde), `downloadNllbModel`, `isNllbModelReady`, `removeNllbModel`, `NllbError` (7 codes), `describeNllbError`
- `src/lib/voice/__tests__/nllb-translation.test.ts` — NOUVEAU : 21 cas
- `scripts/smoke-nllb.mjs` — NOUVEAU : mesure taille/latence réelle

**Tests effectués** : 501/501 verts · tsc 0 · eslint 0.

**Points à vérifier par AGENT 2** : cf. AGENT2_STATUS.md — garde d'architecture, jamais de téléchargement implicite, timeout, non-régression voix (12 suites).

**Risques** : 872 Mo en téléchargement opt-in (UI devra annoncer la taille + Wi-Fi) ; mémoire WebView à surveiller sur appareil (comme Kokoro) ; latence non mesurable en sandbox (OOM).

**Prochaine action AGENT 1** : B3-030 — rapport d'évaluation des moteurs TTS Baoulé offline (MMS-TTS, Piper custom…) AVANT toute intégration.

---

## Passation n° 1 — 2026-09-18 : Audit technique initial

```
Tâche         : AUDIT-003 — Audit technique du code
Statut        : TERMINÉ
Progression   : 100 %
Objectif      : Compréhension exhaustive de l'architecture avant toute modification
```

**Modifications** : AUCUNE (phase d'analyse — lecture seule, conforme au protocole).

**Résultats** : rapport complet intégré dans `.ai/ARCHITECTURE.md` (pipeline voix, IA Gemma locale, couche données, configs, duplication, code mort, risques).

**Tests effectués** : baseline validation — `bun run test` (480/480 verts) · `bunx tsc --noEmit` (0 erreur) · `bunx eslint .` (2 erreurs → BUG-001).

**Points à vérifier par AGENT 2** :
1. Confirmer le périmètre du référentiel TASKS.xlsx (existant + roadmap B1–B5 + normalisation + infra).
2. Prioriser les scénarios QA de TEST_PLAN §3 selon l'ordre B2 → B3 → B4 → B5.
3. Arbitrer avec l'Orchestrateur : NORM-301 (VoixSettings partagé) avant ou après la roadmap.

**Risques identifiés** :
- Le module NLLB (B2) est une dépendance WASM lourde : risque CSP (piège Task 41) et taille de téléchargement — tester en build de prod.
- Le sandbox a été réinitialisé 2 fois : tout artifact non committé peut disparaître — committer le pilotage.
- BUG-001 doit être corrigé avant le prochain build CI (gate lint échoue).

**Prochaine action AGENT 1** : BUG-001 puis B2 (`nllb-translation.ts`).
