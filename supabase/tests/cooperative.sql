-- Tests pgTAP — Module Coopérative (MODE-921/922)
-- Invariants vérifiés : 7 tables + RLS deny-all (aucune policy publique),
-- signatures RPC pot commun, colonne actif (miroir de statut — trigger
-- MODE-922), index unique partiel « une seule adhésion active par
-- marchand » (uniq_coop_membre_actif), CHECKs de statut/signe, pot commun
-- (apport idempotent client_id, refus strict du dépassement, un mouvement
-- par destinataire), isolation inter-coopératives au niveau stock, FK
-- besoin_id (SET NULL).
--
-- La concurrence réelle (verrou SELECT … FOR UPDATE) et l'isolation
-- applicative (résolveur serveur, garde des destinataires) sont couvertes
-- par les routes API + les vitest ; pgTAP valide ici la sémantique SQL.

begin;
select plan(58);

-- ── 1. Tables ────────────────────────────────────────────────────────────
select has_table('public', 'cooperateurs', 'table cooperateurs existe');
select has_table('public', 'cooperatives', 'table cooperatives existe');
select has_table('public', 'cooperative_membres', 'table cooperative_membres existe');
select has_table('public', 'cooperative_transactions', 'table cooperative_transactions existe');
select has_table('public', 'cooperative_stock', 'table cooperative_stock existe');
select has_table('public', 'cooperative_stock_mouvements', 'table cooperative_stock_mouvements existe');
select has_table('public', 'cooperative_besoins', 'table cooperative_besoins existe');

-- ── 2. RLS activé (deny-all : tout passe par les routes service_role) ───
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.cooperateurs'::regclass), true, 'RLS activé sur cooperateurs');
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.cooperatives'::regclass), true, 'RLS activé sur cooperatives');
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.cooperative_membres'::regclass), true, 'RLS activé sur cooperative_membres');
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.cooperative_transactions'::regclass), true, 'RLS activé sur cooperative_transactions');
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.cooperative_stock'::regclass), true, 'RLS activé sur cooperative_stock');
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.cooperative_stock_mouvements'::regclass), true, 'RLS activé sur cooperative_stock_mouvements');
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.cooperative_besoins'::regclass), true, 'RLS activé sur cooperative_besoins');

-- ── 3. RPC transactionnelles du pot commun ──────────────────────────────
select has_function('public', 'coop_apporter_stock', ARRAY['uuid','text','text','text','numeric','text','uuid'], 'RPC coop_apporter_stock existe');
select has_function('public', 'coop_distribuer_stock', ARRAY['uuid','text','text','numeric','text','jsonb','uuid','uuid'], 'RPC coop_distribuer_stock existe');

-- ── 4. MODE-922 : colonne actif + trigger + index + FK ──────────────────
select col_type_is('public', 'cooperative_membres', 'actif', 'boolean', 'colonne actif : boolean');
select col_not_null('public', 'cooperative_membres', 'actif', 'colonne actif : NOT NULL');
select col_default_is('public', 'cooperative_membres', 'actif', 'true', 'colonne actif : défaut true');
select has_trigger('public', 'cooperative_membres', 'trg_cooperative_membres_sync_actif', 'trigger trg_cooperative_membres_sync_actif présent');
select has_index('public', 'uniq_coop_membre_actif', 'index unique partiel uniq_coop_membre_actif (une seule adhésion active)');
select has_index('public', 'idx_cooperative_membres_membre', 'index idx_cooperative_membres_membre (membre_id, actif)');
select is(
  (select count(*) from pg_catalog.pg_constraint
   where conname = 'cooperative_stock_mouvements_besoin_id_fkey'
     and conrelid = 'public.cooperative_stock_mouvements'::regclass
     and contype = 'f'),
  1::bigint, 'FK cooperative_stock_mouvements.besoin_id → cooperative_besoins (MODE-922)'
);

-- ── 5. Données de test ──────────────────────────────────────────────────
insert into public.cooperateurs (id, first_name, phone, auth_method)
values
  ('coop-test-resp-a', 'Responsa', '+2250788880001', 'pin'),
  ('coop-test-resp-b', 'Responsb', '+2250788880002', 'pin')
