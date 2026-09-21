-- Tests pgTAP — MODE-936 (AUDIT-003 S-03) : verrouillage des tentatives
-- de connexion (table auth_lockouts + RPC record/reset/get).
--
-- Couvert ici :
--   1. la table existe et son RLS est activé (deny-all sans policy) ;
--   2. le contrat d'exécution « service_role seul » des 3 RPC
--      (même harnais que tests/acl.sql — régression SEC-813) ;
--   3. le comportement : échecs sous le seuil sans verrou, verrou au
--      seuil, remise à zéro au succès.

begin;
select plan(9);

-- ── 1. Table + RLS ───────────────────────────────────────────────────────
select has_table('public', 'auth_lockouts', 'auth_lockouts existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.auth_lockouts'::regclass),
  true, 'RLS activé sur auth_lockouts (deny-all sans policy)');

-- ── 2. Contrat service_role seul sur les 3 RPC ──────────────────────────
select has_function('public', 'record_auth_failure',
  ARRAY['text','integer','integer','integer'],
  'RPC record_auth_failure existe');
select is(has_function_privilege('anon',
  'record_auth_failure(text,integer,integer,integer)'::regprocedure, 'EXECUTE'),
  false, 'S-03 : anon ne peut PAS exécuter record_auth_failure');
select is(has_function_privilege('authenticated',
  'record_auth_failure(text,integer,integer,integer)'::regprocedure, 'EXECUTE'),
  false, 'S-03 : authenticated ne peut PAS exécuter record_auth_failure');
select is(has_function_privilege('service_role',
  'record_auth_failure(text,integer,integer,integer)'::regprocedure, 'EXECUTE'),
  true, 'S-03 : service_role exécute record_auth_failure (contrat routes API)');

-- ── 3. Comportement du verrou ────────────────────────────────────────────
-- Sous le seuil : 4 échecs sur un plafond de 5 → pas de verrou.
select is(
  (record_auth_failure('pgtap:lock', 5, 15, 15))->>'locked',
  'false', 'S-03 : 1 échec sous le seuil ne verrouille pas');
select is(
  (record_auth_failure('pgtap:lock', 5, 15, 15))->>'attempts',
  '2', 'S-03 : le compteur d''échecs s''incrémente');

-- Au seuil : le 3e échec (plafond 3) verrouille, avec locked_until futur.
select is(
  (record_auth_failure('pgtap:lock', 3, 15, 15))->>'locked',
  'true', 'S-03 : le verrou se déclenche au seuil');
select is(
  (get_auth_lock('pgtap:lock') > now()),
  true, 'S-03 : get_auth_lock expose un verrou futur');

-- Succès = remise à zéro : le verrou disparaît.
select reset_auth_failures('pgtap:lock');
select is(
  (get_auth_lock('pgtap:lock') is null),
  true, 'S-03 : reset_auth_failures efface le verrou');

select * from finish();
rollback;
