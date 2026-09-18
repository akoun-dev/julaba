# TASKS.md — Miroir lisible du registre (source de vérité = `TASKS.xlsx`)

*Mis à jour le 2026-09-19 (session Task 53) · 41 tâches · statuts : BACKLOG / A_FAIRE / EN_COURS / BLOQUÉ / EN_TEST / ÉCHEC_TEST / CORRECTION / VALIDATION / TERMINÉ / REOUVERT*

## Synthèse

| État | Nombre | Détail |
|------|--------|--------|
| Terminées | 20 | Analyse (2) + existantes (10) + B2-020/B2-022 + BUG-001 + B3-030 + NORM-302 + DOC-306 + B4-042 + VOCAL-601 (audit) |
| En validation | 6 | B2-021 (90 %) + B3-031 (90 %) + B4-040 (90 %) + B4-041 (90 %) + B5-050 (90 %) + B5-051 (90 % — smoke APK B5-052) |
| À faire | 5 | Infra (INF-401) + corrections audit vocal vente rapide (VOCAL-602/603 P0 · 604 P1 · 605 P2) |
| Backlog | 6 | NORM-301/303/304/305 + B3-033/034 (décisions utilisateur) |
| Bloquées | 3 | B1-010 benchmark + B5-052 smoke APK (appareil requis) + SEC-402 PAT (action utilisateur) |

## 1. Analyse & pilotage — TERMINÉ

- **ANA-001** Analyse complète du projet (audit + inventaire) — 100 % — baseline : 480/480 tests · tsc 0 · lint 2 erreurs (BUG-001)
- **ANA-002** Système de pilotage `.ai/` + registre — 100 %

## 2. Fonctionnalités existantes — TERMINÉ (référentiel)

| ID | Fonctionnalité | Preuve |
|----|----------------|--------|
| EX-001 | Auth multi-comptes (4 rôles, PIN/schéma/visuel/biométrie, session↔appareil) | tests verts |
| EX-002 | Ventes & caisse (vente vocale confirmée `quick-sale.ts`) | ce8aa12 + BUG-001 lint en cours |
| EX-003 | Synchro offline (file FIFO + 12 handlers + conflits BO) | conforme docs/OFFLINE.md |
| EX-004 | Backoffice RBAC 24+ modules | tests verts |
| EX-005 | Enrôlement (wizard 5 étapes, OCR CNI, JID-XXXX) | tests verts |
| EX-006 | Notifications (in-app/push/locales) | 9 suites vertes |
| EX-007 | Vision/OCR CNI | document-ocr tests |
| EX-008 | Pipeline voix FR complet (STT+NLU+TTS 4 moteurs+wake-word) | 12 suites voix |
| EX-009 | Sélecteur langue fr/baoulé (réglages marchand+producteur) | bfec4f8 |
| EX-010 | IA locale Gemma (navigation) + NLU 2 niveaux | tests verts |

## 3. Roadmap « Baoulé phase pilote » — demande active

> Architecture cible : ENTRÉE ASR bci → **NLLB** → Français → **IA Tata Nanti Lou** → **NLLB** → TTS bci → SORTIE. Valider chaque chaîne indépendamment.

