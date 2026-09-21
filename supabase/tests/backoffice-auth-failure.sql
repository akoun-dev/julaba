-- Tests pgTAP — MODE-964 (AUDIT-005 A5-F19) : verrouillage par compte
-- back-office ATOMIQUE (RPC record_backoffice_auth_failure, migration
-- 20260922110000, modèle record_auth_failure 20260921130000).
--
-- Couvert ici :
--   1. le contrat d'exécution « service_role seul » (même harnais que
--      tests/acl.sql — régression SEC-813) ;
--   2. le comportement atomique : incrément, seuil → compteur remis à 0 +
--      verrou posé, préservation du compteur et du verrou existant pendant
--      un verrou actif (pas de prolongation), remise à zéro au succès,
--      compte inconnu → NULL (fail-open de l'appelant).
--
-- NB : now() est constant dans la transaction (timestamp de transaction) :
-- les comparaisons de locked_until sont exactes, sans course de mesure.

begin;
select plan(14);

-- ── 1. Contrat service_role seul ─────────────────────────────────────────
select has_function('public', 'record_backoffice_auth_failure',
  ARRAY['text','integer','integer'],
  'RPC record_backoffice_auth_failure existe');
select is(has_function_privilege('anon',
  'record_backoffice_auth_failure(text,integer,integer)'::regprocedure, 'EXECUTE'),
  false, 'A5-F19 : anon ne peut PAS exécuter record_backoffice_auth_failure');
select is(has_function_privilege('authenticated',
  'record_backoffice_auth_failure(text,integer,integer)'::regprocedure, 'EXECUTE'),
  false, 'A5-F19 : authenticated ne peut PAS exécuter record_backoffice_auth_failure');
select is(has_function_privilege('service_role',
  'record_backoffice_auth_failure(text,integer,integer)'::regprocedure, 'EXECUTE'),
  true, 'A5-F19 : service_role exécute record_backoffice_auth_failure (contrat routes API)');

-- ── 2. Comportement atomique ─────────────────────────────────────────────
insert into bo_users (id, email, password_hash, name)
values ('pgtap-bo-a5f19', 'pgtap-a5f19@example.test', 'pgtap', 'pgTAP A5-F19');

-- Sous le seuil : les échecs s'incrémentent sans verrou.
select is(
  (record_backoffice_auth_failure('pgtap-bo-a5f19', 5, 15))->>'attempts',
  '1', 'A5-F19 : 1er échec → compteur 1');
select is(
  (record_backoffice_auth_failure('pgtap-bo-a5f19', 5, 15))->>'locked',
  'false', 'A5-F19 : 2e échec → pas de verrou');
select is(
  (record_backoffice_auth_failure('pgtap-bo-a5f19', 5, 15))->>'attempts',
  '3', 'A5-F19 : 3e échec → compteur 3');
select is(
  (record_backoffice_auth_failure('pgtap-bo-a5f19', 5, 15))->>'locked',
  'false', 'A5-F19 : 4e échec → toujours pas de verrou');

-- Au seuil : verrou posé ET compteur remis à 0 (repart neuf après expiration).
select is(
  (record_backoffice_auth_failure('pgtap-bo-a5f19', 5, 15))->>'locked',
  'true', 'A5-F19 : 5e échec → verrou posé au seuil');
select is(
  (select locked_until > now() from bo_users where id = 'pgtap-bo-a5f19'),
  true, 'A5-F19 : locked_until futur en base');

-- Flux concurrent pendant le verrou : compteur ET verrou préservés,
-- PAS de prolongation (l'appel ne peut ni ralonger ni déplacer le verrou).
select is(
  (record_backoffice_auth_failure('pgtap-bo-a5f19', 5, 15))->>'attempts',
  '0', 'A5-F19 : échec pendant verrou actif → compteur préservé');
-- Comparaison en timestamptz : la chaîne JSON (ISO 8601) et le ::text
-- Postgres n'ont PAS le même format, la valeur sous-jacente est identique.
select is(
  (select (record_backoffice_auth_failure('pgtap-bo-a5f19', 5, 15))->>'locked_until')::timestamptz,
  (select locked_until from bo_users where id = 'pgtap-bo-a5f19'),
  'A5-F19 : verrou actif non prolongé par un échec concurrent');

-- Succès = remise à zéro (UPDATE atomique de resetFailedAttempts) : le
-- compteur repart de 1 à l'échec suivant.
update bo_users set failed_login_attempts = 0, locked_until = null
where id = 'pgtap-bo-a5f19';
select is(
  (record_backoffice_auth_failure('pgtap-bo-a5f19', 5, 15))->>'attempts',
  '1', 'A5-F19 : après remise à zéro du succès, le compteur repart à 1');

-- Compte inconnu : 0 ligne mise à jour → NULL (fail-open de l'appelant).
select is(
  (record_backoffice_auth_failure('pgtap-bo-inconnu', 5, 15) is null),
  true, 'A5-F19 : compte inconnu → NULL (aucune création de ligne)');

select * from finish();
rollback;
