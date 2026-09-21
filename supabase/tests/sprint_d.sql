-- Tests pgTAP — MODE-946 (Sprint D de l'audit #003 : D-2 SQL)
--
-- Couvert ici :
--   1. La machine à états des besoins coopératifs est alignée sur le flux
--      réel (F-14) : le CHECK n'admet plus le statut fantôme 'approuve'
--      (jamais posé par le client ni par la RPC — la distribution clôture
--      directement 'livre', MODE-942).
--   2. Les statuts réels restent admis (en_attente, en_cours, consolide,
--      livre).

begin;
select plan(8);

select has_check('public', 'cooperative_besoins', 'cooperative_besoins_statut_check',
  'MODE-946 : la contrainte de statuts existe');

-- Fixtures isolées (préfixe sprintd-).
insert into public.cooperateurs (id, first_name, phone, auth_method)
values ('sprintd-resp-1', 'Presido', '+2250788881001', 'pin');
insert into public.merchants (id, first_name, phone)
values ('sprintd-marchand-1', 'Marchando', '+2250788881101');
insert into public.cooperatives (id, nom, responsable_id)
values ('ccccccc1-0000-0000-0000-0000000000d1', 'Coop Sprint D', 'sprintd-resp-1');

-- 1. Statut réel accepté (en_attente).
select lives_ok(
  $t$insert into public.cooperative_besoins (cooperative_id, marchand_id, produit, quantite, unite, statut)
  values ('ccccccc1-0000-0000-0000-0000000000d1', 'sprintd-marchand-1', 'Manioc', 5, 'kg', 'en_attente')$t$,
  'MODE-946 : en_attente reste admis');

-- 2. Le statut fantôme 'approuve' est désormais REFUSÉ (F-14 : jamais posé
--    dans le flux réel — la machine ne le ment plus).
select throws_ok(
  $t$insert into public.cooperative_besoins (cooperative_id, marchand_id, produit, quantite, unite, statut)
  values ('ccccccc1-0000-0000-0000-0000000000d1', 'sprintd-marchand-1', 'Riz', 10, 'kg', 'approuve')$t$,
  '23514',
  'MODE-946 : approuve viole cooperative_besoins_statut_check (statut fantôme retiré)');

-- 3. Les autres statuts réels restent admis (le besoin déposé traverse la
--    machine réelle jusqu'à 'livre').
select lives_ok(
  $t$update public.cooperative_besoins set statut = 'en_cours'
  where cooperative_id = 'ccccccc1-0000-0000-0000-0000000000d1' and produit = 'Manioc'$t$,
  'MODE-946 : en_cours reste admis');
select lives_ok(
  $t$update public.cooperative_besoins set statut = 'consolide'
  where cooperative_id = 'ccccccc1-0000-0000-0000-0000000000d1' and produit = 'Manioc'$t$,
  'MODE-946 : consolide reste admis');
select lives_ok(
  $t$update public.cooperative_besoins set statut = 'livre'
  where cooperative_id = 'ccccccc1-0000-0000-0000-0000000000d1' and produit = 'Manioc'$t$,
  'MODE-946 : livre reste admis');

select * from finish();
rollback;

-- ── S-11 (MODE-949) : révocation applicative des sessions appareil ──────
select has_column('public', 'device_sessions', 'revoked_at',
  'S-11 : device_sessions porte revoked_at (révocation traçable)');
select has_index('public', 'device_sessions', 'idx_device_sessions_revoked_at',
  'S-11 : index sur revoked_at (garde à chaque requête)');

select * from finish();
rollback;