| ID | Sous-tâche | Agent | Statut | Prog. | Prio | Dépendance |
|----|-----------|-------|--------|-------|------|------------|
| B1-010 | Benchmark ASR Omnilingual sur téléphone réel (CER/WER, RTF/RAM → docs/BENCHMARK.md) | USER | BLOQUÉ (appareil requis) | 90 % | P1 | — |
| B2-020 | Module `nllb-translation.ts` (bci↔fra, erreurs typées ×7) | AGENT 1 | **TERMINÉ** | 100 % | P1 | — |
| B2-021 | Modèle ONNX opt-in — **872 Mo mesurés (q8 optimal)** | AGENT 1 | VALIDATION | 90 % | P1 | B2-020 |
| B2-022 | Tests contrat + **garde « parseIntent jamais bci brut »** (21 cas verts) | AGENT 2 | **TERMINÉ** | 100 % | P1 | B2-020/021 |
| B3-030 | Évaluation moteurs TTS bci offline — **rapport livré : aucun TTS bci prêt à l'emploi ; corpus Waxal bci_tts CC-BY-4.0 disponible ; port donor akan mesuré (fp16 58 Mo, RTF 0,33)** | AGENT 1 | **TERMINÉ** | 100 % | P1 | — |
| B3-031 | Moteur pilote `mms-tts.ts` (proxy akan, 114 Mo) + **normalisateur orthographique bci** + branchement `tata-tts` + carte UI — **526/526 · tsc 0 · lint 0 · build prod OK** | AGENT 1 | VALIDATION | 90 % | P1 | B3-030 |
| B3-032 | Validation comparative locuteur natif (proxy vs fine-tune vs Piper) | USER+AGENT 2 | A_FAIRE | 0 % | P2 | B3-031 |
| B3-033 | Fine-tune VITS bci sur Waxal `bci_tts` (GPU hors sandbox — **décision utilisateur**) | USER+AGENT 1 | BACKLOG | 0 % | P2 | B3-031 |
| B3-034 | Voix Piper bci production (corpus CC-BY-4.0 — licence libre) | USER+AGENT 1 | BACKLOG | 0 % | P2 | B3-032 |
| B4-040 | Orchestrateur conversation bci→fr→IA→fr→bci — **conversation.ts livré : garde B2-022 branchée en prod + narrateResponse fra→bci + 2 modales câblées · 539/539 · tsc 0 · lint 0 · build prod OK** | AGENT 1 | VALIDATION | 90 % | P2 | B2-020, B3-031 |
| B4-041 | Confirmations oui/non bilingues + robustesse réseau — **confirmations.ts (fr + bci pilote ɛhɛ/ao) dans les 2 modales + fetchJsonWithTimeout 10 s · 582/582 · tsc 0 · lint 0 · build prod OK** | AGENT 1 | VALIDATION | 90 % | P2 | B4-040 |
| B4-042 | Tests E2E chaîne (mocks) — **baoule-chain-e2e.test.ts : 5 scénarios (tour complet bci, garde bout en bout, repli, non-régression fr) · AGENT 2 VALIDÉ · suite 603/603** | AGENT 2 | **TERMINÉ** | 100 % | P2 | B4-040/041 |
| B5-050 | Créer `src/lib/voice/baoule-engine.ts` (contrat API) — **façade B1→B4 livrée : status/initialize (jamais de téléchargement), transcribe (STT offline), prepareParserInput (garde B2-022), speak (jamais lève), installs opt-in · 16 tests · 598/598 · tsc 0 · lint 0 · build prod OK** | AGENT 1 | VALIDATION | 90 % | P2 | B2+B3+B4 |
| B5-051 | Branchement stt-factory + modales (non-régression fr) — **stt-factory route bci via la façade + 2 modales migrées (prepareBaouleParserInput/speakBaoule) · 598/598 · tsc 0 · lint 0 · build prod OK** | AGENT 1 | VALIDATION | 90 % | P2 | B5-050 |
| B5-052 | Tests contrat + smoke APK — contrat COUVERT (16+5 tests validés AGENT 2) ; smoke APK = **BLOQUÉ (appareil requis)**, regroupé B1-010/B2-021/B3-031/B3-032 | AGENT 2 | BLOQUÉ | 90 % | P2 | B5-051 |

