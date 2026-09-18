# AGENT 2 — État de travail (Chef de projet technique / QA)

```
AGENT ACTIF      : AGENT 2 (Chef de projet technique / QA)
TÂCHE            : TERM-002 — Référentiel initial des fonctionnalités + registre
SOUS-TÂCHE       : Inventaire fonctionnel, workflows, plan de tests
PROGRESSION      : 100 %
STATUT           : TERMINÉ
```

## Livrables produits

- Inventaire fonctionnel complet (écrans/routes par rôle, fonctionnalités implémentées/partielles) → intégré dans `.ai/PROJECT_CONTEXT.md` + `TASKS.xlsx`.
- 8 workflows métier documentés (`.ai/WORKFLOWS.md`) avec points d'impact roadmap.
- Plan de tests existants + scénarios QA B1→B5 (`.ai/TEST_PLAN.md`).
- Registre des bugs initié (BUG-001 détecté à la baseline — `vente-rapide-modal.tsx`, 2 erreurs lint introduites par `ce8aa12`).

## État de validation des fonctionnalités (vérification réelle, pas déclarative)

| Périmètre | Preuve | Niveau |
|-----------|--------|--------|
| 33 suites vitest | `bun run test` → 480/480 verts (exécuté 2026-09-18) | Validé (unitaire) |
| Types | `bunx tsc --noEmit` → 0 erreur (exécuté 2026-09-18) | Validé |
| Lint | `bunx eslint .` → 2 erreurs (BUG-001) | ÉCHEC_TEST → correction demandée |
| Workflows WF1–WF8 | Conformes à l'état livré (lecture code + docs) | Validé (statique — E2E appareil réel non possible en sandbox) |
| B1 ASR Baoulé | Embarqué et routé, mais jamais mesuré sur téléphone réel | PARTIEL — validation terrain requise (action utilisateur) |

## Prochaine action

- Scénarios de test B2 prêts à exécuter dès que AGENT 1 livre le module NLLB (TEST_PLAN §3-B2 : garde « parseIntent ne reçoit jamais de bci brut », contrat vocab agricole/commerce, timeout explicite).
- Surveiller : tout changement de `stt-factory.ts`/`tata-tts.ts` → rejouer les 12 suites voix + vérifier non-régression française.
