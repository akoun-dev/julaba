-- Tests pgTAP — ACL des RPC post-audit (AUDIT-003 S-01, MODE-934)
--
-- Régression SEC-813 : trois SECURITY DEFINER créées après le durcissement
-- du 2026-09-19 n'avaient pas le revoke anon/authenticated (cf. migration
-- 20260921100000). Ce fichier verrouille le contrat « service_role seul »
-- pour les 3 RPC concernées : anon/authenticated sans EXECUTE, service_role
-- avec. Le harnais existant (stock.sql §13) couvre déjà les 8 RPC stock
-- historiques côté anon ; ce fichier ajoute authenticated + les 3 nouvelles.

begin;
select plan(21);

-- ── 1. Les trois RPC existent avec les signatures attendues ─────────────
select has_function('public', 'merchant_record_credit_op',
  ARRAY['text','uuid','text','text','text','bigint','text'],
  'RPC merchant_record_credit_op existe');
select has_function('public', 'merchant_reverse_sale',
  ARRAY['text','uuid','text','text'],
  'RPC merchant_reverse_sale existe');
select has_function('public', 'purge_expired_notifications',
  ARRAY['integer'],
  'RPC purge_expired_notifications existe');

-- ── 2. merchant_record_credit_op — anon/authenticated refusés ───────────
select is(has_function_privilege('anon',
  'merchant_record_credit_op(text,uuid,text,text,text,bigint,text)'::regprocedure, 'EXECUTE'),
  false, 'S-01 : anon ne peut PAS exécuter merchant_record_credit_op');
select is(has_function_privilege('authenticated',
  'merchant_record_credit_op(text,uuid,text,text,text,bigint,text)'::regprocedure, 'EXECUTE'),
  false, 'S-01 : authenticated ne peut PAS exécuter merchant_record_credit_op');
select is(has_function_privilege('service_role',
  'merchant_record_credit_op(text,uuid,text,text,text,bigint,text)'::regprocedure, 'EXECUTE'),
  true, 'S-01 : service_role exécute merchant_record_credit_op (contrat routes API)');

-- ── 3. merchant_reverse_sale — anon/authenticated refusés ───────────────
select is(has_function_privilege('anon',
  'merchant_reverse_sale(text,uuid,text,text)'::regprocedure, 'EXECUTE'),
  false, 'S-01 : anon ne peut PAS exécuter merchant_reverse_sale');
select is(has_function_privilege('authenticated',
  'merchant_reverse_sale(text,uuid,text,text)'::regprocedure, 'EXECUTE'),
  false, 'S-01 : authenticated ne peut PAS exécuter merchant_reverse_sale');
select is(has_function_privilege('service_role',
  'merchant_reverse_sale(text,uuid,text,text)'::regprocedure, 'EXECUTE'),
  true, 'S-01 : service_role exécute merchant_reverse_sale (contrat routes API)');

-- ── 4. purge_expired_notifications — anon/authenticated/public refusés ──
select is(has_function_privilege('anon',
  'purge_expired_notifications(integer)'::regprocedure, 'EXECUTE'),
  false, 'S-01 : anon ne peut PAS exécuter purge_expired_notifications');
select is(has_function_privilege('authenticated',
  'purge_expired_notifications(integer)'::regprocedure, 'EXECUTE'),
  false, 'S-01 : authenticated ne peut PAS exécuter purge_expired_notifications');
select is(has_function_privilege('service_role',
  'purge_expired_notifications(integer)'::regprocedure, 'EXECUTE'),
  true, 'S-01 : service_role exécute purge_expired_notifications (pg_cron/bo-cron)');
select is(has_function_privilege('public',
  'purge_expired_notifications(integer)'::regprocedure, 'EXECUTE'),
  false, 'S-01 : PUBLIC (héritage) ne peut PAS exécuter purge_expired_notifications');

-- ── 5. Parité authenticated sur les 8 RPC stock historiques ─────────────
-- stock.sql §13 vérifie anon ; ici le même contrat pour authenticated
-- (aucun écart entre les deux rôles JWT sur les SECURITY DEFINER marchand).
select is(has_function_privilege('authenticated',
  'merchant_record_sale(text,uuid,text,jsonb,bigint,boolean,text,text,text)'::regprocedure, 'EXECUTE'),
  false, 'SEC-813 : authenticated ne peut PAS exécuter merchant_record_sale');
select is(has_function_privilege('authenticated',
  'merchant_record_purchase(text,uuid,text,jsonb,text,bigint,text,text,boolean,text)'::regprocedure, 'EXECUTE'),
  false, 'SEC-813 : authenticated ne peut PAS exécuter merchant_record_purchase');
select is(has_function_privilege('authenticated',
  'merchant_record_movement(text,uuid,text,text,text,numeric,numeric,text,text,text,text,text)'::regprocedure, 'EXECUTE'),
  false, 'SEC-813 : authenticated ne peut PAS exécuter merchant_record_movement');
select is(has_function_privilege('authenticated',
  'merchant_adjust_to_count(text,uuid,text,text,numeric,text)'::regprocedure, 'EXECUTE'),
  false, 'SEC-813 : authenticated ne peut PAS exécuter merchant_adjust_to_count');
select is(has_function_privilege('authenticated',
  'merchant_backfill_opening_balances()'::regprocedure, 'EXECUTE'),
  false, 'SEC-813 : authenticated ne peut PAS exécuter merchant_backfill_opening_balances');
select is(has_function_privilege('authenticated',
  'merchant_transfer_out(text,uuid,text,text,jsonb,text)'::regprocedure, 'EXECUTE'),
  false, 'SEC-813 : authenticated ne peut PAS exécuter merchant_transfer_out');
select is(has_function_privilege('authenticated',
  'merchant_transfer_receive(text,text,text,jsonb)'::regprocedure, 'EXECUTE'),
  false, 'SEC-813 : authenticated ne peut PAS exécuter merchant_transfer_receive');
select is(has_function_privilege('authenticated',
  'merchant_transfer_cancel(text,text,text,text)'::regprocedure, 'EXECUTE'),
  false, 'SEC-813 : authenticated ne peut PAS exécuter merchant_transfer_cancel');

select * from finish();
rollback;