> **B2 livré (2026-09-18)** : module + 21 tests + taille réelle 872 Mo (q8 optimal) + garde `resolveParserInput`. Latence réelle à mesurer sur appareil (RAM sandbox insuffisante).
>
> **B3-030 livré (2026-09-19)** : rapport `.ai/EVAL_B3_TTS.md` + smoke réel (4 WAV valides, RTF 0,33 sandbox). Constat clé : la voix baoulé réelle exige un **entraînement** (B3-033 GPU / B3-034 Piper) — B3-031 livre le **moteur** sur checkpoint provisoire akan (licite en pilote, CC-BY-NC). Licences : corpus CC-BY-4.0 ✅ · modèles MMS CC-BY-NC ❌ production.
>
> **B3-031 livré (2026-09-19)** : `mms-tts.ts` (opt-in, cache pré-rempli clés HF exactes, tokenizer.json généré, timeout) + `normalizeBciText` (tons retirés, ɛ/ɔ/'/ʼ gardés) + chemin bci dans `tataSpeak` (texte BRUT, repli fr inchangé + signal) + `BciVoiceCard` dans les 2 réglages. 526/526 · tsc 0 · lint 0 · build prod OK. Restant : smoke sur appareil (rejoint B3-032).
>
> **B4-040 livré (2026-09-19)** : orchestrateur `src/lib/voice/conversation.ts` — lien montant `resolveConversationInput` (bci→fr OBLIGATOIRE via `resolveParserInput`, la garde B2-022 est désormais branchée en production : un échec traduction arrête la chaîne AVANT `parseIntent`) ; lien descendant `narrateResponse` (réponse fr → NLLB fra→bci → `tataSpeak` texte BRUT ; échec → `tataSpeakWeb` HORS chemin MMS — le français n'atteint jamais la voix akan — + `translationError` explicite). Câblé dans les 2 modales (marchand + producteur) : `handleTranscript` + 22 sites de narration. Session fr : pass-through strict (zéro régression). 13 tests contrat · 539/539 · tsc 0 · lint 0 · build prod OK. Limites honnêtes : confirmations oui/non bci passent par la traduction (patterns natifs ɛhɛ = B4-041) ; affichage UI reste français.
>
> **B4-041 livré (2026-09-19)** : `src/lib/voice/confirmations.ts` — `parseConfirmation` bilingue fr + baoulé (**liste PILOTE** : ɛhɛ/ɛhè/ɔ/o/ehe = oui ; ao = non — à confirmer par locuteur natif, B3-032), normalisation NFD strip-tons + apostrophes unifiées, hors vocabulaire → ré-analyse comme nouvelle commande (comportement historique). Branché dans les 2 modales. Robustesse réseau (REQ-B4c) : `fetchJsonWithTimeout` (10 s) sur les fetch dépense/commande en pleine conversation — plus de fetch suspendu, échec explicite → file offline (« en attente de synchronisation »). 39 tests confirmations + 17 conversation · **582/582 (37 fichiers)** · tsc 0 · lint 0 · build prod OK.
>
> **B5-050 livré (2026-09-19)** : façade `src/lib/voice/baoule-engine.ts` encapsulant B1→B4 — `getBaouleEngineStatus`/`isBaouleEngineReady` (sonde sans effet de bord), `initializeBaouleEngine` (charge le STT natif bci, **ne télécharge jamais**, état exact des maillons manquants), `createBaouleTranscriptionSession` (STT offline natif, session inerte explicite hors coque), `translateBaouleToFrench`/`prepareBaouleParserInput` (garde B2-022, mapping NllbError → `BaouleEngineError` 7 codes), `speakBaoule` (ne lève jamais, repli français hors MMS), `installBaouleTranslator`/`installBaouleVoice` (opt-in explicite). Façade pure : chaque maillon reste dans son module d'origine (source de vérité unique). 16 tests contrat · **598/598 (38 fichiers)** · tsc 0 · lint 0 · build prod OK. Restant : branchement (B5-051) + smoke APK (B5-052).
>
> **B5-051 livré (2026-09-19)** : branchement de la façade — `stt-factory` route le bci via `createBaouleTranscriptionSession` (délégation VoiceService, comportement identique) ; les 2 modales migrent vers la façade (`prepareBaouleParserInput`/`speakBaoule`/`describeBaouleEngineError`, `fetchJsonWithTimeout` ré-exporté) — **BaouleVoiceEngine est désormais l'entrée UNIQUE de la chaîne baoulé côté UI**. Non-régression fr : route fr de stt-factory inchangée, 32 tests tata-tts verts. 598/598 · tsc 0 · lint 0 · build prod OK. Restant : smoke APK (B5-052, AGENT 2) + E2E (B4-042).
>
> **NORM-302 livré (2026-09-19)** : code mort supprimé après vérification 0 importeur — `src/lib/supabase/browser.ts`, `src/components/identificateur/ident-top-bar.tsx`, `db/custom.db` (vestige Prisma), `examples/websocket/`, dépendance `z-ai-web-dev-sdk` (package.json + bun.lock synchronisés). 598/598 · tsc 0 · lint 0 · build prod OK · CSP intacte.
>
> **DOC-306 livré (2026-09-19)** : AGENTS.md aligné sur la réalité — 10 stores nommés, pipeline voix réel (STT natif VoiceService sherpa FR + Omnilingual bci via stt-factory ; TTS tata-tts + Piper/Kokoro opt-in + voix MMS bci pilote ; NLLB + façade BaouleVoiceEngine ; Web Speech = repli web fr), arborescence voice/ détaillée. Doc seule : zéro impact runtime.
>
> **B4-042 validé (2026-09-19, AGENT 2)** : `baoule-chain-e2e.test.ts` — 5 scénarios E2E mocks couvrant TEST_PLAN §3-B4 (tour complet STT bci → trad fr → intent vente → confirmation ɛhɛ/ao → NLLB fra→bci → TTS bci ; garde de bout en bout ; repli explicite hors MMS ; non-régression fr). Verdicts registre : B4-042 → TERMINÉ 100 % ; B5-052 → BLOQUÉ (appareil requis, contrat couvert) ; B2-021/B3-031/B4-040/B4-041/B5-050/B5-051 restent VALIDATION 90 % en attendant les sessions terrain. **La roadmap « Baoulé phase pilote » est intégralement livrée côté agents** — tout ce qui reste exige un appareil ou une décision utilisateur.

## 4. Corrections & normalisation

| ID | Tâche | Statut | Prio |
|----|-------|--------|------|
| BUG-001 | 2 erreurs eslint `react-hooks/immutability` — corrigées via refs d'indirection + useEffect (b0a95e1), lint 0 | **TERMINÉ** | P2 |
| NORM-301 | Extraire `VoixSettings` partagé (marchand/producteur, ~200 lignes dupliquées) | BACKLOG (arbitrage) | P3 |
| NORM-302 | Supprimer code mort (browser.ts, ident-top-bar, db/custom.db, examples, dep z-ai) — **supprimé et vérifié : 0 importeur, dep retirée + bun.lock synchronisé · 598/598 · tsc 0 · lint 0 · build prod OK** | **TERMINÉ** | P3 |
| NORM-303 | Trancher lockfile unique (bun.lock vs package-lock.json) | BACKLOG | P3 |
| NORM-304 | Centraliser PROD_COLOR / formatFCFA / préférence TTS dans Zustand | BACKLOG | P4 |
| NORM-305 | Retyper `admin.ts` (regen types Supabase) | BACKLOG | P4 |
| DOC-306 | Mettre à jour AGENTS.md (10 stores, pipeline voix réel) — **aligné : 10 stores nommés, pipeline voix réel (STT natif + façade BaouleVoiceEngine + NLLB + voix MMS), arborescence voice/ détaillée** | **TERMINÉ** | P3 |

## 5. Infrastructure & sécurité

| ID | Tâche | Statut | Prio |
|----|-------|--------|------|
| INF-401 | Déployer prod Vercel puis régénérer APK sans `CAPACITOR_SERVER_URL` | A_FAIRE | P2 |
| SEC-402 | **Révoquer le PAT GitHub exposé `ghp_EUGEmf…`** | BLOQUÉ (action utilisateur) | **P0** |

## 6. Audit vocal vente rapide (2026-09-19 — retour utilisateur « il casse »)

Rapport : `.ai/AUDIT_VOCAL_VENTE_RAPIDE.md` — audit statique du parcours vocal `VenteRapideModal`, qui n'a jamais été migré vers la chaîne STT multi-moteurs (VoiceService/Sherpa/Baoulé) et rate les durcissements réseau des Tasks 32-49.

| ID | Tâche | Statut | Prio |
|----|-------|--------|------|
| VOCAL-601 | Audit complet : 2 P0 + 4 P1 + 4 P2, preuves fichier:ligne, scénarios chiffrés, critères d'acceptation | **TERMINÉ** | P1 |
| VOCAL-602 | Factory STT dans la vente rapide (porte `canAttemptSTT`, session hybride sync-web/async-natif, watchdog 12-15 s, abort avant recréation) — corrige le spinner infini « J'écoute... » sur APK | A_FAIRE | **P0** |
| VOCAL-603 | Montant dicté = vérité (fin de l'override `priceUnit` qui enregistre « tomates 2000 » au prix du stock ; « X à Y » = qty × prix unitaire) | A_FAIRE | **P0** |
| VOCAL-604 | Race wake-word (listener de fond relancé pendant la modale) + `fetchJsonWithTimeout` + stock après verdict + `synced` annoncé | A_FAIRE | P1 |
| VOCAL-605 | Intents non métier (oui vide, stop → fermer, navigation/consultation réels) + confirmation robuste + hygiène | A_FAIRE | P2 |

## Ordre d'exécution (boucle autonome — mis à jour Task 53)

1. ~~BUG-001~~ ✅ → 2. ~~B2 NLLB~~ ✅ → 3. ~~B3 (éval + moteur pilote)~~ ✅ → 4. ~~B4 (chaîne bci→fr→IA→fr→bci)~~ ✅ → 5. ~~B5 (BaouleVoiceEngine)~~ ✅ → 6. ~~NORM-302 + DOC-306~~ ✅ → 7. ~~VOCAL-601 audit vocal vente rapide~~ ✅ (`.ai/AUDIT_VOCAL_VENTE_RAPIDE.md`) → **8. VOCAL-602 + VOCAL-603 (P0 — factory STT + montant dicté)** → 9. VOCAL-604 → 10. VOCAL-605 ; B3-032 (écoute comparative), B3-033/B3-034 (entraînements GPU) attendent des décisions/utilisateur ; smoke device (B1-010/B5-052 + confirmation P0-1 audit) attend l'appareil ; SEC-402 PAT (P0) attend l'utilisateur.
