# TEAM_STATUS.md — Visibilité de l'avancement (mis à jour : Task 68, 2026-09-19)

════════════════════════════════════
## RÉPARTITION DE L'ÉQUIPE
════════════════════════════════════

🟢 **BACKEND** : BUG-002 ✅ FERMÉ (Task 68) — intent vocal `restock` routé sur `merchant_record_purchase` (contrat unique `buildStockPurchasePayload`, PATCH absolu supprimé) ; veille — aucun bug ouvert ; prochain périmètre = SEC-OBS-2/3/4 (P3) ou chantier au choix CTO

🔵 **FRONTEND** : veille — UI stock/transferts livrée et cohérente ; prochain périmètre = tranche découpage `auth-screen.tsx` (2177 l., DEBT_REPORT DET-001) + corrections a11y dès l'audit a11y

🟣 **DEVOPS/DATA** : COR-001 ✅ CI basculée Bun (`oven-sh/setup-bun` + `--frozen-lockfile`) — vérifier le premier run vert sur GitHub après push ; NORM-305 (types DB) toujours BLOQUÉ (Docker requis, procédure dans admin.ts)

🔒 **SECURITY** : re-audit SEC-813/814 **validé live en prod** (matrice 8/8 RPC + RLS push_tokens) ; 3 observations ouvertes P3 (SEC_BUGS.md) ; rituel ACL ajouté (toute nouvelle RPC vérifiée `has_function_privilege`)

📝 **COMMIT** : historique propre et atomique ; commit Task 68 = fix(vocal) BUG-002 (code + spec + tests + registres) ; push immédiat sur origin/main

🔍 **REVIEWER** : revue Task 68 ✅ (contrat unique, D3 respecté, NLU inchangé, file offline inchangée) — détail REVIEW_LOG ; aucune PR en attente (push direct main, revue = gates + audit)

📚 **DOC** : resync COH-003/004/006/007 ✅ (ARCHITECTURE, PROJECT_CONTEXT, OFFLINE.md) ; registres de gouvernance créés (AUDIT_REPORT, DEBT_REPORT, SYSTEM_COMPLIANCE, SECURITY_AUDIT, SEC_BUGS, ADR-001..003)

♿ **A11Y** : **aucun audit formel à ce jour** (score dimension 55/100) — audit dédié des 4 écrans critiques (caisse, stock, ventes, transferts) programmé sous 5 features

⚡ **PERF** : aucun budget formel (65/100) — définition du budget (Lighthouse mobile, TTI) programmée sous 5 features ; build standalone OK

🎨 **UX/UI** : design tokens partagés (NORM-304 ✅) ; DESIGN_SYSTEM à formaliser à l'occasion du passage UX (P4)

🕵️ **AUDIT** : **AUDIT-001 → 77/100** (livraison non bloquée) ; prochain audit : après 5 features, ou 2026-10-01, ou avant INF-401 — focus a11y + perf

🔴 **QA (AGENT 2)** : baseline **882/882 (55 fichiers, +3 Task 68)** · tsc 0 · eslint 0 · build OK ; smokes appareil restants : B1-010, B3-032, B5-052 + smoke stock/transferts sur APK (+ vérifier le mouvement PURCHASE du réappro vocal « reçu 10 kilos de tomates »)

════════════════════════════════════
## ÉTAT DU PROJET (honnête)
════════════════════════════════════

- Tâche actuelle : **BUG-002 (Task 68)** — FERMÉE ✅ ; suite : audit a11y + budget perf sous 5 features, premier run CI Bun à vérifier sur GitHub
- Terminées : 62 tâches registre (dont chantier stock complet + BUG-002) | En cours : 0 | Bloquées : NORM-305 (Docker), B3-033/034 (décisions utilisateur), INF-401 (déploiement), validations appareil B1-010/B3-032/B5-052
- Bugs ouverts : 0 (BUG-001 ✅, BUG-002 ✅) | Vulnérabilités : 0 CRITIQUE/HAUTE (3 BAS suivies) | Problèmes a11y : non mesurés | Problèmes perf : non mesurés
- Incidents intégrité : 0 | Commits rejetés : 0 | Revues bloquantes : 0
- **Score santé projet : 77/100** | Dette technique : 8 items (0 critique)
