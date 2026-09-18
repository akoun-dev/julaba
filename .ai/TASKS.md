# TASKS.md — Miroir lisible du registre (source de vérité = `TASKS.xlsx`)

*Mis à jour le 2026-09-18 (session Task 43) · 34 tâches · statuts : BACKLOG / A_FAIRE / EN_COURS / BLOQUÉ / EN_TEST / ÉCHEC_TEST / CORRECTION / VALIDATION / TERMINÉ / REOUVERT*

## Synthèse

| État | Nombre | Détail |
|------|--------|--------|
| Terminées | 17 | Analyse (2) + existantes (11) + BUG-001 + B2-020/B2-022 |
| En validation | 1 | B2-021 (90 % — latence à mesurer sur appareil) |
| À faire | 12 | Roadmap B3–B5 (8) + normalisation (4) + infra (1) |
| Bloquées | 2 | B1 benchmark terrain (appareil requis) + SEC-402 PAT (action utilisateur) |

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
| B3-030 | Évaluation moteurs TTS bci offline (rapport avant intégration) ← **PROCHAINE** | AGENT 1 | A_FAIRE | 0 % | P1 | — |
| B3-031 | Intégration `tata-tts` (remplace signal `notifyBciNarrationLimitOnce`) | AGENT 1 | A_FAIRE | 0 % | P1 | B3-030 |
| B3-032 | Validation compréhensibilité locuteur natif | USER+AGENT 2 | A_FAIRE | 0 % | P2 | B3-031 |
| B4-040 | Orchestrateur conversation bci→fr→IA→fr→bci | AGENT 1 | A_FAIRE | 0 % | P2 | B2-020, B3-031 |
| B4-041 | Confirmations oui/non bilingues + robustesse réseau | AGENT 1 | A_FAIRE | 0 % | P2 | B4-040 |
| B4-042 | Tests E2E chaîne (mocks) | AGENT 2 | A_FAIRE | 0 % | P2 | B4-040/041 |
| B5-050 | Créer `src/lib/voice/baoule-engine.ts` (contrat API) | AGENT 1 | A_FAIRE | 0 % | P2 | B2+B3+B4 |
| B5-051 | Branchement stt-factory + modales (non-régression fr) | AGENT 1 | A_FAIRE | 0 % | P2 | B5-050 |
| B5-052 | Tests contrat + smoke APK | AGENT 2 | A_FAIRE | 0 % | P2 | B5-051 |

> **B2 livré (2026-09-18)** : module + 21 tests + taille réelle 872 Mo (q8 optimal) + garde `resolveParserInput`. Latence réelle à mesurer sur appareil (RAM sandbox insuffisante).

## 4. Corrections & normalisation

| ID | Tâche | Statut | Prio |
|----|-------|--------|------|
| BUG-001 | 2 erreurs eslint `react-hooks/immutability` (`vente-rapide-modal.tsx`, introduites par ce8aa12) | A_FAIRE | P2 |
| NORM-301 | Extraire `VoixSettings` partagé (marchand/producteur, ~200 lignes dupliquées) | BACKLOG (arbitrage) | P3 |
| NORM-302 | Supprimer code mort (browser.ts, ident-top-bar, db/custom.db, examples, dep z-ai) | A_FAIRE | P3 |
| NORM-303 | Trancher lockfile unique (bun.lock vs package-lock.json) | BACKLOG | P3 |
| NORM-304 | Centraliser PROD_COLOR / formatFCFA / préférence TTS dans Zustand | BACKLOG | P4 |
| NORM-305 | Retyper `admin.ts` (regen types Supabase) | BACKLOG | P4 |
| DOC-306 | Mettre à jour AGENTS.md (10 stores, pipeline voix réel) | A_FAIRE | P3 |

## 5. Infrastructure & sécurité

| ID | Tâche | Statut | Prio |
|----|-------|--------|------|
| INF-401 | Déployer prod Vercel puis régénérer APK sans `CAPACITOR_SERVER_URL` | A_FAIRE | P2 |
| SEC-402 | **Révoquer le PAT GitHub exposé `ghp_EUGEmf…`** | BLOQUÉ (action utilisateur) | **P0** |

## Ordre d'exécution proposé (boucle autonome)

1. **BUG-001** (débarrasse le gate lint) → 2. **B2** (NLLB, cœur du pivot) → 3. **B3** (TTS bci) → 4. **B4** (chaîne) → 5. **B5** (BaouleVoiceEngine) → normalisation au fil de l'eau ; B1-032/B1 benchmark et SEC-402 attendent l'utilisateur.
