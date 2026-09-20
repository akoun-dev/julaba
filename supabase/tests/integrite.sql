-- Tests pgTAP — MODE-935 (Sprint B de l'audit #003) : intégrité
-- producteur / coopérative.
--
-- Couvert ici (le reste est couvert par les vitest) :
--   1. I-12 : CHECKs d'union sur récoltes/commandes (statut hors UI
--      physiquement imposible, même par PATCH direct) ;
--   2. I-08 : colonnes client_id + index uniques partiels (le rejeu
--      concurrent d'une trésorerie/besoin/cotisation ne double-compte
--      plus : le premier commit gagne, le second est refusé en 23505) ;
--   3. I-11/PF-02 : index cooperative_transactions(membre_id) ;
--   4. I-05/I-07 : RPC du pot commun — idempotence APRES le verrou
--      (rejeu reconnu, stock compté une seule fois) et refus lisible
--      UNITE_DIFFERENTE à l'apport comme à la distribution.

begin;
select plan(19);

-- ── 1. I-12 : unions de statuts verrouillées en base ─────────────────────
select is(
  (select count(*) from pg_catalog.pg_constraint
   where conname = 'legacy_producteur_recoltes_statut_check'
     and conrelid = 'public.legacy_producteur_recoltes'::regclass
     and contype = 'c'),
  1::bigint, 'CHECK recoltes.statut : union brouillon|publiee|disponible|vendue verrouillée'
);
select throws_ok(
  $$insert into public.legacy_producteur_recoltes (producteur_id, produit, quantite_kg, qualite, date_recolte, statut)
    values ('integ-prod-1', 'Test', 1, 'standard', now(), 'archivee')$$,
  '23514', 'CHECK recoltes.statut : un statut hors UI est physiquement refusé'
);
select is(
  (select count(*) from pg_catalog.pg_constraint
   where conname = 'legacy_producteur_commandes_statut_check'
     and conrelid = 'public.legacy_producteur_commandes'::regclass
     and contype = 'c'),
  1::bigint, 'CHECK commandes.statut : union a_traiter|en_attente|confirmee|en_cours|livree|refusee verrouillée'
);
select throws_ok(
  $$insert into public.legacy_producteur_commandes (producteur_id, reference, acheteur_nom, produit, statut)
    values ('integ-prod-1', 'INTEG-1', 'Awa', 'Maïs', 'perdue')$$,
  '23514', 'CHECK commandes.statut : un statut hors UI est physiquement refusé'
);

-- ── 2. I-08 : colonnes client_id ─────────────────────────────────────────
select col_type_is('public', 'cooperative_transactions', 'client_id', 'text',
  'colonne cooperative_transactions.client_id : text');
select col_type_is('public', 'cooperative_besoins', 'client_id', 'text',
  'colonne cooperative_besoins.client_id : text');

-- ── 3. Index (I-08 + I-11/PF-02) ─────────────────────────────────────────
select has_index('public', 'uniq_coop_transactions_client',
  'index unique partiel transactions (cooperative_id, client_id) où client_id non null');
select has_index('public', 'uniq_coop_besoins_client',
  'index unique partiel besoins (cooperative_id, client_id) où client_id non null');
select has_index('public', 'idx_cooperative_transactions_membre',
  'index cooperative_transactions(membre_id) (PF-02, unicité annuelle cotisation)');

-- ── 4. Fixtures (isolées des autres fichiers de tests) ──────────────────
insert into public.cooperateurs (id, first_name, phone, auth_method)
values ('integ-resp-1', 'Responsa', '+2250799990001', 'pin');
insert into public.merchants (id, first_name, phone)
values ('integ-marchand-1', 'Membra', '+2250799990101');
insert into public.cooperatives (id, nom, responsable_id)
values ('bbbbbbb1-0000-0000-0000-000000000001', 'Coop Integ', 'integ-resp-1');

-- ── 5. I-08 : l'unicité (cooperative_id, client_id) tient en base ───────
insert into public.cooperative_transactions
  (cooperative_id, type, categorie, montant, description, statut, client_id)
