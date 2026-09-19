# ADR-001 — Accès données marchand : service_role côté serveur + RLS deny-all + RPC SECURITY DEFINER verrouillées

- **Statut** : ACCEPTÉ (appliqué depuis STK-802/803, verrouillé par SEC-813/814, validé live AUDIT-001)
- **Date** : 2026-09-19 (rétro-documentation de la décision de chantier stock)
- **Décideurs** : AGENT 1 ; re-audit DEV SÉCURITÉ
- **Contexte** : l'app est offline-first avec sessions appareil (pas de comptes Supabase par marchand). Exposer anon/authenticated = contourner `requireDeviceOwner`. Les RPC transactionnelles (vente, achat, transfert…) doivent être atomiques et authoritaires.
- **Options rejetées** : policies RLS par rôle anonyme (n'apporte rien sans comptes users) ; exécuter la logique métier côté client (insécurisé et incompatible offline-idempotent) ; accès direct PostgREST des tables marchand (perte du contrôle transactionnel).
- **Décision** :
  1. Tables métier marchand (`merchant_stock_*`, `device_push_tokens`…) : **RLS activé, 0 policy (deny-all)**, aucun grant anon/authenticated — l'accès se fait uniquement via routes Next avec `requireDeviceOwner` + client service_role (`admin.ts`).
  2. RPC transactionnelles : `SECURITY DEFINER`, modèle ACL obligatoire `revoke all from public/anon/authenticated` + `grant execute to service_role`.
  3. Toute nouvelle RPC/table est vérifiée **live** (`has_function_privilege`, `pg_policies`) avant fermeture du ticket.
- **Conséquences** : + sécurité prouvée et auditable ; − dépendance totale à la qualité des routes Next (mitigé : 19/19 gardées, audit de surface) ; chaque nouvelle RPC doit suivre le rituel (LEADS à L-006 de sécurité, SECURITY_AUDIT §5).
- **Preuves** : migrations `2026091909*.sql`, `20260919100000`, `20260919100100`, `202609191102..4` ; matrice live 8/8 (SECURITY_AUDIT §3, 2026-09-19) ; `scripts/db_acl_check.js`.
