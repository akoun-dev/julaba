# COMMIT_LOG.md — Journal des commits (conventions & intégrité)

*Rôle AGENT COMMIT. Format conventionnel : `type(scope): description`. Types utilisés : feat, fix, refactor, docs, test, chore.*

## État à AUDIT-001 (2026-09-19)

- **HEAD local = origin/main** : `0f71025` — aucune divergence, tout poussé
- **Conformité conventionnels : 100 %** (échantillon des 15 derniers commits)
- **Atomicité : conforme** — 1 commit = 1 intention vérifiable

## Derniers commits (extrait)

| Commit | Message | Audit |
|---|---|---|
| `0f71025` | fix(docs): commentaire admin.ts — '*/' parasite fermait le bloc JSDoc | ✅ |
| `be0948d` | docs: registres à jour — NORM-301/303/304 TERMINÉ, NORM-305 BLOQUÉ | ✅ |
| `6675cb3` | refactor(design): jetons de couleur partagés + formatFCFA source unique (NORM-304) | ✅ |
| `75a07e1` | chore(deps): bun.lock source de vérité, package-lock sorti (NORM-303) | ✅ — ⚠️ a cassé la CI npm sans le savoir → COR-001 |
| `27ce3da` | refactor(ui): VoixSettings partagé marchand/producteur (NORM-301) | ✅ |
| `eca2baf` | fix(api): corriger les paramètres par défaut des RPC de stock (commit externe utilisateur) | ✅ réintégré par rebase Task 66 |
| `bea5f16` | feat(stock): écran transferts inter-marchands + annuaire (STK-815) | ✅ |
| `b660e9a` | test(stock): pgTAP 108 + checklist 25/25 (STK-812) | ✅ |

## Rituels commit

1. Gates locaux AVANT commit : `bun run test` (vitest — JAMAIS `bun test` brut) + `tsc --noEmit` + `eslint .` (+ build si impact build)
2. `git fetch origin` avant push (sessions concurrentes — déjà arrivé : `eca2baf`)
3. Message français, scope métier, référence ticket (STK-xxx/NORM-xxx/BUG-xxx)
4. **Nouveau (L-006)** : tout commit touchant `package.json`/`bun.lock`/CI ⇒ vérifier le run CI GitHub

## Prochain commit prévu

Registres AUDIT-001 + COR-001 (CI Bun) + resync docs + TASKS.xlsx — Task 67.
