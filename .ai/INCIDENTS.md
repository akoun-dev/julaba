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

## INCIDENT-004 — Push rejeté (commit externe `100e9be`) — 2026-09-19, Task 67
- **Fait** : push rejeté — commit externe `100e9be` « fix(db): corriger la terminaison des fonctions SQL marchand » (migrations 110000..110400, poussé par l'utilisateur pendant la session) ; zéro chevauchement avec les fichiers de l'audit.
- **Résolution** : `git fetch` + rebase propre → push OK (`100e9be..4b7f46f`). Vitest re-vérifié post-rebase : 879/879.
- **Mesure préventive (déjà en place)** : fetch préalable systématique avant push — a fonctionné, incident résolu en < 1 minute.

## INCIDENT-005 — Push rejeté : commit externe EN CHEVAUCHEMENT (fusion) — 2026-09-19, Task 69
- **Fait** : push rejeté — 2 commits externes poussés par l'utilisateur pendant la session : `9808fc6` (test auth, zéro chevauchement) et **`1c2941d` « feat(vocal): automatiser les confirmations vocales et mutualiser l'écoute »** qui implémente INDÉPENDAMMENT le cœur du correctif VOCAL-612 (même pattern : ref `startListeningRef` + `requestAnimationFrame` + callback `speakBaoule`, mêmes 2 sites) — premier chevauchement réel de fichiers de la session.
- **Résolution** : rebase + résolution UNION sur `voice-modal.tsx` (6 zones de conflit) — conservés : leur apport nouveau (composant partagé `voice-listening-indicator.tsx` + usage auth-screen + usage modal + label bas « Je vous écoute… ») et mes extensions (anti-boucle `confirmRetryRef` ×2, `CONFIRM_ASK` + sous-textes conditionnels, vouvoiement intégral, refus par type, `describeSTTError`, sous-titre indicateur étendu à l'état quantité). Signature de ref `() => Promise<void>` (la leur) retenue pour compatibilité. Gates re-vérifiés post-fusion : vitest **901/901** (leurs +14 tests auth) · tsc 0 · eslint 0 · build OK → push OK (`1c2941d..d9c84f0`).
- **Leçon** : le chevauchement était BÉNÉFIQUE (les deux implémentations concordaient sur le pattern — preuve de robustesse) ; la spec préalable m'a permis de résoudre l'union en conservant tout. Re-basculer le fetch préalable systématique AVANT commit (pas seulement avant push).

## Incident en attente de classement : aucun autre.
