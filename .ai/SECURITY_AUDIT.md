# SECURITY_AUDIT.md — Historique et état de la sécurité

*DEV SÉCURITÉ + AGENT AUDIT GLOBAL. Dernière vérification live : **2026-09-19** (AUDIT-001), base de production `pqgcwcdtkxatwfjvatdg` via pooler aws-1-eu-west-1.*

## 1. Vulnérabilités historiques — TOUTES CORRIGÉES ET VALIDÉES EN PROD

### SEC-813 — Exécution anon des RPC merchant_* (HAUT) ✅ FERMÉ
- **Correctifs** : migrations `20260919100000_revoke_merchant_rpc_anon.sql` (revoke anon+authenticated sur 5 RPC), ré-appliqué par les fixes `20260919110000`/`20260919110100`, et auto-revoke dans les 3 migrations transfer `20260919110200:159` / `110300:147` / `110400:96`
- **Validation live 2026-09-19** : matrice `has_function_privilege` — **anon=false, authenticated=false, PUBLIC=false sur les 8/8** RPC (`merchant_record_sale/purchase/movement/adjust_to_count/backfill_opening_balances/transfer_out/transfer_receive/transfer_cancel`) et **service_role=true sur 8/8**
- Conséquence : PostgREST ne peut plus contourner `requireDeviceOwner` ; toute nouvelle RPC doit suivre le même modèle (ADR-001)

### SEC-814 — device_push_tokens exposé (HAUT) ✅ FERMÉ
- **Correctif** : migration `20260919100100_lock_device_push_tokens.sql` — RLS activé (aucune policy ⇒ deny-all), revoke anon+authenticated (TRUNCATE compris)
- **Validation live 2026-09-19** : `relrowsecurity=true`, **0 policy**, grants tables = `postgres` + `service_role` uniquement ; la route `src/app/api/push-tokens/route.ts` dérive le subject du cookie serveur (jamais du body) et borne DELETE par subject

## 2. Audit de surface du 2026-09-19 (AUDIT-001)

- **Routes** : 19/19 routes `/api/marchand/*` gardées par `requireDeviceOwner` + service_role ; `/api/v1/*` = `auth.getUser` + RLS (modèle compte) ; routes device (`notifications`, `sync-conflicts`) via `getDeviceSubject` ; **aucune route data sans garde**
- **Secrets** : 0 clé hardcodée (1 seul faux positif `dedup_key`) ; `.env.example` placeholders ; `SUPABASE_SERVICE_ROLE_KEY` lu uniquement dans `env.ts` (throw si absent) ; 0 import du client admin dans un composant `'use client'` (croisement 81 fichiers)
- **MFA démo** : `BACKOFFICE_MFA_TEST_CODE` inerte en prod (double garde `NODE_ENV !== 'production'` ET `BACKOFFICE_MFA_TEST_MODE === 'true'`, mfa.ts:17)
- **XSS** : 1 seul `dangerouslySetInnerHTML` (chart.tsx:83, config statique shadcn — acceptable) ; 0 `eval(`
- **Sessions** : token 32 octets CSPRNG, stocké hashé SHA-256, TTL 12 h (BO) / 365 j (appareil), révocable (`revoked_at`), cookie httpOnly/secure(prod)/sameSite=lax ; lookup serveur par token hashé — pas de comparaison de secret vulnérable au timing
- **Grants résiduels** : aucun `TRUNCATE`/`GRANT ALL` suspect dans les migrations 2026*

## 3. Matrice ACL live — 8 RPC merchant_* (2026-09-19)

| RPC | anon | authenticated | PUBLIC | service_role |
|---|---|---|---|---|
| merchant_adjust_to_count | ❌ | ❌ | ❌ | ✅ |
| merchant_backfill_opening_balances | ❌ | ❌ | ❌ | ✅ |
| merchant_record_movement | ❌ | ❌ | ❌ | ✅ |
| merchant_record_purchase | ❌ | ❌ | ❌ | ✅ |
| merchant_record_sale | ❌ | ❌ | ❌ | ✅ |
| merchant_transfer_cancel | ❌ | ❌ | ❌ | ✅ |
| merchant_transfer_out | ❌ | ❌ | ❌ | ✅ |
| merchant_transfer_receive | ❌ | ❌ | ❌ | ✅ |

Requêtes : `scripts/db_acl_check.js` + `db_svc_check.js` (rejouables à chaque nouvelle RPC).

## 4. Observations ouvertes (aucune CRITIQUE/HAUTE)

→ Détail et suivi dans **SEC_BUGS.md** (SEC-OBS-2 TTL session appareil 365 j, SEC-OBS-3 cookie `secure` conditionnel, SEC-OBS-4 garde `server-only`/typage admin.ts)

## 5. Rituels de sécurité

- Toute **nouvelle RPC SECURITY DEFINER** : `revoke all from public, anon, authenticated` + `grant execute to service_role` + vérification `has_function_privilege` live (ADR-001)
- Toute **nouvelle table marchand** : RLS activé sans policy (deny-all) + accès service_role seul
- Après tout correctif de sécurité : re-audit indépendant (comme SEC-813/814 ici) AVANT fermeture du ticket
