# REVIEW_LOG.md — Journal des revues de code

*Rôle AGENT REVIEWER. Revue indépendante : qualité, patterns, risques. Une feature n'est TERMINÉE qu'après revue positive.*

## Revues réalisées

| Date | Périmètre | Verdict | Constats |
|---|---|---|---|
| 2026-09-19 (Task 68) | BUG-002 — routage restock → achat RPC (spec + code + tests) | ✅ | Contrat unique `buildStockPurchasePayload` (voice-stock.ts, module PUR — 0 store, 0 réseau) ; 0 duplication achat/réappro ; PATCH absolu + « \|\| 1 » silencieux SUPPRIMÉS (D3 respecté) ; NLU inchangé (suite localIntent verte) ; quantité absente → demande de répéter (honnête) ; refus métier parlé conservé ; file `stock-purchase` idempotente inchangée (sync-handlers-stock.test.ts verte) |
| 2026-09-19 (AUDIT-001) | Sous-audit cohérence doc↔code↔tests (lecture seule) | ✅ Code conforme, 🔴 docs en dérive | 5 statuts TERMINÉ vérifiés contre git ; 0 test orphelin ; COH-003/004/006/007 corrigées le jour même ; COH-002 → BUG-002 |
| 2026-09-19 (AUDIT-001) | Sous-audit sécurité (lecture seule + preuves live DB) | ✅ SEC-813/814 validées | 19/19 routes gardées, 0 secret, 0 XSS critique, matrice ACL 8/8 RPC parfaite ; OBS-1 levé par preuve live ; SEC-OBS-2/3/4 ouverts P3 |
| 2026-09-19 (AUDIT-001) | Hygiène globale | ✅ | 0 TODO/FIXME/HACK, 0 console.log, 0 `.skip/.only/.todo` ; 12 fichiers > 500 l. → DEBT_REPORT DET-001 |
| 2026-09-19 (Task 66) | NORM-301 VoixSettings partagé | ✅ | Props explicites, −356 lignes, imports nettoyés |
| 2026-09-19 (Task 66) | NORM-304 design-tokens + formatFCFA | ✅ | Source unique, 9 écrans migrés, 0 redéfinition locale restante |

## Points de vigilance pour les prochaines revues

1. ~~BUG-002~~ ✅ fermé (Task 68) — tout nouveau intent d'entrée stock doit passer par le chemin serveur-vérité (RPC + delta local post-verdict), JAMAIS par un PATCH absolu client
2. Toute **nouvelle RPC** : modèle ACL ADR-001 obligatoire (revoke public/anon/authenticated + grant service_role + vérification live)
3. Toute **nouvelle entité offline** : `operation_id` UUID déterministe + 4xx = jamais mis en file
4. Fichiers > 500 l. : interdire l'ajout de nouveaux géants (extraction à chaque retouche majeure)

## Règles de revue

- Verdict bloquant si : contrat d'erreur manquant, accès DB hors couche serveur, secret, fallback silencieux, unité inventée côté UI/vocal
- Chaque verdict est tracé ici avec sa preuve (fichier:ligne)
