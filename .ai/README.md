# .ai/ — Dossier de pilotage multi-agents du projet Jùlaba

> Créé le 2026-09-18 par l'Orchestrateur du système multi-agents, après analyse complète du dépôt.
> Ce dossier est la source de vérité du pilotage. Il ne contient AUCUN code applicatif.

## Rôles

| Rôle | Responsabilité |
|------|----------------|
| **Orchestrateur** | Coordination AGENT 1 / AGENT 2, arbitrage priorités, commits/push, worklog global |
| **AGENT 1 — Développement / Architecture** | Audit, refactoring, normalisation, features, corrections de bugs. Peut déclarer `CODE_TERMINÉ`, jamais `FONCTIONNALITÉ_VALIDÉE` |
| **AGENT 2 — Chef de projet technique / QA** | Registre des tâches (TASKS.xlsx), plan de tests, exécution des tests, validation/invalidation, détection de bugs |

## Cartographie des fichiers

| Fichier | Rôle |
|---------|------|
| `PROJECT_CONTEXT.md` | But du projet, utilisateurs, rôles, contraintes de mission, état courant |
| `ARCHITECTURE.md` | Architecture technique réelle (voix, IA, données, native, configs) |
| `REQUIREMENTS.md` | Exigences fonctionnelles + roadmap multilingue « Baoulé phase pilote » |
| `TASKS.xlsx` | **REGISTRE CENTRAL** de l'avancement (source de vérité) |
| `TASKS.md` | Miroir lisible (markdown) du registre — regénéré à chaque mise à jour |
| `AGENT1_STATUS.md` | État de travail temps-réel de AGENT 1 |
| `AGENT2_STATUS.md` | État de travail temps-réel de AGENT 2 |
| `TEST_PLAN.md` | Plan de tests (existants + scénarios roadmap) |
| `WORKFLOWS.md` | Workflows métier de bout en bout à préserver |
| `BUGS.md` | Registre des bugs (BUG-XXX) |
| `REGRESSIONS.md` | Registre des régressions détectées/corrigées |
| `CHANGELOG.md` | Journal des changements livrés |
| `HANDOFF/AGENT1_TO_AGENT2.md` | Passation : code terminé → à valider |
| `HANDOFF/AGENT2_TO_AGENT1.md` | Passation : bug/consigne → à corriger |

## Règles d'or (rappel du protocole)

1. **Analyser avant de modifier.** Aucun fichier source modifié sans avoir été compris.
2. **Réutiliser avant de créer.** Toute duplication nouvelle doit être justifiée par écrit.
3. **CRUD centralisé** : les composants ne parlent jamais à Supabase directement (état actuel conforme : 100 % des appels sont côté serveur, via routes `/api/*` + file offline).
4. **Validation** = code + tests + comportement. Un test vert seul ne valide pas une fonctionnalité.
5. **Progression honnête** dans TASKS.xlsx : interdiction de déclarer 100 % sans test + validation AGENT 2.
6. **Statuts autorisés** : `BACKLOG, ANALYSE, A_FAIRE, EN_COURS, BLOQUÉ, EN_TEST, ÉCHEC_TEST, CORRECTION, VALIDATION, TERMINÉ, REOUVERT`.
7. **Commandes de validation réelles** (ne jamais inventer) : `bun run test` (vitest), `bunx tsc --noEmit`, `bunx eslint .`, `bun run build`, `bun run test:rls` (pgTAP, nécessite Supabase local).

## Historique avant ce dossier

L'historique des tâches antérieures (Tasks 1–41 : Identificateur, Backoffice 24 modules, migration Prisma→Supabase, voix offline Sherpa/Omnilingual/Kokoro/Piper/Gemma, APK, fix CSP `6c3f77d`…) vit dans `worklog.md` à la racine du dépôt (versionné). Ce dossier `.ai/` prend le relais pour le pilotage structuré à partir du 2026-09-18.
