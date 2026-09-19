# TEAM_STATUS.md — Visibilité de l'avancement (mis à jour : AUDIT-001, 2026-09-19)

════════════════════════════════════
## RÉPARTITION DE L'ÉQUIPE
════════════════════════════════════

🟢 **BACKEND** : veille — chantier stock STK-801..812+815 COMPLET ; prochain chantier = BUG-002 (router intent vocal `restock` sur `merchant_record_purchase`) ; fichiers : `voice-modal.tsx`, `stock-service.ts`, `sync-handlers.ts`

🔵 **FRONTEND** : veille — UI stock/transferts livrée et cohérente ; prochain périmètre = tranche découpage `auth-screen.tsx` (2177 l., DEBT_REPORT DET-001) + corrections a11y dès l'audit a11y

🟣 **DEVOPS/DATA** : COR-001 ✅ CI basculée Bun (`oven-sh/setup-bun` + `--frozen-lockfile`) — vérifier le premier run vert sur GitHub après push ; NORM-305 (types DB) toujours BLOQUÉ (Docker requis, procédure dans admin.ts)

🔒 **SECURITY** : re-audit SEC-813/814 **validé live en prod** (matrice 8/8 RPC + RLS push_tokens) ; 3 observations ouvertes P3 (SEC_BUGS.md) ; rituel ACL ajouté (toute nouvelle RPC vérifiée `has_function_privilege`)

📝 **COMMIT** : historique propre et atomique à `0f71025` ; dernier push Task 66 (rebasé sur `eca2baf`) ; prochain commit = registres AUDIT-001 + CI

🔍 **REVIEWER** : revue AUDIT-001 faite en lecture (cohérence doc↔code 25+ tests échantillonnés, 0 test orphelin) ; aucune PR en attente (push direct main, revue = gates + audit)

📚 **DOC** : resync COH-003/004/006/007 ✅ (ARCHITECTURE, PROJECT_CONTEXT, OFFLINE.md) ; registres de gouvernance créés (AUDIT_REPORT, DEBT_REPORT, SYSTEM_COMPLIANCE, SECURITY_AUDIT, SEC_BUGS, ADR-001..003)

♿ **A11Y** : **aucun audit formel à ce jour** (score dimension 55/100) — audit dédié des 4 écrans critiques (caisse, stock, ventes, transferts) programmé sous 5 features

⚡ **PERF** : aucun budget formel (65/100) — définition du budget (Lighthouse mobile, TTI) programmée sous 5 features ; build standalone OK

🎨 **UX/UI** : design tokens partagés (NORM-304 ✅) ; DESIGN_SYSTEM à formaliser à l'occasion du passage UX (P4)

🕵️ **AUDIT** : **AUDIT-001 → 77/100** (livraison non bloquée) ; prochain audit : après 5 features, ou 2026-10-01, ou avant INF-401 — focus a11y + perf

🔴 **QA (AGENT 2)** : baseline 879/879 (55 fichiers) · tsc 0 · eslint 0 · build OK ; smokes appareil restants : B1-010, B3-032, B5-052 + smoke stock/transferts sur APK

════════════════════════════════════
## ÉTAT DU PROJET (honnête)
════════════════════════════════════

- Tâche actuelle : **AUDIT-001 (Task 67)** — audit global + gouvernance + COR-001
- Terminées : 61 tâches registre (dont chantier stock complet) | En cours : 0 | Bloquées : NORM-305 (Docker), B3-033/034 (décisions utilisateur), INF-401 (déploiement), validations appareil B1-010/B3-032/B5-052
- Bugs ouverts : 1 (BUG-002, P2) | Vulnérabilités : 0 CRITIQUE/HAUTE (3 BAS suivies) | Problèmes a11y : non mesurés | Problèmes perf : non mesurés
- Incidents intégrité : 0 | Commits rejetés : 0 | Revues bloquantes : 0
- **Score santé projet : 77/100** | Dette technique : 8 items (0 critique)
