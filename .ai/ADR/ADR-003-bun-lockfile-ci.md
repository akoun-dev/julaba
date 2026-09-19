# ADR-003 — Bun runtime officiel ; bun.lock unique en source de vérité ; CI Bun

- **Statut** : ACCEPTÉ (NORM-303, corrigé COR-001 à AUDIT-001)
- **Date** : 2026-09-19
- **Décideurs** : AGENT 1 + AGENT 2 ; DEVOPS pour la CI
- **Contexte** : double lockfile (`bun.lock` + `package-lock.json`) divergents ; le runtime réel (install, serve standalone, PM2 sandbox) est Bun ; la CI GitHub était encore Node/npm et dépendait d'un lockfile npm devenu interdit.
- **Options rejetées** : maintenir les deux lockfiles (dérive garantie, déjà constatée) ; passer tout le projet sous Node/npm (perte du runtime éprouvé en sandbox, revalider tous les scripts) ; CI sans lockfile (non-reproductibilité).
- **Décision** :
  1. `bun.lock` = **seule** source de vérité des dépendances ; `package-lock.json` sorti du dépôt et gitignore.
  2. CI GitHub Actions : `oven-sh/setup-bun@v2` + `bun install --frozen-lockfile` + `bun run lint` / `typecheck` / `test` (COR-001).
  3. Commande de tests officielle : **`bun run test`** (vitest) — jamais `bun test` brut (L-001).
- **Conséquences** : + install reproductible et CI alignée sur le runtime ; − tout contributeur npm-only doit utiliser Bun ; tout commit touchant les deps doit être validé par un run CI (L-004/L-006).
- **Preuves** : commit `75a07e1` (NORM-303), `.github/workflows/ci.yml` (COR-001), docs/CAPACITOR.md, LESSONS_LEARNED L-001/L-004.
