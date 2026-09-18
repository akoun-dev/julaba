# AGENT 2 — État de travail (Chef de projet technique / QA)

```
AGENT ACTIF      : AGENT 2 (Chef de projet technique / QA)
TÂCHE            : Validation BUG-001 + B2 (module NLLB)
SOUS-TÂCHE       : Exécution gates + revue des tests de garde
PROGRESSION      : 100 %
STATUT           : BUG-001 VALIDÉ · B2-020 VALIDÉ · B2-022 VALIDÉ · B2-021 EN_VALIDATION (device)
```

## Validations effectuées (2026-09-18)

| Vérification | Méthode | Résultat |
|--------------|---------|----------|
| BUG-001 corrigé | `bunx eslint .` + suite complète | 0 erreur lint · 480/480 → VALIDÉ |
| Contrat B2 | `nllb-translation.test.ts` (21 cas : paires invalides, vide, NOT_READY sans téléchargement implicite, timeout, EMPTY_OUTPUT, ENGINE_ERROR, removeNllbModel ciblé, réutilisation instance) | 21/21 → VALIDÉ |
| **Garde d'architecture** | `resolveParserInput` : `fr` passthrough sans pipeline · `bci` traduit obligatoirement · `bci` sans traducteur → lève `NLLB_NOT_READY` (jamais de bci brut) | VALIDÉ |
| Types / lint | `tsc --noEmit` / `eslint .` | 0 / 0 |
| Suite complète | `bun run test` | **501/501 (34 fichiers)** |
| Taille modèle | API HF + curl content-length | 872 Mo (q8 optimal) — documenté |
| Latence réelle | Impossible en sandbox (OOM ~2,3 Go) | À exécuter sur appareil (`scripts/smoke-nllb.mjs`) |

## Remontées AGENT 2

1. B2-021 reste à 90 % : la **latence sur appareil** et la **qualité réelle fra→bci** (vocabulaire métier) restent à mesurer — l'UI de réglages devra annoncer ~872 Mo et recommander le Wi-Fi.
2. Lors du branchement B4, ajouter un test d'intégration « transcript bci → `resolveParserInput` → `parseIntent` » pour verrouiller la garde de bout en bout.
3. Non-régression vérifiée : les 12 suites voix existantes restent vertes.

## Prochaine action

- Préparer les scénarios de test B3 (checklist compréhensibilité, opt-in, cache offline) — TEST_PLAN §3-B3.
- Valider le rapport d'évaluation des moteurs TTS bci que livrera AGENT 1 (B3-030) AVANT toute intégration.
