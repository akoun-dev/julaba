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

## INCIDENT-006 — Push rejeté : commit externe EN CHEVAUCHEMENT massif (fusion UNION Mode Marché) — 2026-09-19, Task 71
- **Fait** : push rejeté — commit externe `0b209d4` « feat(marchand): ajouter le mode Marché hors connexion » (poussé par l'utilisateur pendant la session, ~1 h après le début de mon incrément) implémente INDÉPENDAMMENT le même volet : même route `'mode-marche'`, même fichier `market-mode-screen.tsx` (contenus très différents), store `market-mode-store.ts` (path/nom/forme différents), localisation GPS, compteur d'attente, doc `MARKET_MODE.md` — chevauchement de 6 fichiers avec des choix de conception divergents.
- **Résolution — fusion UNION (leur UI gagne, mes fondations restent)** : conservé DE LEURS : écran (métriques, actions rapides, configuration, sélecteur de langue Tata §36, bouton « Synchroniser »), store `src/lib/stores/market-mode-store.ts` ('julaba-market-mode') + branchement sync-flusher/capacitor-provider, `market-mode-location.ts` (contrat écran), test store, choix de registre TASKS.md. Conservé DU MÔME : les fondations ABSENTES de leur version — session de journée marché §7-8 (migration `merchant_market_sessions`, route upsert idempotent `client_id`, handler offline, builders purs, branchement UNIDIRECTIONNEL caisse via `caisse-link.ts` réécrit sur LEUR store), `geo.ts` moteur jamais-throw (leur `captureMarketLocation` réimplémenté par-dessus, contrat conservé), `CloseDayModal` extraite + montée globale (leur « Résumé du jour » navigue vers l'accueil — piège `toggleDaySummary` contourné chez eux, résolu structurellement chez moi, les deux coexistent). Supprimé du môme (supplanté) : mon store/mon écran/ma modale d'activation/ma liste de marchés/mon builder connectivité/ma bandeau strip/`isSyncFlushInProgress()`. Leur régression involontaire réparée : `market-mode-screen.tsx:47` — destructuration tronquée `const arketNameInput, setMarketNameInput]` (restait inerte pour tsc [récupération d'erreur] mais cassait le champ « Nom du marché » à l'exécution) → `const [marketNameInput, setMarketNameInput]`.
- **Gates post-fusion** : vitest **918/918** (59 fichiers — leur test store + mes 14 geo/session) · tsc 0 · eslint 0. E2e navigateur re-vérifié après fusion.
- **Leçon** : même cause qu'INCIDENT-005 mais à l'échelle d'une fonctionnalité entière ; la spec préalable (SPEC-MODE-901.md) et l'audit ont permis de classer leurs apports vs les miens en < 30 min. La coordination temporelle des sessions parallèles sur le MÊME périmètre reste le point faible — fetch AVANT le premier fichier écrit (pas seulement avant le commit).

## Incident en attente de classement : aucun autre.