on conflict (id) do nothing;
insert into public.merchants (id, first_name, phone)
values
  ('coop-test-marchand-1', 'Membra', '+2250788880101'),
  ('coop-test-marchand-2', 'Membrb', '+2250788880102'),
  ('coop-test-marchand-3', 'Membrc', '+2250788880103')
on conflict (id) do nothing;
insert into public.cooperatives (id, nom, responsable_id)
values
  ('aaaaaaa1-0000-0000-0000-000000000001', 'Coop Test A', 'coop-test-resp-a'),
  ('aaaaaaa1-0000-0000-0000-000000000002', 'Coop Test B', 'coop-test-resp-b')
on conflict (id) do nothing;

-- Le trigger dérive actif du statut : en_attente → false, actif → true.
insert into public.cooperative_membres (cooperative_id, membre_id, statut)
values ('aaaaaaa1-0000-0000-0000-000000000001', 'coop-test-marchand-1', 'en_attente');
select is((select actif from public.cooperative_membres where membre_id = 'coop-test-marchand-1'), false, 'trigger : en_attente → actif = false');
update public.cooperative_membres set statut = 'actif' where membre_id = 'coop-test-marchand-1';
select is((select actif from public.cooperative_membres where membre_id = 'coop-test-marchand-1'), true, 'trigger : statut actif → actif = true');
update public.cooperative_membres set statut = 'suspendu' where membre_id = 'coop-test-marchand-1';
select is((select actif from public.cooperative_membres where membre_id = 'coop-test-marchand-1'), false, 'trigger : statut suspendu → actif = false');
update public.cooperative_membres set statut = 'actif' where membre_id = 'coop-test-marchand-1';
select is((select actif from public.cooperative_membres where membre_id = 'coop-test-marchand-1'), true, 'trigger : réactivation → actif = true');

-- Autres membres de référence (m2 actif dans A, m3 actif dans B).
insert into public.cooperative_membres (cooperative_id, membre_id, statut)
values
  ('aaaaaaa1-0000-0000-0000-000000000001', 'coop-test-marchand-2', 'actif'),
  ('aaaaaaa1-0000-0000-0000-000000000002', 'coop-test-marchand-3', 'actif');

-- ── 6. CHECKs : statuts, rôles, signes ──────────────────────────────────
select throws_ok($$insert into public.cooperative_membres (cooperative_id, membre_id, statut) values ('aaaaaaa1-0000-0000-0000-000000000001', 'coop-test-marchand-2', 'futur')$$, '23514', 'CHECK membres.statut : valeur inconnue refusée');
select throws_ok($$insert into public.cooperative_membres (cooperative_id, membre_id, statut, role) values ('aaaaaaa1-0000-0000-0000-000000000001', 'coop-test-marchand-2', 'actif', 'roi')$$, '23514', 'CHECK membres.role : rôle inconnu refusé');
select throws_ok($$insert into public.cooperative_transactions (cooperative_id, type, montant, membre_id) values ('aaaaaaa1-0000-0000-0000-000000000001', 'je-ne-sais-pas', 100, 'coop-test-marchand-1')$$, '23514', 'CHECK transactions.type : entree|sortie uniquement');
select throws_ok($$insert into public.cooperative_transactions (cooperative_id, type, montant, membre_id) values ('aaaaaaa1-0000-0000-0000-000000000001', 'entree', 0, 'coop-test-marchand-1')$$, '23514', 'CHECK transactions.montant > 0 : zéro et négatif refusés');
select throws_ok($$insert into public.cooperative_transactions (cooperative_id, type, montant, membre_id, statut) values ('aaaaaaa1-0000-0000-0000-000000000001', 'entree', 100, 'coop-test-marchand-1', 'peut-etre')$$, '23514', 'CHECK transactions.statut : en_attente|validee|annulee uniquement');
select throws_ok($$insert into public.cooperative_stock (cooperative_id, produit, quantite, unite) values ('aaaaaaa1-0000-0000-0000-000000000001', 'Tomate', -1, 'kg')$$, '23514', 'CHECK stock.quantite >= 0 : le stock négatif est physiquement impossible');
select throws_ok($$insert into public.cooperative_stock_mouvements (cooperative_id, produit, unite, type, quantite, membre_id) values ('aaaaaaa1-0000-0000-0000-000000000001', 'Tomate', 'kg', 'apport', 0, 'coop-test-marchand-1')$$, '23514', 'CHECK mouvements.quantite > 0 : zéro refusé');
select throws_ok($$insert into public.cooperative_stock_mouvements (cooperative_id, produit, unite, type, quantite, membre_id) values ('aaaaaaa1-0000-0000-0000-000000000001', 'Tomate', 'kg', 'vol', 1, 'coop-test-marchand-1')$$, '23514', 'CHECK mouvements.type : apport|distribution uniquement');
select throws_ok($$insert into public.cooperative_besoins (cooperative_id, marchand_id, produit, quantite, unite) values ('aaaaaaa1-0000-0000-0000-000000000001', 'coop-test-marchand-1', 'Huile', 0, 'bidon')$$, '23514', 'CHECK besoins.quantite > 0 : zéro refusé');
select throws_ok($$insert into public.cooperative_besoins (cooperative_id, marchand_id, produit, quantite, unite, priorite) values ('aaaaaaa1-0000-0000-0000-000000000001', 'coop-test-marchand-1', 'Huile', 2, 'bidon', 'hier')$$, '23514', 'CHECK besoins.priorite : normale|urgente uniquement');
select throws_ok($$insert into public.cooperative_besoins (cooperative_id, marchand_id, produit, quantite, unite, statut) values ('aaaaaaa1-0000-0000-0000-000000000001', 'coop-test-marchand-1', 'Huile', 2, 'bidon', 'perdu')$$, '23514', 'CHECK besoins.statut : valeur inconnue refusée');

