# HANDOFF AGENT 1 → AGENT 2

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
