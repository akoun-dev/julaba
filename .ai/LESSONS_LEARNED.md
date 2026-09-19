# LESSONS_LEARNED.md — Apprentissage des erreurs

*Rôle AGENT 2 / rétrospectives. Une leçon = un incident réel + la règle qui en découle.*

## L-001 — `bun test` ≠ `bun run test` (2026-09-19)
- **Fait** : `bun test` (runner natif Bun) produisait 172 faux échecs sur la suite vitest ; `bun run test` (vitest via package.json) = vert.
- **Règle** : la commande de test officielle du projet est **`bun run test`**, toujours. Documentée dans PROJECT_CONTEXT §3.

## L-002 — Pooler Supabase : la région compte (2026-09-19)
- **Fait** : `aws-0-*.pooler.supabase.com` renvoie XX000 « tenant or-orphan not found » ; le projet vit en `aws-1-eu-west-1`.
- **Règle** : connexions DB via `aws-1-eu-west-1.pooler.supabase.com:5432` uniquement ; scripts d'audit réutilisables (`/home/z/my-project/scripts/`).

## L-003 — Ne jamais fiabiliser un contrat sur un littéral recopié (Task 66)
- **Fait** : les codes TRANSFER_* manquants de `STOCK_ERROR_CODES` tombaient en 500 générique.
- **Règle** : le littéral exporté est verrouillé par un test transverse ; tout nouveau code d'erreur passe par la constante.

## L-004 — Un lockfile retiré du dépôt casse la CI npm (2026-09-19, AUDIT-001)
- **Fait** : NORM-303 (sortie de `package-lock.json`) a cassé `npm ci` **discrètement** — les gates locaux restaient verts, la CI n'a jamais été rejouée.
- **Règle (L-006)** : tout commit touchant `package.json`/`bun.lock`/workflows ⇒ re-jouer la CI ou son équivalent complet.

## L-005 — Les registres périm mentent par omission (2026-09-19, AUDIT-001)
- **Fait** : ARCHITECTURE.md/PROJECT_CONTEXT.md datés du 18/09 annonçaient 75 routes, 480 tests, 12 handlers — faits à chaque Task, jamais resynchronisés globalement.
- **Règle** : rituel de fin de Task = mise à jour des métriques des docs de pilotage + registres concernés (désormais point 3 du plan d'action AUDIT-001).

## L-006 — Voir L-004 (CI), citée par AUDIT-001 §6.

## L-007 — Valeur absolue calculée client = dette récurrente (2026-09-19)
- **Fait** : malgré STK-805 (D3) et la suppression UI (STK-811), un chemin vocal (restock) a survécu avec l'ancien pattern → BUG-002.
- **Règle** : quand une règle d'architecture est édictée, **chercher tous les sites historiques** (grep du pattern) avant de déclarer la règle appliquée.

## L-008 — Le statut BLOQUÉ assumé vaut mieux que le faux TERMINÉ
- **Fait** : NORM-305 (types DB nécessitant Docker) est documenté BLOQUÉ avec la procédure exacte — l'audit n'a trouvé aucun mensonge dans les registres.
- **Règle** : conserver ce standard d'intégrité ; un BLOQUÉ documenté est une décision, pas un échec.
