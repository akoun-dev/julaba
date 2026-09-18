-- Tests pgTAP — Système de stock marchand (STK-802/803, Task 62)
-- Invariants vérifiés : CHECK ≥ 0 (stock négatif physiquement impossible),
-- refus strict INSUFFICIENT_STOCK (vente ≤ / = / > stock, stock 0),
-- idempotence (merchant_id, operation_id), append-only du journal,
-- raison obligatoire pour les sorties anormales, coût moyen pondéré,
-- ajustement au comptage (delta tracé, jamais d'écrasement),
-- produit non suivi (comportement actuel préservé, D7).
--
-- La concurrence multi-connexions (7 + 5 sur 10 → jamais −2) repose sur
-- SELECT … FOR UPDATE + le CHECK ≥ 0 ; pgTAP est mono-connexion, le test
-- séquentiel ci-dessous valide la sémantique de refus, le CHECK ≥ 0 est
-- le dernier rempart physique.

begin;
select plan(71);

-- ── 1. Tables nouvelles ──────────────────────────────────────────────────
select has_table('public', 'business_partners', 'table business_partners existe');
select has_table('public', 'merchant_product_units', 'table merchant_product_units existe');
select has_table('public', 'merchant_product_prices', 'table merchant_product_prices existe');
select has_table('public', 'merchant_stock_balances', 'table merchant_stock_balances existe');
select has_table('public', 'merchant_stock_movements', 'table merchant_stock_movements existe');
select has_table('public', 'merchant_purchases', 'table merchant_purchases existe');
select has_table('public', 'merchant_purchase_items', 'table merchant_purchase_items existe');
select has_table('public', 'merchant_stock_transfers', 'table merchant_stock_transfers existe');
select has_table('public', 'merchant_stock_transfer_items', 'table merchant_stock_transfer_items existe');

-- ── 2. Tier service_role : RLS activé, aucune policy publique ───────────
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.business_partners'::regclass), true, 'RLS activé sur business_partners');
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.merchant_product_units'::regclass), true, 'RLS activé sur merchant_product_units');
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.merchant_product_prices'::regclass), true, 'RLS activé sur merchant_product_prices');
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.merchant_stock_balances'::regclass), true, 'RLS activé sur merchant_stock_balances');
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.merchant_stock_movements'::regclass), true, 'RLS activé sur merchant_stock_movements');
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.merchant_purchases'::regclass), true, 'RLS activé sur merchant_purchases');
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.merchant_purchase_items'::regclass), true, 'RLS activé sur merchant_purchase_items');
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.merchant_stock_transfers'::regclass), true, 'RLS activé sur merchant_stock_transfers');
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.merchant_stock_transfer_items'::regclass), true, 'RLS activé sur merchant_stock_transfer_items');

-- ── 3. RPC transactionnelles ────────────────────────────────────────────
select has_function('public', 'merchant_record_sale', ARRAY['text','uuid','text','jsonb','bigint','boolean','text','text','text'], 'RPC merchant_record_sale existe');
select has_function('public', 'merchant_record_purchase', ARRAY['text','uuid','text','jsonb','text','bigint','text','text','boolean','text'], 'RPC merchant_record_purchase existe');
select has_function('public', 'merchant_record_movement', ARRAY['text','uuid','text','text','text','numeric','numeric','text','text','text','text','text'], 'RPC merchant_record_movement existe');
select has_function('public', 'merchant_adjust_to_count', ARRAY['text','uuid','text','text','numeric','text'], 'RPC merchant_adjust_to_count existe');
select has_function('public', 'merchant_backfill_opening_balances', ARRAY[]::text[], 'RPC merchant_backfill_opening_balances existe');

-- ── 4. Données de test ──────────────────────────────────────────────────
insert into public.merchants (id, first_name, phone)
values ('stk-test-marchand', 'Testa', '+2250799999999')
on conflict (id) do nothing;
insert into public.legacy_products (id, merchant_id, name, stock_qty) values
  ('stk-test-tomates', 'stk-test-marchand', 'Tomates', 10),
  ('stk-test-oignons', 'stk-test-marchand', 'Oignons', 84),
  ('stk-test-riz',     'stk-test-marchand', 'Riz', 5);

-- ── 5. Backfill OPENING_BALANCE (§40) : idempotent, rejouable ───────────
select lives_ok($$select public.merchant_backfill_opening_balances()$$, 'backfill : exécution OK');
select is((select quantity_base from public.merchant_stock_balances where merchant_id = 'stk-test-marchand' and product_id = 'stk-test-tomates'), 10::numeric, 'backfill : balance tomates = 10 (stock legacy)');
select is((select count(*) from public.merchant_stock_movements where merchant_id = 'stk-test-marchand' and movement_type = 'OPENING_BALANCE'), 2::bigint, 'backfill : 2 mouvements OPENING_BALANCE (stock nul exclu)');
select lives_ok($$select public.merchant_backfill_opening_balances()$$, 'backfill : rejeu OK (idempotent)');
select is((select count(*) from public.merchant_stock_movements where merchant_id = 'stk-test-marchand' and movement_type = 'OPENING_BALANCE'), 2::bigint, 'backfill idempotent : toujours 2 mouvements');
select is((select count(*) from public.merchant_stock_balances where merchant_id = 'stk-test-marchand'), 3::bigint, 'backfill idempotent : toujours 3 balances');

-- ── 6. Contraintes physiques du stock ───────────────────────────────────
select throws_ok($$update public.merchant_stock_balances set quantity_base = -1 where merchant_id = 'stk-test-marchand' and product_id = 'stk-test-tomates'$$, '23514', 'CHECK ≥ 0 : le stock négatif est physiquement impossible');
select throws_ok($$insert into public.merchant_stock_movements (merchant_id, product_id, movement_type, quantity_base, operation_id, created_by) values ('stk-test-marchand', 'stk-test-tomates', 'SALE', 5, gen_random_uuid(), 'stk-test-marchand')$$, '23514', 'CHECK signe : une vente est strictement négative');
select throws_ok($$insert into public.merchant_stock_movements (merchant_id, product_id, movement_type, quantity_base, operation_id, created_by) values ('stk-test-marchand', 'stk-test-tomates', 'LOSS', -3, gen_random_uuid(), 'stk-test-marchand')$$, '23514', 'CHECK reason : une sortie anormale est toujours motivée');
select lives_ok($$insert into public.merchant_stock_movements (merchant_id, product_id, movement_type, quantity_base, operation_id, created_by) values ('stk-test-marchand', 'stk-test-tomates', 'PURCHASE', 3, '11111111-1111-1111-1111-111111111111', 'stk-test-marchand')$$, 'insert mouvement valide : OK');
select throws_ok($$insert into public.merchant_stock_movements (merchant_id, product_id, movement_type, quantity_base, operation_id, created_by) values ('stk-test-marchand', 'stk-test-tomates', 'PURCHASE', 3, '11111111-1111-1111-1111-111111111111', 'stk-test-marchand')$$, '23505', 'UNIQUE (merchant_id, operation_id) : une opération ne se rejoue jamais deux fois');
select throws_ok($$update public.merchant_stock_movements set quantity_base = 1 where operation_id = '11111111-1111-1111-1111-111111111111'$$, 'P0001', 'append-only : UPDATE interdit sur le journal');
select throws_ok($$delete from public.merchant_stock_movements where operation_id = '11111111-1111-1111-1111-111111111111'$$, 'P0001', 'append-only : DELETE interdit sur le journal');

-- ── 7. Vente : refus strict, stock exact, stock zéro (§3, §18-20) ──────
select throws_ok($$select public.merchant_record_sale('stk-test-marchand', gen_random_uuid(), 'dev-test', '[{"productId":"stk-test-tomates","productName":"Tomates","quantity":15,"unitPrice":500}]'::jsonb)$$, 'P0001', 'INSUFFICIENT_STOCK', 'refus : 15 demandés > 10 en stock');
select lives_ok($$select public.merchant_record_sale('stk-test-marchand', '22222222-2222-2222-2222-222222222222', 'dev-test', '[{"productId":"stk-test-tomates","productName":"Tomates","quantity":10,"unitPrice":500}]'::jsonb)$$, 'vente exacte 10 sur 10 : autorisée (§20)');
select is((select quantity_base from public.merchant_stock_balances where merchant_id = 'stk-test-marchand' and product_id = 'stk-test-tomates'), 0::numeric, 'vente exacte : balance 10 − 10 = 0');
select is((select stock_qty from public.legacy_products where id = 'stk-test-tomates'), 0, 'double écriture D3 : legacy stock_qty = 0');
select throws_ok($$select public.merchant_record_sale('stk-test-marchand', gen_random_uuid(), 'dev-test', '[{"productId":"stk-test-tomates","productName":"Tomates","quantity":3,"unitPrice":500}]'::jsonb)$$, 'P0001', 'INSUFFICIENT_STOCK', 'stock 0 : « Tu n''as plus de stock » — vente refusée');
select lives_ok($$select public.merchant_record_purchase('stk-test-marchand', '33333333-3333-3333-3333-333333333333', 'dev-test', '[{"productId":"stk-test-tomates","productName":"Tomates","quantity":10,"unitCode":"kg","quantityBase":10,"unitCostCfa":4000}]'::jsonb)$$, 'achat : +10 kg de tomates à 4 000 le kg');
select is((select quantity_base from public.merchant_stock_balances where merchant_id = 'stk-test-marchand' and product_id = 'stk-test-tomates'), 10::numeric, 'achat : balance 0 + 10 = 10');
select is((select weighted_avg_cost from public.merchant_stock_balances where merchant_id = 'stk-test-marchand' and product_id = 'stk-test-tomates'), 4000::numeric, 'coût moyen pondéré : 4 000 FCFA/kg après achat');
select is((select stock_qty from public.legacy_products where id = 'stk-test-tomates'), 10, 'double écriture D3 : achat → legacy stock_qty = 10');
select lives_ok($$select public.merchant_record_sale('stk-test-marchand', '44444444-4444-4444-4444-444444444444', 'dev-test', '[{"productId":"stk-test-tomates","productName":"Tomates","quantity":7,"unitPrice":500}]'::jsonb)$$, 'vente 7 sur 10 : autorisée');
select is((select quantity_base from public.merchant_stock_balances where merchant_id = 'stk-test-marchand' and product_id = 'stk-test-tomates'), 3::numeric, 'vente 7 : balance 10 − 7 = 3');
select is((select stock_qty from public.legacy_products where id = 'stk-test-tomates'), 3, 'double écriture D3 : vente 7 → legacy stock_qty = 3');
select throws_ok($$select public.merchant_record_sale('stk-test-marchand', gen_random_uuid(), 'dev-test', '[{"productId":"stk-test-tomates","productName":"Tomates","quantity":5,"unitPrice":500}]'::jsonb)$$, 'P0001', 'INSUFFICIENT_STOCK', 'concurrence séquentielle : 7 puis 5 sur 10 → le second est refusé, jamais −2');
select is((select quantity_base from public.merchant_stock_balances where merchant_id = 'stk-test-marchand' and product_id = 'stk-test-tomates'), 3::numeric, 'le refus n''a rien décrémenté : balance toujours 3');
select is(((select public.merchant_record_sale('stk-test-marchand', '44444444-4444-4444-4444-444444444444', 'dev-test', '[{"productId":"stk-test-tomates","productName":"Tomates","quantity":7,"unitPrice":500}]'::jsonb)) ->> 'created'), 'false', 'idempotence : rejeu de la vente → created = false, rien ne se rejoue');
select is((select count(*) from public.legacy_sales where client_id = '44444444-4444-4444-4444-444444444444'), 1::bigint, 'idempotence : une seule vente en base malgré le rejeu');

-- ── 8. Produit non suivi (D7, §23) : comportement actuel préservé ───────
insert into public.legacy_products (id, merchant_id, name, stock_qty)
values ('stk-test-ananas', 'stk-test-marchand', 'Ananas', 3);
select lives_ok($$select public.merchant_record_sale('stk-test-marchand', gen_random_uuid(), 'dev-test', '[{"productId":"stk-test-ananas","productName":"Ananas","quantity":5,"unitPrice":1000}]'::jsonb)$$, 'produit sans balance : vente encaissée (pas de refus)');
select is((select stock_qty from public.legacy_products where id = 'stk-test-ananas'), 0, 'produit non suivi : écrêtage à 0 (comportement actuel)');
select is((select count(*) from public.merchant_stock_movements where product_id = 'stk-test-ananas'), 0::bigint, 'produit non suivi : aucun mouvement');
select is((select count(*) from public.merchant_stock_balances where product_id = 'stk-test-ananas'), 0::bigint, 'produit non suivi : aucune balance');

-- ── 9. Stock UNKNOWN (§23) : sortie refusée avant comptage ──────────────
select lives_ok($$update public.merchant_stock_balances set stock_precision = 'UNKNOWN' where merchant_id = 'stk-test-marchand' and product_id = 'stk-test-riz'$$, 'setup : riz passé en stock UNKNOWN');
select throws_ok($$select public.merchant_record_movement('stk-test-marchand', gen_random_uuid(), 'dev-test', 'stk-test-riz', 'LOSS', 5, null, null, 'SPOILAGE')$$, 'P0001', 'UNKNOWN_STOCK', 'stock inconnu : sortie refusée (« vérifie ton stock d''abord »)');

-- ── 10. Perte (§21) : LOSS tracé, PAS une vente ─────────────────────────
select lives_ok($$select public.merchant_record_movement('stk-test-marchand', '55555555-5555-5555-5555-555555555555', 'dev-test', 'stk-test-tomates', 'LOSS', 2, null, 'kg', 'SPOILAGE')$$, 'perte : « j''ai perdu 2 kilos » → mouvement LOSS');
select is((select quantity_base from public.merchant_stock_balances where merchant_id = 'stk-test-marchand' and product_id = 'stk-test-tomates'), 1::numeric, 'perte : balance 3 − 2 = 1');
select is((select count(*) from public.merchant_stock_movements where product_id = 'stk-test-tomates' and movement_type = 'LOSS' and quantity_base = -2), 1::bigint, 'perte : mouvement LOSS −2 tracé dans le journal');
select throws_ok($$select public.merchant_record_movement('stk-test-marchand', gen_random_uuid(), 'dev-test', 'stk-test-tomates', 'LOSS', 1, null, null, null)$$, '22023', 'perte sans raison : refusée (traçabilité §21-22)');
select throws_ok($$select public.merchant_record_movement('stk-test-marchand', gen_random_uuid(), 'dev-test', 'stk-test-tomates', 'LOSS', 99, null, 'kg', 'SPOILAGE')$$, 'P0001', 'INSUFFICIENT_STOCK', 'perte 99 > 1 en stock : refusée');

-- ── 11. Ajustement au comptage (§22) : delta tracé, jamais écrasé ───────
select lives_ok($$select public.merchant_adjust_to_count('stk-test-marchand', '66666666-6666-6666-6666-666666666666', 'dev-test', 'stk-test-oignons', 30, 'comptage du soir')$$, 'comptage : « j''ai compté, il reste 30 » (système : 134)');
select is((select quantity_base from public.merchant_stock_balances where merchant_id = 'stk-test-marchand' and product_id = 'stk-test-oignons'), 30::numeric, 'comptage : balance mise à 30 EXACT');
select is((select count(*) from public.merchant_stock_movements where product_id = 'stk-test-oignons' and movement_type = 'ADJUSTMENT_OUT' and quantity_base = -104), 1::bigint, 'comptage : delta −104 tracé comme ADJUSTMENT_OUT (historique conservé)');
select lives_ok($$select public.merchant_adjust_to_count('stk-test-marchand', '77777777-7777-7777-7777-777777777777', 'dev-test', 'stk-test-oignons', 30, 'recomptage identique')$$, 'recomptage identique : OK');
select is((select count(*) from public.merchant_stock_movements where product_id = 'stk-test-oignons' and reason = 'INVENTORY_COUNT'), 1::bigint, 'comptage à l''identique : aucun mouvement en plus (delta 0)');

-- ── 12. Comptage d'un produit jamais suivi : initialisation (§23) ──────
insert into public.legacy_products (id, merchant_id, name, stock_qty)
values ('stk-test-gombo', 'stk-test-marchand', 'Gombo', 0);
select lives_ok($$select public.merchant_adjust_to_count('stk-test-marchand', '88888888-8888-8888-8888-888888888888', 'dev-test', 'stk-test-gombo', 12, 'premier comptage')$$, 'comptage d''un produit sans balance : initialisation');
select is((select quantity_base from public.merchant_stock_balances where merchant_id = 'stk-test-marchand' and product_id = 'stk-test-gombo'), 12::numeric, 'comptage : balance gombo initialisée à 12 EXACT');
select is((select count(*) from public.merchant_stock_movements where product_id = 'stk-test-gombo' and movement_type = 'ADJUSTMENT_IN' and quantity_base = 12), 1::bigint, 'comptage : ADJUSTMENT_IN +12 tracé');

select * from finish();
rollback;
