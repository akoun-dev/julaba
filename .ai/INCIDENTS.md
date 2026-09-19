# INCIDENTS.md — Journal des incidents

*Un incident = tout événement ayant perturbé le flux de livraison ou l'intégrité attendue du projet.*

## INCIDENT-001 — Push rejeté (sessions concurrentes) — 2026-09-19, Task 66
- **Fait** : push rejeté — commit externe `eca2baf` (fix RPC, poussé par l'utilisateur pendant la session) ; zéro chevauchement de fichiers.
- **Résolution** : `git fetch` + rebase propre → push OK. Aucune perte.
- **Mesure préventive (déjà en place)** : fetch préalable systématique avant push (PROJECT_CONTEXT §4.5).

## INCIDENT-002 — CI GitHub silencieusement cassée — 2026-09-19, AUDIT-001 (COH-001)
- **Fait** : depuis NORM-303 (`75a07e1`), `npm ci` n'a plus de lockfile à consommer → la CI échouait à chaque push potentiel ; personne ne l'a constatée car aucun run n'a été vérifié.
- **Résolution** : COR-001 — workflow basculé Bun (`oven-sh/setup-bun@v2`, `bun install --frozen-lockfile`, `bun run lint/typecheck/test`), aligné sur le runtime officiel.
- **Mesures préventives** : LESSONS_LEARNED L-004/L-006 ; vérification du run CI à chaque commit d'infrastructure.

## INCIDENT-003 — PAT GitHub révoqué (SEC-402) — statut suivi
- **Fait** : le PAT utilisé par le remote a été révoqué par l'utilisateur ; les pushes des Tasks 65/66 ont été effectués avec le credential courant du remote.
- **Vérification à faire au prochain push** : si 403 → re-provisionner un PAT fin (scope repo) via l'utilisateur.
- **Mesure préventive** : PAT à durée limitée + fine-grained (principe moindre privilège).

## Incident en attente de classement : aucun autre.
