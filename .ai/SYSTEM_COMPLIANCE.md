# SYSTEM_COMPLIANCE.md — Conformité aux règles du système (AUDIT-001, 2026-09-19)

**Score de conformité global : 78 %** (19/24 règles conformes, 3 corrigées le jour même, 2 partielles)

| # | Règle | Statut | Preuve |
|---|---|---|---|
| 1 | Intégrité : aucun mensonge dans TASKS/registres | ✅ | 12 statuts échantillonnés (STK-815, NORM-301/303/304/305…) tous corroborés par git/artefacts ; BLOQUÉ assumé (NORM-305) |
| 2 | API-first : tout endpoint a un contrat | ✅ | Contrats dans PLAN_STOCK.md §API, codes d'erreur typés (stock-service.ts, guard transverse testé) |
| 3 | Séparation des couches : pas de DB dans les composants | ✅ | 0 composant client n'appelle Supabase (croisement 81 fichiers important `supabase/admin`, 0 'use client') |
| 4 | Non-duplication justifiée | ✅ | NORM-301 (VoixSettings), NORM-304 (design-tokens, formatFCFA unique) ; doublons restants assumés et listés (DEBT_REPORT DET-006) |
| 5 | Commits conventionnels | ✅ | `git log` : fix(docs):, refactor(design):, docs:, fix(api): — format respecté |
| 6 | Atomicité des commits | ✅ | 1 commit = 1 intention (ex. `75a07e1` lockfile seul, `6675cb3` jetons+formatFCFA) |
| 7 | Revue de code systématique | ✅ | REVIEW_LOG.md (créé) ; revues AGENT 1 tracées dans worklog |
| 8 | Documentation des fonctions publiques | 🔶 Partiel | Registres + docs spécialisés riches, mais JSDoc par fonction inégal (DEBT_REPORT §tests/doc, P4) |
| 9 | ADR pour décisions majeures | ✅ (rattrapé) | ADR-001/002/003 créés à l'audit ; les 3 décisions structurantes historiques désormais documentées |
| 10 | A11y validé sur les features frontend | ❌ | Aucun audit a11y formel tracé → plan d'action AUDIT-001 #4, registre A11Y à initialiser lors du premier audit a11y |
| 11 | Performance : aucune régression métrique | 🔶 Partiel | Aucun budget/métrique formel → plan d'action AUDIT-001 #5 |
| 12 | Sécurité : aucune vulnérabilité CRITIQUE/HAUTE ouverte | ✅ | SEC-813/814 validées live ; ouvert : 0 CRITIQUE, 0 HAUTE (SEC_BUGS.md) |
| 13 | Tests : couverture ≥ 80 % (90 % services critiques) | ✅ | 879/879, 55 fichiers ; stock 5/5 modules couverts ; suites transverses (contrats, garde littéraux) ; mesure de couverture % formelle à brancher (P4) |
| 14 | RGPD/consentement | 🔶 Partiel | Données personnelles limitées (téléphone, noms) ; politique de rétention non documentée — à traiter avant mise à l'échelle |
| 15 | Licences des dépendances compatibles | 🔶 Partiel | stack MIT/ISC dominante non vérifiée exhaustivement (P4, à automatiser) |
| 16 | Validation complète avant push (tests+tsc+eslint) | ✅ | Gates mesurés à chaque Task (worklog Tasks 62–66) ; CI distante réparée COR-001 |
| 17 | Fetch préalable au push (sessions concurrentes) | ✅ | Déjà appliqué (incident Task 66 résolu par rebase documenté) |
| 18 | Zéro code mort non répertorié | ✅ | Code mort listé et assumé (ARCHITECTURE §6.5) |
| 19 | Offline-first non négociable | ✅ | File cap 500 + 18 handlers idempotents + entités stock ; Keiwa volontairement en ligne (décision documentée) |
| 20 | FCFA entiers, jamais de float | ✅ | formatFCFA source unique ; montants en entiers dans les RPC/contrats |
| 21 | Erreurs explicites, pas de fallback silencieux | ✅ | BAOULE_NOT_READY, UNKNOWN_STOCK, refus strict 3 niveaux |
| 22 | 1 migration = 1 fichier nommé | ✅ | 136 fichiers dans supabase/migrations/, nommage create_function_/create_/alter_ |
| 23 | Audit global périodique | ✅ (rattrapé) | AUDIT-001 déclenché (seuil 12 features dépassé), cadence fixée §10 |
| 24 | Registres .ai/ complets et synchronisés | ✅ (rattrapé) | AUDIT_REPORT, DEBT_REPORT, SEC_BUGS, SECURITY_AUDIT, TEAM_STATUS, COMMIT_LOG, REVIEW_LOG, LESSONS_LEARNED, INCIDENTS, DAILY_STANDUP, ADR/ créés à AUDIT-001 |

## Plan d'action pour les règles non conformes

- **Règle 10 (a11y)** : audit a11y dédié des 4 écrans marchands critiques sous 5 features (AUDIT-001 plan #4)
- **Règle 11 (perf)** : budget défini (Lighthouse mobile + TTI cible) sous 5 features (AUDIT-001 plan #5)
- **Règles 8/13/14/15** : opportuniste, remontées au prochain audit
