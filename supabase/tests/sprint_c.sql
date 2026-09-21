-- Tests pgTAP — MODE-942 (Sprint C de l'audit #003 : C-5 + C-6 SQL)
--
-- Couvert ici :
--   1. PF-01/PF-02/PF-03 : les 5 index manquants existent (devices.user_id,
--      sync_conflict_reports(user_id, organization_id),
--      legacy_sales(merchant_id, created_at desc), legacy_sale_items(product_id),
--      cooperative_stock_mouvements(besoin_id)) ;
--   2. S-07 : les RPC coopératives sont service_role SEUL (fin du GRANT
--      authenticated trompeur — deny-all RLS ⇒ 42501 garanti hors route) ;
--   3. I-06 : la distribution clôture le besoin 'livre' DANS la même
--      transaction (fin du couple RPC + PATCH dissociés), avec refus
--      BESOIN_DEJA_LIVRE et BESOIN_INCOHERENT.

begin;
select plan(17);

-- ── 1. Index (PF-01/PF-02/PF-03) ─────────────────────────────────────────
select has_index('public', 'devices', 'idx_devices_user',
  'index devices(user_id) (PF-01 : colonne de policy)');
select has_index('public', 'sync_conflict_reports', 'idx_sync_conflict_reports_user_org',
  'index sync_conflict_reports(user_id, organization_id) (PF-01)');
select has_index('public', 'legacy_sales', 'idx_legacy_sales_merchant_created',
  'index legacy_sales(merchant_id, created_at desc) (PF-03 : GET /sales)');
select has_index('public', 'legacy_sale_items', 'idx_legacy_sale_items_product',
  'index legacy_sale_items(product_id) (PF-02 : FK sans index)');
select has_index('public', 'cooperative_stock_mouvements', 'idx_cooperative_stock_mouvements_besoin',
  'index cooperative_stock_mouvements(besoin_id) (PF-02 : FK sans index)');

-- ── 2. S-07 : RPC coop — service_role seul ──────────────────────────────
select is(has_function_privilege('authenticated',
  'public.coop_apporter_stock(uuid, text, text, text, numeric, text, uuid)', 'EXECUTE'),
  false, 'S-07 : authenticated n''a PAS execute sur coop_apporter_stock');
select is(has_function_privilege('service_role',
  'public.coop_apporter_stock(uuid, text, text, text, numeric, text, uuid)', 'EXECUTE'),
  true, 'S-07 : service_role garde execute sur coop_apporter_stock');
select is(has_function_privilege('authenticated',
  'public.coop_distribuer_stock(uuid, text, text, numeric, text, jsonb, uuid, uuid)', 'EXECUTE'),
  false, 'S-07 : authenticated n''a PAS execute sur coop_distribuer_stock');
select is(has_function_privilege('service_role',
  'public.coop_distribuer_stock(uuid, text, text, numeric, text, jsonb, uuid, uuid)', 'EXECUTE'),
  true, 'S-07 : service_role garde execute sur coop_distribuer_stock');

-- ── 3. I-06 : distribution → besoin 'livre' atomique ────────────────────
-- Fixtures isolées (préfixe sprintc-).
insert into public.cooperateurs (id, first_name, phone, auth_method)
values ('sprintc-resp-1', 'Presida', '+2250788880001', 'pin');
insert into public.merchants (id, first_name, phone)
values ('sprintc-marchand-1', 'Marchanda', '+2250788880101');
insert into public.cooperatives (id, nom, responsable_id)
values ('ccccccc1-0000-0000-0000-000000000001', 'Coop Sprint C', 'sprintc-resp-1');

-- Apport de 8 kg de manioc au pot commun.
select is(
  (public.coop_apporter_stock('ccccccc1-0000-0000-0000-000000000001', 'sprintc-marchand-1',
                              'Manioc', null, 8, 'kg',
                              '55555555-0000-0000-0000-000000000001')->>'rejeu'),
  'false', 'I-06 : apport initial 8 kg de manioc'
);

-- Besoin du marchand, pris en charge (en_cours) — le flux réel de l'écran.
insert into public.cooperative_besoins
  (cooperative_id, marchand_id, produit, quantite, unite, statut)
values
  ('ccccccc1-0000-0000-0000-000000000001', 'sprintc-marchand-1', 'Manioc', 5, 'kg', 'en_cours');

select is(
  (public.coop_distribuer_stock('ccccccc1-0000-0000-0000-000000000001', 'sprintc-marchand-1',
                                'Manioc', 5, 'kg',
                                '[{"membreId":"sprintc-marchand-1","quantite":5}]'::jsonb,
                                (select id from public.cooperative_besoins
                                 where cooperative_id = 'ccccccc1-0000-0000-0000-000000000001'
                                   and produit = 'Manioc'),
                                '66666666-0000-0000-0000-000000000001')->>'rejeu'),
  'false', 'I-06 : distribution liée au besoin acceptée'
);
select is(
  (select statut from public.cooperative_besoins
   where cooperative_id = 'ccccccc1-0000-0000-0000-000000000001' and produit = 'Manioc'),
  'livre', 'I-06 : le besoin est clôturé ''livre'' DANS la transaction de distribution'
);
select is(
  (select quantite from public.cooperative_stock
   where cooperative_id = 'ccccccc1-0000-0000-0000-000000000001' and produit = 'Manioc'),
  3::numeric, 'I-06 : stock décrémenté de la même transaction (8 − 5 = 3 kg)'
);

-- Re-distribution du même besoin : refus lisible BESOIN_DEJA_LIVRE.
select throws_ok(
  $$select public.coop_distribuer_stock('ccccccc1-0000-0000-0000-000000000001', 'sprintc-marchand-1',
                                        'Manioc', 1, 'kg',
                                        '[{"membreId":"sprintc-marchand-1","quantite":1}]'::jsonb,
                                        (select id from public.cooperative_besoins
                                         where cooperative_id = 'ccccccc1-0000-0000-0000-000000000001'
                                           and produit = 'Manioc'), null)$$,
  'P0001', 'BESOIN_DEJA_LIVRE',
  'I-06 : un besoin déjà livré ne peut pas être re-distribué (fin du re-doublement)'
);

-- Incohérence produit/unité : refus lisible BESOIN_INCOHERENT.
insert into public.cooperative_besoins
  (cooperative_id, marchand_id, produit, quantite, unite, statut)
values
  ('ccccccc1-0000-0000-0000-000000000001', 'sprintc-marchand-1', 'Riz', 2, 'sac', 'en_cours');
select throws_ok(
  $$select public.coop_distribuer_stock('ccccccc1-0000-0000-0000-000000000001', 'sprintc-marchand-1',
                                        'Manioc', 1, 'kg',
                                        '[{"membreId":"sprintc-marchand-1","quantite":1}]'::jsonb,
                                        (select id from public.cooperative_besoins
                                         where cooperative_id = 'ccccccc1-0000-0000-0000-000000000001'
                                           and produit = 'Riz'), null)$$,
  'P0001', 'BESOIN_INCOHERENT',
  'I-06 : une distribution ne correspondant pas au besoin (produit) est refusée'
);

select * from finish();
rollback;
