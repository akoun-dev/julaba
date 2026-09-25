# REVIEW_LOG.md — Journal des revues de code

*Rôle AGENT REVIEWER. Revue indépendante : qualité, patterns, risques. Une feature n'est TERMINÉE qu'après revue positive.*

## Revues réalisées

| Date | Périmètre | Verdict | Constats |
|---|---|---|---|
| 2026-09-19 (Task 69) | VOCAL-612 — relance micro + libellés + vouvoiement (spec + code + tests) + FUSION du commit externe `1c2941d` | ✅ | Pattern de référence vente-rapide conservé à l'identique (ref indirection + rAF — piège BUG-001 évité) ; refs posées AVANT l'écoute ; anti-boucle : erreurs micro jamais relancées + reformulations limitées à 2 ; refus de confirmation honnête par type (vente ≠ autre) ; vouvoiement intégral tata-phrases/day-summary avec verrous mis à jour ; CONFIRM_ASK = source unique (0 duplication à l'écran et à l'oral) ; NLU restock/purchase inchangés ; phrase de vente : parenthésé technique supprimé (lisible à l'oral) ; fusion UNION : indicateur flottant partagé de l'utilisateur conservé + sous-titre étendu à l'état quantité |
| 2026-09-19 (Task 68) | BUG-002 — routage restock → achat RPC (spec + code + tests) | ✅ | Contrat unique `buildStockPurchasePayload` (voice-stock.ts, module PUR — 0 store, 0 réseau) ; 0 duplication achat/réappro ; PATCH absolu + « \|\| 1 » silencieux SUPPRIMÉS (D3 respecté) ; NLU inchangé (suite localIntent verte) ; quantité absente → demande de répéter (honnête) ; refus métier parlé conservé ; file `stock-purchase` idempotente inchangée (sync-handlers-stock.test.ts verte) |
| 2026-09-19 (AUDIT-001) | Sous-audit cohérence doc↔code↔tests (lecture seule) | ✅ Code conforme, 🔴 docs en dérive | 5 statuts TERMINÉ vérifiés contre git ; 0 test orphelin ; COH-003/004/006/007 corrigées le jour même ; COH-002 → BUG-002 |
| 2026-09-19 (AUDIT-001) | Sous-audit sécurité (lecture seule + preuves live DB) | ✅ SEC-813/814 validées | 19/19 routes gardées, 0 secret, 0 XSS critique, matrice ACL 8/8 RPC parfaite ; OBS-1 levé par preuve live ; SEC-OBS-2/3/4 ouverts P3 |
| 2026-09-19 (AUDIT-001) | Hygiène globale | ✅ | 0 TODO/FIXME/HACK, 0 console.log, 0 `.skip/.only/.todo` ; 12 fichiers > 500 l. → DEBT_REPORT DET-001 |
| 2026-09-19 (Task 66) | NORM-301 VoixSettings partagé | ✅ | Props explicites, −356 lignes, imports nettoyés |
| 2026-09-19 (Task 66) | NORM-304 design-tokens + formatFCFA | ✅ | Source unique, 9 écrans migrés, 0 redéfinition locale restante |

## Points de vigilance pour les prochaines revues

1. ~~BUG-002~~ ✅ fermé (Task 68) — tout nouveau intent d'entrée stock doit passer par le chemin serveur-vérité (RPC + delta local post-verdict), JAMAIS par un PATCH absolu client
2. **VOCAL-612 (nouveau)** : toute nouvelle question parlée de Tata DOIT relancer l'écoute via `startListeningRef` dans le callback de `speakBaoule` (jamais de question qui laisse le marchand sans micro) ; toute phrase Tata passe par `tata-phrases.ts` en VOVOIEMENT — jamais de « tu » en dur dans un composant
3. Toute **nouvelle RPC** : modèle ACL ADR-001 obligatoire (revoke public/anon/authenticated + grant service_role + vérification live)
4. Toute **nouvelle entité offline** : `operation_id` UUID déterministe + 4xx = jamais mis en file
5. Fichiers > 500 l. : interdire l'ajout de nouveaux géants (extraction à chaque retouche majeure) — `voice-modal.tsx` (958 l.) et `localIntent.ts` (933 l.) rejoignent DET-001 au prochain resync

## Règles de revue

- Verdict bloquant si : contrat d'erreur manquant, accès DB hors couche serveur, secret, fallback silencieux, unité inventée côté UI/vocal
- Chaque verdict est tracé ici avec sa preuve (fichier:ligne)

| 2026-09-24 (AUDIT-2026-09-24) | P1 synchronisation/reprise réseau | 🟡 CODE_CORRIGÉ, VALIDATION À FAIRE | Reclaim session avant flush ; reclaims concurrents sérialisés ; 401/403 suspendent la file au lieu de supprimer l'opération ; erreurs transitoires arrêtent le FIFO ; Idempotency-Key propagée lorsqu'une clé stable existe ; écritures device_sessions vérifiées. Aucun gate exécuté après ces changements. |

| 2026-09-25 (MODE-1004) | Corrections AUDIT-012 : marketplace RPC transactionnelles + namespace vendeur + idempotence, lockout fail-closed, invariants users, healthz/readyz, CI build, test Android | ✅ CODE_TERMINÉ | 0 écriture directe marketplace_orders restante dans les routes (2 RPC ADR-001 revoked + pgTAP 33) ; transitions invalides/impossibles → codes fermés du registre marketplace-errors (jamais Postgres verbatim) ; lockout fail-closed n'affecte QUE les tentatives avec mot de passe incorrect (test 503) ; invariants users pure-testés (12) et appliqués côté serveur avant écriture ; healthz ne touche JAMAIS Supabase (test), readyz sans secret dans le corps (test) ; tsc amont réparé au passage (authRequired). Validation pgTAP + build à rejouer en CI au prochain push. |