values
  ('bbbbbbb1-0000-0000-0000-000000000001', 'entree', 'frais', 1000, 'premiere', 'en_attente',
   '11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$insert into public.cooperative_transactions
      (cooperative_id, type, categorie, montant, description, statut, client_id)
    values ('bbbbbbb1-0000-0000-0000-000000000001', 'entree', 'frais', 1000, 'doublon', 'en_attente',
            '11111111-1111-1111-1111-111111111111')$$,
  '23505', 'UNIQUE transactions.client_id : deux rejeus concurrents ne double-comptent pas'
);
insert into public.cooperative_besoins
  (cooperative_id, marchand_id, produit, quantite, client_id)
values
  ('bbbbbbb1-0000-0000-0000-000000000001', 'integ-marchand-1', 'Huile', 2,
   '22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$insert into public.cooperative_besoins
      (cooperative_id, marchand_id, produit, quantite, client_id)
    values ('bbbbbbb1-0000-0000-0000-000000000001', 'integ-marchand-1', 'Huile', 2,
            '22222222-2222-2222-2222-222222222222')$$,
  '23505', 'UNIQUE besoins.client_id : deux rejeus concurrents ne recréent pas le besoin'
);

-- ── 6. I-05/I-07 : RPC du pot commun — verrou avant idempotence, unité
--      verrouillée ──────────────────────────────────────────────────────
-- Apport initial : 10 kg de riz (client_id #3333).
select is(
  (public.coop_apporter_stock('bbbbbbb1-0000-0000-0000-000000000001', 'integ-marchand-1',
                              'Riz', null, 10, 'kg',
                              '33333333-3333-3333-3333-333333333333')->>'rejeu'),
  'false', 'apport initial : premier passage (rejeu=false)'
);
select is(
  (select quantite from public.cooperative_stock
   where cooperative_id = 'bbbbbbb1-0000-0000-0000-000000000001' and produit = 'Riz'),
  10::numeric, 'apport initial : stock = 10 kg'
);
-- Rejeu du MÊME client_id : reconnu APRÈS verrou, rien n'est re-compté.
select is(
  (public.coop_apporter_stock('bbbbbbb1-0000-0000-0000-000000000001', 'integ-marchand-1',
                              'Riz', null, 10, 'kg',
                              '33333333-3333-3333-3333-333333333333')->>'rejeu'),
  'true', 'rejeu du même client_id : reconnu (verrou avant test, I-07)'
);
select is(
  (select quantite from public.cooperative_stock
   where cooperative_id = 'bbbbbbb1-0000-0000-0000-000000000001' and produit = 'Riz'),
  10::numeric, 'rejeu : stock TOUJOURS 10 kg — jamais de double comptage'
);
-- Unité différente à l'apport : refus lisible (I-05), pas d'écrasement.
select throws_ok(
  $$select public.coop_apporter_stock('bbbbbbb1-0000-0000-0000-000000000001', 'integ-marchand-1',
                                      'Riz', null, 2, 'sac', null)$$,
  'P0001', 'UNITE_DIFFERENTE',
  'apport en sacs sur une ligne comptée en kg : refusé (5 kg + 3 sacs ≠ 8 sacs)'
);
-- Distribution en kg (unité de la ligne) : acceptée, stock décrémenté.
select lives_ok(
  $$select public.coop_distribuer_stock('bbbbbbb1-0000-0000-0000-000000000001', 'integ-marchand-1',
                                        'Riz', 3, 'kg',
                                        '[{"membreId":"integ-marchand-1","quantite":3}]'::jsonb,
                                        null, '44444444-4444-4444-4444-444444444444')$$,
  'distribution de 3 kg (unité de la ligne) : acceptée'
);
select is(
  (select quantite from public.cooperative_stock
   where cooperative_id = 'bbbbbbb1-0000-0000-0000-000000000001' and produit = 'Riz'),
  7::numeric, 'distribution : stock = 7 kg'
);
-- Distribution dans une autre unité : refus lisible (garde symétrique).
select throws_ok(
  $$select public.coop_distribuer_stock('bbbbbbb1-0000-0000-0000-000000000001', 'integ-marchand-1',
                                        'Riz', 1, 'sac',
                                        '[{"membreId":"integ-marchand-1","quantite":1}]'::jsonb, null, null)$$,
  'P0001', 'UNITE_DIFFERENTE',
  'distribution en sacs sur une ligne comptée en kg : refusée'
);

select * from finish();
rollback;
