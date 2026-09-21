-- Tests pgTAP — MODE-937 (AUDIT-003 S-04) : codes de liaison one-shot
-- (table liaison_codes + RPC consume_liaison_code).
--
-- Couvert ici :
--   1. table + RLS deny-all + contrat service_role seul (harnais acl.sql) ;
--   2. CHECK d'intégrité sur subject_type ;
--   3. consommation ATOMIQUE : 1er appel gagne (sujet renvoyé), rejeu null,
--      code expiré null.

begin;
select plan(10);

-- ── 1. Table + RLS ───────────────────────────────────────────────────────
select has_table('public', 'liaison_codes', 'liaison_codes existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.liaison_codes'::regclass),
  true, 'RLS activé sur liaison_codes (deny-all sans policy)');
select has_index('public', 'liaison_codes', 'idx_liaison_codes_subject',
  'index (subject_type, subject_id) présent');

-- ── 2. Contrat service_role seul ─────────────────────────────────────────
select has_function('public', 'consume_liaison_code', ARRAY['text'],
  'RPC consume_liaison_code existe');
select is(has_function_privilege('anon',
  'consume_liaison_code(text)'::regprocedure, 'EXECUTE'),
  false, 'S-04 : anon ne peut PAS exécuter consume_liaison_code');
select is(has_function_privilege('authenticated',
  'consume_liaison_code(text)'::regprocedure, 'EXECUTE'),
  false, 'S-04 : authenticated ne peut PAS exécuter consume_liaison_code');
select is(has_function_privilege('service_role',
  'consume_liaison_code(text)'::regprocedure, 'EXECUTE'),
  true, 'S-04 : service_role exécute consume_liaison_code (contrat routes API)');

-- ── 3. CHECK subject_type ────────────────────────────────────────────────
select throws_ok(
  $$insert into public.liaison_codes (subject_type, subject_id, code_hash, expires_at)
    values ('admin', 'x', 'deadbeef', now() + interval '10 minutes')$$,
  '23514', 'S-04 : un subject_type hors royaumes est physiquement refusé');

-- ── 4. Consommation one-shot ─────────────────────────────────────────────
-- Code de test : « TSTU-VWXY » (alphabet réel), hash sha256 posé directement.
insert into public.liaison_codes (subject_type, subject_id, code_hash, expires_at, created_by)
values ('identificateur', 'pgtap-ident-1',
        encode(digest('TSTUVWXY', 'sha256'), 'hex'),
        now() + interval '10 minutes', 'pgtap');

select is(
  consume_liaison_code('tstu-vwxy'),
  jsonb_build_object('subject_type', 'identificateur', 'subject_id', 'pgtap-ident-1'),
  'S-04 : le 1er appel consomme le code et renvoie le sujet (normalisation tolérante)');

select is(
  consume_liaison_code('TSTU-VWXY'),
  null, 'S-04 : le rejeu du même code est refusé (one-shot atomique)');

insert into public.liaison_codes (subject_type, subject_id, code_hash, expires_at, created_by)
values ('merchant', 'pgtap-m-1',
        encode(digest('EXPIREDEX', 'sha256'), 'hex'),
        now() - interval '1 second', 'pgtap');

select is(
  consume_liaison_code('EXPI-REDEX'),
  null, 'S-04 : un code expiré est refusé');

select * from finish();
rollback;