-- ── 7. Invariant « une seule adhésion active » (MODE-922) ───────────────
-- m1 est déjà actif dans la coop A : une adhésion active dans B est
-- impossible au niveau SQL (filet anti-course des routes 409).
select throws_ok($$insert into public.cooperative_membres (cooperative_id, membre_id, statut) values ('aaaaaaa1-0000-0000-0000-000000000002', 'coop-test-marchand-1', 'actif')$$, '23505', 'uniq_coop_membre_actif : un marchand ne peut pas être actif dans DEUX coopératives');

-- ── 8. Pot commun (RPC) : apport idempotent, refus du dépassement, ──────
--      un mouvement par destinataire, isolation inter-coopératives, FK.
select lives_ok(
  $$select public.coop_apporter_stock('aaaaaaa1-0000-0000-0000-000000000001', 'coop-test-marchand-1', 'Riz', 'cereales', 10, 'kg', 'bbbbbbb1-0000-0000-0000-000000000001')$$,
  'apport : 10 kg de riz dans le pot commun A'
);
select is(
  (select quantite from public.cooperative_stock where cooperative_id = 'aaaaaaa1-0000-0000-0000-000000000001' and produit = 'Riz'),
  10::numeric, 'apport : la ligne courante A/Riz vaut 10 (upsert, pas de doublon)'
);
select lives_ok(
  $$select public.coop_apporter_stock('aaaaaaa1-0000-0000-0000-000000000001', 'coop-test-marchand-1', 'Riz', 'cereales', 10, 'kg', 'bbbbbbb1-0000-0000-0000-000000000001')$$,
  'rejeu : MÊME client_id rejoué (offline flush)'
);
select is(
  (select quantite from public.cooperative_stock where cooperative_id = 'aaaaaaa1-0000-0000-0000-000000000001' and produit = 'Riz'),
  10::numeric, 'idempotence : le rejeu du même client_id ne compte PAS deux fois'
);
select lives_ok(
  $$select public.coop_apporter_stock('aaaaaaa1-0000-0000-0000-000000000001', 'coop-test-marchand-2', 'Riz', 'cereales', 5, 'kg', 'bbbbbbb1-0000-0000-0000-000000000002')$$,
  'apport : 5 kg de plus (autre client_id)'
);
select is(
  (select quantite from public.cooperative_stock where cooperative_id = 'aaaaaaa1-0000-0000-0000-000000000001' and produit = 'Riz'),
  15::numeric, 'apport additif : la ligne courante vaut 15'
);
select throws_ok(
  $$select public.coop_apporter_stock('aaaaaaa1-0000-0000-0000-000000000001', 'coop-test-marchand-1', 'Riz', 'cereales', 0, 'kg', 'bbbbbbb1-0000-0000-0000-000000000003')$$,
  'P0001', 'QUANTITE_INVALIDE', 'apport : quantité nulle refusée'
);
select throws_ok(
  $$select public.coop_distribuer_stock('aaaaaaa1-0000-0000-0000-000000000001', 'coop-test-marchand-1', 'Riz', 99, 'kg', '[{"membreId":"coop-test-marchand-1","quantite":99}]'::jsonb, null, 'ccccccc1-0000-0000-0000-000000000001')$$,
  'P0001', 'STOCK_INSUFFISANT', 'refus strict : 99 demandés > 15 disponibles — jamais de stock négatif'
);
select is(
  (select quantite from public.cooperative_stock where cooperative_id = 'aaaaaaa1-0000-0000-0000-000000000001' and produit = 'Riz'),
  15::numeric, 'refus intégral : le refus ne modifie RIEN (pas de distribution partielle)'
);
select lives_ok(
  $$select public.coop_distribuer_stock('aaaaaaa1-0000-0000-0000-000000000001', 'coop-test-marchand-1', 'Riz', 6, 'kg', '[{"membreId":"coop-test-marchand-1","quantite":4},{"membreId":"coop-test-marchand-2","quantite":2}]'::jsonb, null, 'ccccccc1-0000-0000-0000-000000000002')$$,
  'distribution multi-membres : 4 à m1 + 2 à m2 sur 15 disponibles'
);
select is(
  (select quantite from public.cooperative_stock where cooperative_id = 'aaaaaaa1-0000-0000-0000-000000000001' and produit = 'Riz'),
  9::numeric, 'distribution : la ligne courante est décrémentée (15 − 6 = 9)'
);
select is(
  (select count(*) from public.cooperative_stock_mouvements
   where cooperative_id = 'aaaaaaa1-0000-0000-0000-000000000001' and type = 'distribution' and membre_id = 'coop-test-marchand-1'),
  1::bigint, 'trace nominative : UN mouvement distribution pour m1'
);
select is(
  (select count(*) from public.cooperative_stock_mouvements
   where cooperative_id = 'aaaaaaa1-0000-0000-0000-000000000001' and type = 'distribution' and membre_id = 'coop-test-marchand-2'),
  1::bigint, 'trace nominative : UN mouvement distribution pour m2'
);
select is(
  (select count(*) from public.cooperative_stock where cooperative_id = 'aaaaaaa1-0000-0000-0000-000000000002'),
  0::bigint, 'isolation : les opérations de la coop A n''ont rien écrit dans la coop B'
);
select throws_ok(
  $$insert into public.cooperative_stock_mouvements (cooperative_id, produit, unite, type, quantite, membre_id, besoin_id) values ('aaaaaaa1-0000-0000-0000-000000000001', 'Riz', 'kg', 'distribution', 1, 'coop-test-marchand-1', 'ddddddd1-0000-0000-0000-000000000099')$$,
  '23503', 'FK besoin_id : un mouvement ne référence pas un besoin fantôme'
);
insert into public.cooperative_besoins (id, cooperative_id, marchand_id, produit, quantite, unite)
values ('ddddddd1-0000-0000-0000-000000000001', 'aaaaaaa1-0000-0000-0000-000000000001', 'coop-test-marchand-1', 'Riz', 3, 'kg');
select lives_ok(
  $$insert into public.cooperative_stock_mouvements (cooperative_id, produit, unite, type, quantite, membre_id, besoin_id) values ('aaaaaaa1-0000-0000-0000-000000000001', 'Riz', 'kg', 'apport', 1, 'coop-test-marchand-1', 'ddddddd1-0000-0000-0000-000000000001')$$,
  'mouvement lié à un besoin réel : accepté'
);
select lives_ok($$delete from public.cooperative_besoins where id = 'ddddddd1-0000-0000-0000-000000000001'$$, 'suppression du besoin : autorisée');
select is(
  (select besoin_id from public.cooperative_stock_mouvements where besoin_id = 'ddddddd1-0000-0000-0000-000000000001'),
  null, 'FK ON DELETE SET NULL : la trace du pot commun survit au besoin supprimé'
);
select throws_ok(
  $$insert into public.cooperative_stock (cooperative_id, produit, quantite, unite) values ('aaaaaaa1-0000-0000-0000-000000000001', 'Riz', 2, 'kg')$$,
  '23505', 'UNIQUE (cooperative_id, produit) : une ligne courante par produit'
);

select * from finish();
rollback;
