# AUDIT_REPORT.md — Rapports d'audit global (index)

*Le déclencheur, la méthode et le format sont définis par le prompt système multi-agents (§16, rôle 1–4). Chaque audit complet vit dans `AUDITS/AUDIT-XXX-YYYY-MM-DD.md`.*

## Audits réalisés

| # | Date | Score global | Rapport | Corrections immédiates |
|---|---|---:|---|---|
| 001 | 2026-09-19 | **77/100** | [AUDIT-001-2026-09-19.md](AUDITS/AUDIT-001-2026-09-19.md) | COR-001 CI→Bun ✅ · resync docs COH-003/004/006/007 ✅ · BUG-002 ouvert (P2) |

## Synthèse du dernier audit (AUDIT-001, 2026-09-19)

- **Sécurité : 90/100** — SEC-813/814 validées **live en prod** (matrice ACL 8/8 RPC : anon/authenticated/PUBLIC sans EXECUTE, service_role seul ; `device_push_tokens` RLS deny-all, grants postgres+service_role uniquement)
- **Points forts** : idempotence offline complète, intégrité du suivi (0 mensonge), hygiène de code (0 TODO/console.log/skip)
- **Actions ouvertes** : BUG-002 (réappro vocal P2), audit a11y (score dimension 55), budget performance (65), SEC-OBS-2/3/4 (P3)
- **Prochain audit** : après 5 features, ou 2026-10-01, ou avant INF-401 — focus a11y + perf + smokes appareil

## Seuils

- Score < 60/100 ⇒ **livraison PROD bloquée** par l'AGENT AUDIT GLOBAL
- 3+ vulnérabilités CRITIQUES, 3+ PR bloquées, 3+ mensonges, ou chute de vélocité > 30 % ⇒ audit déclenché par signaux faibles
