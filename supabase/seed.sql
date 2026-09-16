-- ================================================================
-- Jùlaba - Seed local complet
--
-- Ce fichier est volontairement déterministe et rejouable. Il fournit
-- des données réalistes aux écrans marchand, producteur, identificateur
-- et backoffice, dans les tables modernes et legacy.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Comptes de démonstration
-- ----------------------------------------------------------------
insert into public.bo_users (id, email, password_hash, name, role, zone, is_active)
values
  ('bo-user-001', 'aminata@julaba.ci', 'admin123', 'Aminata KONE', 'super_admin', null, true),
  ('bo-user-002', 'koffi@julaba.ci', 'admin123', 'Koffi YAO', 'admin_general', null, true),
  ('bo-user-003', 'moussa@dge.ci', 'admin123', 'Moussa TRAORE', 'admin_national', 'National', true),
  ('bo-user-004', 'fatou@julaba.ci', 'admin123', 'Fatou SORO', 'gestionnaire_zone', 'Adjame', true),
  ('bo-user-005', 'jean@julaba.ci', 'admin123', 'Jean KOUADIO', 'operateur_terrain', 'Adjame', true),
  ('bo-user-006', 'affi@julaba.ci', 'admin123', 'Affi COULIBALY', 'gestionnaire_zone', 'Bouake', true),
  ('bo-user-007', 'yao@julaba.ci', 'admin123', 'Yao KONAN', 'operateur_terrain', 'Kong', false)
 on conflict (id) do update set
   email = excluded.email,
   password_hash = excluded.password_hash,
   name = excluded.name,
   role = excluded.role,
   zone = excluded.zone,
   is_active = excluded.is_active;

insert into public.merchants (id, first_name, last_name, phone, auth_method, pin_hash)
values
  ('merchant-1', 'Awa', 'KONE', '0701020304', 'pin', '1509442'), -- PIN 1234
  ('merchant-2', 'Fatoumata', 'KEITA', '0705060708', 'pin', '1509443'), -- PIN 1235
  ('merchant-3', 'Salimata', 'CISSE', '0501020304', 'pin', '1509444') -- PIN 1236
on conflict (id) do nothing;

insert into public.producers (id, first_name, phone, auth_method, pin_hash)
values
  ('producteur-1', 'Kouadio', '0744444444', 'pin', '1477632'), -- PIN 0000
  ('producteur-2', 'Moussa', '0123456789', 'pin', '1477633'), -- PIN 0001
  ('producteur-3', 'Adama', '0177777777', 'pin', '1477634') -- PIN 0002
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- 2. Auth locale, organisation et zones modernes
-- ----------------------------------------------------------------
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000201', 'authenticated', 'authenticated', 'fatou.soro@julaba.ci', '$2a$10$julaba-local-demo', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Fatou"}', now(), now()),
  ('00000000-0000-0000-0000-000000000202', 'authenticated', 'authenticated', 'affi.coulibaly@julaba.ci', '$2a$10$julaba-local-demo', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Affi"}', now(), now()),
  ('00000000-0000-0000-0000-000000000203', 'authenticated', 'authenticated', 'awa.kone@julaba.ci', '$2a$10$julaba-local-demo', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Awa"}', now(), now())
on conflict (id) do nothing;

insert into public.organizations (id, name, slug, is_active)
values
  ('00000000-0000-0000-0000-000000000001', 'Jùlaba Côte d’Ivoire', 'julaba-ci', true),
  ('00000000-0000-0000-0000-000000000002', 'Coopérative des marchés du Centre', 'marches-centre', true)
on conflict (id) do nothing;

insert into public.zones (id, organization_id, name, region, is_active)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Adjamé', 'Abidjan', true),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'Cocody', 'Abidjan', true),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'Yopougon', 'Abidjan', true),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'Bouaké', 'Centre', true),
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000001', 'Korhogo', 'Savanes', true),
  ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000002', 'Kong', 'Savanes', true)
on conflict (id) do nothing;

insert into public.profiles (id, first_name, last_name, phone, actor_type)
values
  ('00000000-0000-0000-0000-000000000201', 'Fatou', 'Soro', '0700000001', 'identificateur'),
  ('00000000-0000-0000-0000-000000000202', 'Affi', 'Coulibaly', '0700000002', 'identificateur'),
  ('00000000-0000-0000-0000-000000000203', 'Awa', 'Kone', '0701020304', 'marchand')
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id, role, zone_id, is_active)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'gestionnaire_zone', '00000000-0000-0000-0000-000000000101', true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'operateur_terrain', '00000000-0000-0000-0000-000000000104', true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'marchand', '00000000-0000-0000-0000-000000000101', true)
on conflict (organization_id, user_id) do nothing;

-- ----------------------------------------------------------------
-- 3. Acteurs, dossiers et produits
-- ----------------------------------------------------------------
insert into public.actors (id, organization_id, zone_id, actor_code, first_name, last_name, actor_type, phone, status, gps_lat, gps_lng, identificateur_user_id, identificateur_name, validated_at, notes)
values
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', '#M-0001', 'Awa', 'Kone', 'marchand', '0701020304', 'actif', 5.3600, -4.0083, '00000000-0000-0000-0000-000000000201', 'Fatou Soro', now(), 'Compte marchand de démonstration'),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000104', '#P-0002', 'Kouadio', 'Yao', 'producteur', '0744444444', 'actif', 7.6900, -5.0300, '00000000-0000-0000-0000-000000000202', 'Affi Coulibaly', now(), 'Producteur de démonstration'),
  ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000102', '#M-0003', 'Fatoumata', 'Keita', 'marchand', '0705060708', 'actif', 5.3500, -3.9900, '00000000-0000-0000-0000-000000000201', 'Fatou Soro', now(), null),
  ('00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000105', '#C-0004', 'Kadiatou', 'Sangare', 'cooperatif', '0509090909', 'en_attente', 9.4600, -5.6300, '00000000-0000-0000-0000-000000000202', 'Affi Coulibaly', null, 'Dossier en attente de validation')
on conflict (id) do nothing;

insert into public.enrolments (organization_id, zone_id, dossier_id, actor_name, actor_type, phone, has_photo, has_gps, gps_lat, gps_lng, identificateur_user_id, identificateur_name, status, validated_at, reject_reason)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'DOS-2026-0001', 'Awa Kone', 'marchand', '0701020304', true, true, 5.3600, -4.0083, '00000000-0000-0000-0000-000000000201', 'Fatou Soro', 'valide', now(), null),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000104', 'DOS-2026-0002', 'Kouadio Yao', 'producteur', '0744444444', true, true, 7.6900, -5.0300, '00000000-0000-0000-0000-000000000202', 'Affi Coulibaly', 'valide', now(), null),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000105', 'DOS-2026-0003', 'Kadiatou Sangare', 'cooperatif', '0509090909', false, true, 9.4600, -5.6300, '00000000-0000-0000-0000-000000000202', 'Affi Coulibaly', 'en_attente', null, null)
on conflict (organization_id, dossier_id) do nothing;

insert into public.products (id, organization_id, merchant_user_id, name, category, price_unit, stock_qty, image_path, is_active)
values
  ('00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'Tomates fraîches', 'Légumes', 500, 84, null, true),
  ('00000000-0000-0000-0000-000000003002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'Oignons', 'Légumes', 750, 52, null, true),
  ('00000000-0000-0000-0000-000000003003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'Bananes plantain', 'Fruits', 1500, 31, null, true),
  ('00000000-0000-0000-0000-000000003004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'Huile rouge', 'Condiments', 2500, 18, null, true)
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- 4. Caisse, ventes, dépenses et stock
-- ----------------------------------------------------------------
insert into public.cash_sessions (id, organization_id, merchant_user_id, opening_float, total_sales, total_expenses, closing_amount, is_open, opened_at)
values
  ('00000000-0000-0000-0000-000000004001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 25000, 38500, 3500, null, true, now() - interval '5 hours')
on conflict (id) do nothing;

insert into public.sales (id, organization_id, merchant_user_id, total_amount, amount_received, change_amount, note, cash_session_id)
values
  ('00000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 3000, 5000, 2000, 'Vente comptoir', '00000000-0000-0000-0000-000000004001'),
  ('00000000-0000-0000-0000-000000004102', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 35500, 40000, 4500, 'Vente du matin', '00000000-0000-0000-0000-000000004001')
on conflict (id) do nothing;

insert into public.sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal)
values
  ('00000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000003001', 'Tomates fraîches', 2, 500, 1000),
  ('00000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000003002', 'Oignons', 2, 750, 1500),
  ('00000000-0000-0000-0000-000000004102', '00000000-0000-0000-0000-000000003003', 'Bananes plantain', 10, 1500, 15000),
  ('00000000-0000-0000-0000-000000004102', '00000000-0000-0000-0000-000000003004', 'Huile rouge', 5, 2500, 12500)
on conflict do nothing;

insert into public.expenses (organization_id, merchant_user_id, amount, category, description, cash_session_id)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 1500, 'Transport', 'Taxi marché Adjamé', '00000000-0000-0000-0000-000000004001'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 2000, 'Approvisionnement', 'Sacs et emballages', '00000000-0000-0000-0000-000000004001')
on conflict do nothing;

insert into public.stock_movements (organization_id, product_id, user_id, movement_type, quantity, reason)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000000203', 'entree', 100, 'Approvisionnement du matin'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000000203', 'vente', -16, 'Ventes de la journée'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000003002', '00000000-0000-0000-0000-000000000203', 'entree', 60, 'Approvisionnement du matin')
on conflict do nothing;

-- ----------------------------------------------------------------
-- 5. Producteur, tontines et notifications
-- ----------------------------------------------------------------
insert into public.harvests (organization_id, producer_user_id, product_name, quantity_kg, quality, harvested_at, plot, desired_price_per_kg, photo_paths, status, buyer, sale_amount, notes)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'Maïs', 240, 'standard', now() - interval '2 days', 'Parcelle B3', 450, '[]', 'publiee', 'Coopérative Bouaké', null, 'Récolte prête à enlever'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'Manioc', 180, 'premium', now() - interval '8 days', 'Parcelle A1', 300, '[]', 'vendue', 'Marché de Bouaké', 54000, null)
on conflict do nothing;

insert into public.producer_orders (organization_id, producer_user_id, reference, buyer_name, product_name, quantity_kg, amount, desired_delivery_date, status, is_urgent, carrier)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'CMD-2026-0001', 'Coopérative Bouaké', 'Maïs', 100, 45000, now() + interval '3 days', 'en_cours', false, 'Wôrô-Wôrô Express'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'CMD-2026-0002', 'Cantines scolaires', 'Manioc', 80, 24000, now() + interval '7 days', 'a_traiter', true, null)
on conflict (organization_id, reference) do nothing;

insert into public.producer_journals (organization_id, producer_user_id, cycle_id, entry_date, text, photo_path)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'cycle-mais-2026', now() - interval '6 days', 'Les plants ont bien résisté aux dernières pluies.', null),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'cycle-mais-2026', now() - interval '2 days', 'Récolte du bloc B3 terminée.', null)
on conflict do nothing;

insert into public.tontines (id, organization_id, client_id, name, amount, frequency, member_count, next_due_date)
values
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000005101', 'Femmes du marché Adjamé', 5000, 'hebdomadaire', 3, current_date + 2),
  ('00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000005102', 'Solidarité Cocody', 10000, 'mensuel', 2, current_date + 12)
on conflict (id) do nothing;

insert into public.tontine_members (organization_id, tontine_id, member_user_id, joined_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-000000000203', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-000000000203', now() - interval '12 days')
on conflict do nothing;

insert into public.tontine_contributions (organization_id, tontine_id, member_user_id, amount)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-000000000203', 5000),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-000000000203', 10000)
on conflict do nothing;

insert into public.notifications (organization_id, user_id, type, title, body, data)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'bienvenue', 'Bienvenue sur Jùlaba', 'Votre espace marchand est prêt.', '{"source":"seed"}'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'commande', 'Nouvelle commande', 'Une commande de maïs vous attend.', '{"reference":"CMD-2026-0001"}')
on conflict do nothing;

-- ----------------------------------------------------------------
-- 6. Backoffice moderne et observabilité
-- ----------------------------------------------------------------
insert into public.missions (organization_id, zone_id, title, description, assignee_user_id, assignee_name, status, target_count, current_count, starts_on, ends_on)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'Enrôlement Adjamé - semaine 1', 'Identifier les nouveaux marchands du marché.', '00000000-0000-0000-0000-000000000201', 'Fatou Soro', 'en_cours', 40, 26, current_date - 3, current_date + 4),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000104', 'Suivi producteurs Bouaké', 'Mettre à jour les récoltes disponibles.', '00000000-0000-0000-0000-000000000202', 'Affi Coulibaly', 'terminee', 20, 20, current_date - 14, current_date - 2)
on conflict do nothing;

insert into public.mutations (organization_id, actor_id, from_zone_id, to_zone_id, reason, status, requested_by_user_id, requested_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000101', 'Changement de point de vente', 'en_attente', '00000000-0000-0000-0000-000000000201', now() - interval '1 day')
on conflict do nothing;

insert into public.institutions (organization_id, name, type, contact_name, contact_email, contact_phone, address, linked_actors, is_active)
values
  ('00000000-0000-0000-0000-000000000001', 'Coopérative agricole de Bouaké', 'cooperative', 'Mariam Diallo', 'contact@cab.ci', '0703030303', 'Bouaké centre', 18, true),
  ('00000000-0000-0000-0000-000000000001', 'Direction générale du commerce', 'institution_publique', 'Moussa Traoré', 'dge@commerce.ci', '2720202020', 'Plateau, Abidjan', 240, true)
on conflict do nothing;

insert into public.moderation_reports (organization_id, target_type, target_id, target_name, reason, severity, status, reported_by_user_id)
values
  ('00000000-0000-0000-0000-000000000001', 'actor', '#C-0004', 'Kadiatou Sangare', 'Dossier incomplet', 'moyenne', 'ouvert', '00000000-0000-0000-0000-000000000202')
on conflict do nothing;

insert into public.communications (organization_id, title, type, content, target_group, target_zone_id, status, sent_count, delivery_rate, sent_at, created_by_user_id)
values
  ('00000000-0000-0000-0000-000000000001', 'Rappel de collecte', 'notification', 'Les déclarations de récolte sont ouvertes cette semaine.', 'producteurs', '00000000-0000-0000-0000-000000000104', 'envoyee', 32, 0.94, now() - interval '1 day', '00000000-0000-0000-0000-000000000202')
on conflict do nothing;

insert into public.credit_scores (organization_id, actor_id, score, risk_level, credit_limit, last_calculated_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001001', 82, 'faible', 150000, now()),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001002', 68, 'moyen', 75000, now())
on conflict (organization_id, actor_id) do nothing;

insert into public.keiwa_accounts (organization_id, holder_name, holder_phone, zone_id, balance, transaction_count, is_active)
values
  ('00000000-0000-0000-0000-000000000001', 'Awa Kone', '0701020304', '00000000-0000-0000-0000-000000000101', 125000, 4, true),
  ('00000000-0000-0000-0000-000000000001', 'Kouadio Yao', '0744444444', '00000000-0000-0000-0000-000000000104', 87500, 3, true)
on conflict do nothing;

insert into public.keiwa_transactions (organization_id, account_id, type, amount, sender_name, sender_phone, recipient_name, recipient_phone, status)
select '00000000-0000-0000-0000-000000000001', id, 'depot', 50000, 'Awa Kone', '0701020304', 'Compte Keiwa', '0701020304', 'termine'
from public.keiwa_accounts where holder_phone = '0701020304'
on conflict do nothing;

insert into public.api_keys (organization_id, name, description, key_prefix, secret_hash, permissions, request_count, is_active, created_by_user_id)
values
  ('00000000-0000-0000-0000-000000000001', 'Dashboard local', 'Clé pour les tests locaux', 'jlb_local_', 'seed-secret-hash', 'read:dashboard,read:actors', 12, true, '00000000-0000-0000-0000-000000000201')
on conflict do nothing;

insert into public.deliveries (organization_id, zone_id, order_reference, sender_name, sender_phone, recipient_name, recipient_phone, address, status, courier_name)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000104', 'CMD-2026-0001', 'Coopérative Bouaké', '0703030303', 'Kouadio Yao', '0744444444', 'Marché de Bouaké, stand 12', 'en_cours', 'Wôrô-Wôrô Express')
on conflict do nothing;

insert into public.cron_jobs (organization_id, name, schedule, command, status, run_count, avg_duration_ms, next_run_at)
values
  ('00000000-0000-0000-0000-000000000001', 'Nettoyage des sessions', '0 3 * * *', 'cleanup_device_sessions', 'actif', 24, 180, now() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000001', 'Calcul des scores', '0 2 * * 1', 'refresh_credit_scores', 'actif', 8, 430, now() + interval '3 days')
on conflict do nothing;

insert into public.platform_configs (organization_id, category, config)
values
  ('00000000-0000-0000-0000-000000000001', 'notifications', '{"enabled":true,"digest":"daily"}'),
  ('00000000-0000-0000-0000-000000000001', 'offline', '{"maxQueueSize":100,"retryLimit":3}')
on conflict (organization_id, category) do nothing;

insert into public.training_contents (organization_id, title, type, category, content, excerpt, author, status, difficulty, duration, target_role, sort_order, view_count)
values
  ('00000000-0000-0000-0000-000000000001', 'Enregistrer une vente', 'guide', 'marchand', 'Ajoutez les produits, vérifiez le total puis confirmez le paiement.', 'Les étapes de base de la caisse.', 'Équipe Jùlaba', 'publie', 'debutant', '5 min', 'marchand', 1, 18),
  ('00000000-0000-0000-0000-000000000001', 'Valider un dossier', 'guide', 'enrolement', 'Vérifiez les informations et validez uniquement les dossiers complets.', 'Contrôle qualité des enrôlements.', 'Équipe Jùlaba', 'publie', 'intermediaire', '8 min', 'identificateur', 2, 11)
on conflict do nothing;

insert into public.voice_logs (organization_id, merchant_user_id, transcript, intent, confidence, response_text)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'Ajoute deux kilos de tomates', 'add_to_cart', 0.96, 'Tomates ajoutées au panier.'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'Combien ai-je vendu aujourd’hui', 'sales_summary', 0.91, 'Vous avez vendu 38 500 FCFA.')
on conflict do nothing;

insert into public.audit_events (organization_id, actor_id, action, resource_type, resource_id, metadata)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'create', 'sale', '00000000-0000-0000-0000-000000004101', '{"source":"seed"}'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'review', 'enrolment', 'DOS-2026-0003', '{"status":"pending"}')
on conflict do nothing;

insert into public.system_events (organization_id, level, source, message, metadata)
values
  ('00000000-0000-0000-0000-000000000001', 'INFO', 'seed', 'Base locale initialisée', '{"version":"2026.09"}'),
  ('00000000-0000-0000-0000-000000000001', 'WARN', 'stock', 'Stock faible pour l’huile rouge', '{"product":"Huile rouge","quantity":18}')
on conflict do nothing;

insert into public.sync_conflict_reports (organization_id, user_id, entity, payload, message, client_created_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'product', '{"id":"pending-demo-1","name":"Gombo"}', 'Le produit existe déjà sur le serveur.', now() - interval '2 hours')
on conflict do nothing;

-- ----------------------------------------------------------------
-- 7. Tables legacy utilisées par les écrans historiques
-- ----------------------------------------------------------------
insert into public.legacy_bo_zones (id, name, region, identificateur_count, actor_count, target, is_active)
values
  ('legacy-zone-001', 'Adjame', 'Abidjan', 42, 340, 2000, true),
  ('legacy-zone-002', 'Cocody', 'Abidjan', 28, 215, 1500, true),
  ('legacy-zone-003', 'Bouake', 'Centre', 22, 190, 1200, true),
  ('legacy-zone-004', 'Korhogo', 'Savanes', 15, 85, 800, true)
on conflict (id) do nothing;

insert into public.legacy_bo_actors (id, actor_id, first_name, last_name, type, phone, zone, status, gps_lat, gps_lng, identificateur_name)
values
  ('legacy-actor-001', '#M-0001', 'Awa', 'Kone', 'marchand', '0701020304', 'Adjame', 'actif', 5.3600, -4.0083, 'Fatou Soro'),
  ('legacy-actor-002', '#P-0002', 'Kouadio', 'Yao', 'producteur', '0744444444', 'Bouake', 'actif', 7.6900, -5.0300, 'Affi Coulibaly'),
  ('legacy-actor-003', '#M-0003', 'Fatoumata', 'Keita', 'marchand', '0705060708', 'Cocody', 'actif', 5.3500, -3.9900, 'Fatou Soro')
on conflict (id) do nothing;

insert into public.legacy_products (id, merchant_id, client_id, name, category, price_unit, stock_qty, is_active)
values
  ('legacy-product-001', 'merchant-1', 'legacy-client-product-001', 'Tomates fraîches', 'Légumes', 500, 84, true),
  ('legacy-product-002', 'merchant-1', 'legacy-client-product-002', 'Oignons', 'Légumes', 750, 52, true),
  ('legacy-product-003', 'merchant-1', 'legacy-client-product-003', 'Bananes plantain', 'Fruits', 1500, 31, true)
on conflict (id) do nothing;

insert into public.legacy_caisse_sessions (id, merchant_id, fond_de_caisse, total_ventes, total_depenses, total_final, is_open, opened_at)
values
  ('legacy-session-001', 'merchant-1', 25000, 38500, 3500, 60000, true, now() - interval '5 hours')
on conflict (id) do nothing;

insert into public.legacy_sales (id, merchant_id, session_id, client_id, total_amount, change_amount, amount_received, is_voice_sale, voice_transcript)
values
  ('legacy-sale-001', 'merchant-1', 'legacy-session-001', 'legacy-client-sale-001', 3000, 2000, 5000, false, null),
  ('legacy-sale-002', 'merchant-1', 'legacy-session-001', 'legacy-client-sale-002', 35500, 4500, 40000, true, 'Vente du matin')
on conflict (id) do nothing;

insert into public.legacy_sale_items (id, sale_id, product_id, product_name, quantity, unit_price, subtotal)
values
  ('legacy-item-001', 'legacy-sale-001', 'legacy-product-001', 'Tomates fraîches', 2, 500, 1000),
  ('legacy-item-002', 'legacy-sale-001', 'legacy-product-002', 'Oignons', 2, 750, 1500),
  ('legacy-item-003', 'legacy-sale-002', 'legacy-product-003', 'Bananes plantain', 10, 1500, 15000)
on conflict (id) do nothing;

insert into public.legacy_expenses (id, merchant_id, client_id, amount, category, description, is_voice, voice_transcript)
values
  ('legacy-expense-001', 'merchant-1', 'legacy-client-expense-001', 1500, 'Transport', 'Taxi marché Adjamé', false, null),
  ('legacy-expense-002', 'merchant-1', 'legacy-client-expense-002', 2000, 'Approvisionnement', 'Sacs et emballages', true, 'Deux mille francs pour les sacs')
on conflict (id) do nothing;

insert into public.legacy_tontines (id, name, amount, frequency, member_count, next_due_date)
values
  ('legacy-tontine-001', 'Femmes du marché Adjamé', 5000, 'hebdomadaire', 3, current_date + 2),
  ('legacy-tontine-002', 'Solidarité Cocody', 10000, 'mensuelle', 2, current_date + 12)
on conflict (id) do nothing;

insert into public.legacy_tontine_members (id, tontine_id, merchant_id)
values
  ('legacy-member-001', 'legacy-tontine-001', 'merchant-1'),
  ('legacy-member-002', 'legacy-tontine-002', 'merchant-1')
on conflict (id) do nothing;

insert into public.legacy_tontine_contributions (id, tontine_id, merchant_id, amount, client_id)
values
  ('legacy-contribution-001', 'legacy-tontine-001', 'merchant-1', 5000, 'legacy-client-contribution-001'),
  ('legacy-contribution-002', 'legacy-tontine-002', 'merchant-1', 10000, 'legacy-client-contribution-002')
on conflict (id) do nothing;

insert into public.legacy_producteur_recoltes (id, producteur_id, produit, quantite_kg, qualite, date_recolte, parcelle, prix_souhaite_par_kg, photos, statut, acheteur, montant_vente, notes)
values
  ('legacy-harvest-001', 'producteur-1', 'Maïs', 240, 'Bonne', now() - interval '2 days', 'Parcelle B3', 450, '[]', 'disponible', 'Coopérative Bouaké', null, 'Récolte prête à enlever'),
  ('legacy-harvest-002', 'producteur-1', 'Manioc', 180, 'Très bonne', now() - interval '8 days', 'Parcelle A1', 300, '[]', 'vendue', 'Marché de Bouaké', 54000, null)
on conflict (id) do nothing;

insert into public.legacy_producteur_commandes (id, producteur_id, reference, acheteur_nom, produit, quantite_kg, montant, date_livraison_souhaitee, statut, urgent, transporteur)
values
  ('legacy-order-001', 'producteur-1', 'CMD-2026-0001', 'Coopérative Bouaké', 'Maïs', 100, 45000, now() + interval '3 days', 'confirmee', false, 'Wôrô-Wôrô Express'),
  ('legacy-order-002', 'producteur-1', 'CMD-2026-0002', 'Cantines scolaires', 'Manioc', 80, 24000, now() + interval '7 days', 'en_attente', true, null)
on conflict (id) do nothing;

insert into public.legacy_producteur_journals (id, producteur_id, cycle_id, date, texte)
values
  ('legacy-journal-001', 'producteur-1', 'cycle-mais-2026', now() - interval '6 days', 'Les plants ont bien résisté aux dernières pluies.'),
  ('legacy-journal-002', 'producteur-1', 'cycle-mais-2026', now() - interval '2 days', 'Récolte du bloc B3 terminée.')
on conflict (id) do nothing;

insert into public.legacy_voice_logs (id, merchant_id, transcript, intent, confidence, response_text)
values
  ('legacy-voice-001', 'merchant-1', 'Ajoute deux kilos de tomates', 'add_to_cart', 0.96, 'Tomates ajoutées au panier.'),
  ('legacy-voice-002', 'merchant-1', 'Combien ai-je vendu aujourd’hui', 'sales_summary', 0.91, 'Vous avez vendu 38 500 FCFA.')
on conflict (id) do nothing;

insert into public.legacy_notifications (id, subject, type, title, body, data, read)
values
  ('legacy-notification-001', 'merchant:merchant-1', 'bienvenue', 'Bienvenue sur Jùlaba', 'Votre espace marchand est prêt.', '{}', false),
  ('legacy-notification-002', 'producteur:producteur-1', 'commande', 'Nouvelle commande', 'Une commande de maïs vous attend.', '{"reference":"CMD-2026-0001"}', false)
on conflict (id) do nothing;

insert into public.legacy_bo_missions (id, title, description, zone, assignee_name, status, target_count, current_count, start_date, end_date)
values
  ('legacy-mission-001', 'Enrôlement Adjamé', 'Identifier les nouveaux marchands.', 'Adjame', 'Fatou Soro', 'en_cours', 40, 26, current_date - 3, current_date + 4),
  ('legacy-mission-002', 'Suivi producteurs Bouaké', 'Mettre à jour les récoltes.', 'Bouake', 'Affi Coulibaly', 'terminee', 20, 20, current_date - 14, current_date - 2)
on conflict (id) do nothing;

insert into public.legacy_bo_enrolments (id, dossier_id, actor_name, actor_type, zone, identificateur_name, status, has_photo, has_gps, phone, submitted_at)
values
  ('legacy-enrolment-001', 'DOS-2026-0001', 'Awa Kone', 'marchand', 'Adjame', 'Fatou Soro', 'valide', true, true, '0701020304', now() - interval '5 days'),
  ('legacy-enrolment-002', 'DOS-2026-0003', 'Kadiatou Sangare', 'cooperatif', 'Korhogo', 'Affi Coulibaly', 'en_attente', false, true, '0509090909', now() - interval '1 day')
on conflict (id) do nothing;

insert into public.legacy_bo_alerts (id, severity, title, message, module, acknowledged)
values
  ('legacy-alert-001', 'haute', 'Stock faible', 'Le stock d’huile rouge est inférieur au seuil.', 'stock', false),
  ('legacy-alert-002', 'moyenne', 'Dossier à vérifier', 'Un dossier coopératif attend une vérification.', 'enrolement', false)
on conflict (id) do nothing;

insert into public.legacy_bo_institutions (id, name, type, contact_name, contact_email, contact_phone, address, linked_actors, is_active)
values
  ('legacy-institution-001', 'Coopérative agricole de Bouaké', 'cooperative', 'Mariam Diallo', 'contact@cab.ci', '0703030303', 'Bouaké centre', 18, true),
  ('legacy-institution-002', 'Direction générale du commerce', 'institution_publique', 'Moussa Traoré', 'dge@commerce.ci', '2720202020', 'Plateau, Abidjan', 240, true)
on conflict (id) do nothing;

insert into public.legacy_bo_moderation_reports (id, target_type, target_id, target_name, reason, severity, status, reported_by)
values
  ('legacy-report-001', 'actor', '#C-0004', 'Kadiatou Sangare', 'Dossier incomplet', 'moyenne', 'ouvert', 'Affi Coulibaly')
on conflict (id) do nothing;

insert into public.legacy_bo_communications (id, title, type, content, target_group, target_zone, status, sent_count, delivery_rate, sent_at)
values
  ('legacy-communication-001', 'Rappel de collecte', 'notification', 'Les déclarations de récolte sont ouvertes cette semaine.', 'producteurs', 'Bouake', 'envoyee', 32, 0.94, now() - interval '1 day')
on conflict (id) do nothing;

insert into public.legacy_bo_keiwa_accounts (id, holder_name, holder_phone, zone, balance, transaction_count, is_active)
values
  ('legacy-keiwa-account-001', 'Awa Kone', '0701020304', 'Adjame', 125000, 4, true),
  ('legacy-keiwa-account-002', 'Kouadio Yao', '0744444444', 'Bouake', 87500, 3, true)
on conflict (id) do nothing;

insert into public.legacy_bo_keiwa_transactions (id, type, amount, sender_name, sender_phone, recipient_name, recipient_phone, account_id, status)
values
  ('legacy-keiwa-tx-001', 'depot', 50000, 'Awa Kone', '0701020304', 'Compte Keiwa', '0701020304', 'legacy-keiwa-account-001', 'termine')
on conflict (id) do nothing;

insert into public.legacy_bo_api_keys (id, name, description, key, secret_hash, permissions, request_count, is_active, created_by)
values
  ('legacy-api-key-001', 'Dashboard local', 'Clé pour les tests locaux', 'jlb_local_demo', 'seed-secret-hash', 'read:dashboard,read:actors', 12, true, 'bo-user-001')
on conflict (id) do nothing;

insert into public.legacy_bo_deliveries (id, order_id, sender_name, sender_phone, recipient_name, recipient_phone, address, zone, status, courier_name)
values
  ('legacy-delivery-001', 'legacy-order-001', 'Coopérative Bouaké', '0703030303', 'Kouadio Yao', '0744444444', 'Marché de Bouaké, stand 12', 'Bouake', 'en_cours', 'Wôrô-Wôrô Express')
on conflict (id) do nothing;

insert into public.legacy_bo_cron_jobs (id, name, schedule, command, status, run_count, avg_duration_ms, next_run_at)
values
  ('legacy-cron-001', 'Nettoyage des sessions', '0 3 * * *', 'cleanup_device_sessions', 'actif', 24, 180, now() + interval '1 day')
on conflict (id) do nothing;

insert into public.legacy_bo_credit_scores (id, actor_id, actor_name, zone, score, risk_level, credit_limit, last_calculated_at)
values
  ('legacy-score-001', '#M-0001', 'Awa Kone', 'Adjame', 82, 'faible', 150000, now()),
  ('legacy-score-002', '#P-0002', 'Kouadio Yao', 'Bouake', 68, 'modere', 75000, now())
on conflict (id) do nothing;

insert into public.legacy_bo_contents (id, title, type, category, content, excerpt, author, status, difficulty, duration, target_role, sort_order, view_count)
values
  ('legacy-content-001', 'Enregistrer une vente', 'guide', 'marchand', 'Ajoutez les produits, vérifiez le total puis confirmez le paiement.', 'Les étapes de base de la caisse.', 'Équipe Jùlaba', 'publie', 'debutant', '5 min', 'marchand', 1, 18),
  ('legacy-content-002', 'Valider un dossier', 'guide', 'enrolement', 'Vérifiez les informations et validez uniquement les dossiers complets.', 'Contrôle qualité des enrôlements.', 'Équipe Jùlaba', 'publie', 'intermediaire', '8 min', 'identificateur', 2, 11)
on conflict (id) do nothing;

insert into public.legacy_bo_platform_configs (id, category, config)
values
  ('legacy-config-001', 'notifications', '{"enabled":true,"digest":"daily"}'),
  ('legacy-config-002', 'offline', '{"maxQueueSize":100,"retryLimit":3}')
on conflict (id) do nothing;

insert into public.legacy_bo_system_events (id, level, source, message)
values
  ('legacy-event-001', 'INFO', 'seed', 'Base locale initialisée'),
  ('legacy-event-002', 'WARN', 'stock', 'Stock faible pour l’huile rouge')
on conflict (id) do nothing;

insert into public.legacy_audit_logs (id, user_id, user_name, user_email, action, module, details, ip_address, user_agent, signature)
values
  ('legacy-audit-001', 'bo-user-001', 'Aminata KONE', 'aminata@julaba.ci', 'create', 'sales', 'Vente de démonstration créée', '127.0.0.1', 'Supabase seed', 'seed'),
  ('legacy-audit-002', 'bo-user-004', 'Fatou SORO', 'fatou@julaba.ci', 'review', 'enrolements', 'Dossier DOS-2026-0003 consulté', '127.0.0.1', 'Supabase seed', 'seed')
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- 8. Tables techniques : alertes, appareils, sessions et conflits
-- ----------------------------------------------------------------
insert into public.alerts (organization_id, severity, title, message, module, acknowledged)
values
  ('00000000-0000-0000-0000-000000000001', 'haute', 'Stock faible', 'Le stock d’huile rouge est inférieur au seuil.', 'stock', false),
  ('00000000-0000-0000-0000-000000000001', 'moyenne', 'Dossier à vérifier', 'Un dossier coopératif attend une vérification.', 'enrolement', false)
on conflict do nothing;

insert into public.devices (organization_id, user_id, device_key_hash, label, last_seen_at, expires_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'seed-device-key-001', 'Téléphone Awa - local', now(), now() + interval '90 days'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'seed-device-key-002', 'Tablette Affi - local', now() - interval '1 day', now() + interval '90 days')
on conflict do nothing;

insert into public.device_sessions (id, subject, token_hash, expires_at)
values
  ('device-session-001', 'merchant:merchant-1', 'seed-device-token-001', now() + interval '30 days'),
  ('device-session-002', 'producteur:producteur-1', 'seed-device-token-002', now() + interval '30 days')
on conflict (id) do nothing;

insert into public.bo_sessions (id, user_id, token_hash, ip_address, user_agent, expires_at, last_used_at)
values
  ('bo-session-001', 'bo-user-001', 'seed-bo-token-001', '127.0.0.1', 'Supabase seed', now() + interval '8 hours', now()),
  ('bo-session-002', 'bo-user-004', 'seed-bo-token-002', '127.0.0.1', 'Supabase seed', now() + interval '8 hours', now() - interval '30 minutes')
on conflict (id) do nothing;

insert into public.bo_mfa_challenges (id, user_id, code_hash, attempts, expires_at)
values
  ('bo-mfa-001', 'bo-user-001', 'seed-mfa-code-123456', 0, now() + interval '5 minutes')
on conflict (id) do nothing;

insert into public.legacy_bo_mutations (id, actor_id, actor_name, from_zone, to_zone, reason, status, requested_by, requested_at)
values
  ('legacy-mutation-001', '#M-0003', 'Fatoumata Keita', 'Cocody', 'Adjame', 'Changement de point de vente', 'en_attente', 'Fatou Soro', now() - interval '1 day')
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- 10. Catalogues backoffice
-- ----------------------------------------------------------------
insert into public.roles (code, label, rank, is_backoffice) values
  ('super_admin', 'Super administrateur', 50, true),
  ('admin_general', 'Administrateur général', 40, true),
  ('admin_national', 'Administrateur national', 30, true),
  ('gestionnaire_zone', 'Gestionnaire de zone', 20, true),
  ('operateur_terrain', 'Opérateur terrain', 10, true),
  ('marchand', 'Marchand', 0, false),
  ('producteur', 'Producteur', 0, false),
  ('identificateur', 'Identificateur', 0, false)
on conflict (code) do update set
  label = excluded.label,
  rank = excluded.rank,
  is_backoffice = excluded.is_backoffice;

insert into public.permissions (code, module) values
  ('dashboard', 'dashboard'), ('acteurs', 'acteurs'), ('enrolement', 'enrolement'),
  ('zones', 'zones'), ('missions', 'missions'), ('supervision', 'supervision'),
  ('utilisateurs', 'utilisateurs'), ('rapports', 'rapports'), ('audit', 'audit'),
  ('institutions', 'institutions'), ('moderation', 'moderation'), ('mutations', 'mutations'),
  ('contenus', 'contenus'), ('monitoring-ia', 'monitoring-ia'), ('events', 'events'),
  ('analytics', 'analytics'), ('scores', 'scores'), ('api-keys', 'api-keys'),
  ('marketplace', 'marketplace'), ('livraison', 'livraison'), ('communication', 'communication'),
  ('cron', 'cron'), ('config-institution', 'config-institution'), ('keiwa', 'keiwa'),
  ('producteurs', 'producteurs'), ('tontines', 'tontines'), ('device-sessions', 'device-sessions'),
  ('sync-conflicts', 'sync-conflicts'), ('notifications', 'notifications'), ('academie', 'academie')
on conflict (code) do update set module = excluded.module;

insert into public.role_permissions (role_code, permission_code)
select r, p from (values
  ('super_admin', 'dashboard'), ('admin_general', 'dashboard'), ('admin_national', 'dashboard'), ('gestionnaire_zone', 'dashboard'), ('operateur_terrain', 'dashboard'),
  ('super_admin', 'acteurs'), ('admin_general', 'acteurs'), ('admin_national', 'acteurs'), ('gestionnaire_zone', 'acteurs'), ('operateur_terrain', 'acteurs'),
  ('super_admin', 'enrolement'), ('admin_general', 'enrolement'), ('admin_national', 'enrolement'), ('gestionnaire_zone', 'enrolement'), ('operateur_terrain', 'enrolement'),
  ('super_admin', 'zones'), ('admin_general', 'zones'), ('gestionnaire_zone', 'zones'),
  ('super_admin', 'missions'), ('admin_general', 'missions'), ('gestionnaire_zone', 'missions'),
  ('super_admin', 'supervision'), ('admin_national', 'supervision'), ('gestionnaire_zone', 'supervision'), ('operateur_terrain', 'supervision'),
  ('super_admin', 'utilisateurs'),
  ('super_admin', 'rapports'), ('admin_national', 'rapports'),
  ('super_admin', 'audit'), ('admin_national', 'audit'), ('gestionnaire_zone', 'audit'),
  ('super_admin', 'institutions'), ('admin_general', 'institutions'),
  ('super_admin', 'moderation'), ('gestionnaire_zone', 'moderation'), ('operateur_terrain', 'moderation'),
  ('super_admin', 'mutations'), ('gestionnaire_zone', 'mutations'), ('operateur_terrain', 'mutations'),
  ('super_admin', 'contenus'), ('admin_general', 'contenus'),
  ('super_admin', 'monitoring-ia'), ('admin_general', 'monitoring-ia'),
  ('super_admin', 'events'),
  ('super_admin', 'analytics'), ('admin_national', 'analytics'),
  ('super_admin', 'scores'), ('admin_national', 'scores'),
  ('super_admin', 'api-keys'),
  ('super_admin', 'marketplace'), ('admin_general', 'marketplace'),
  ('super_admin', 'livraison'), ('admin_general', 'livraison'),
  ('super_admin', 'communication'), ('admin_national', 'communication'),
  ('super_admin', 'cron'),
  ('super_admin', 'config-institution'),
  ('super_admin', 'keiwa'), ('admin_general', 'keiwa'),
  ('super_admin', 'producteurs'), ('admin_general', 'producteurs'), ('admin_national', 'producteurs'), ('gestionnaire_zone', 'producteurs'), ('operateur_terrain', 'producteurs'),
  ('super_admin', 'tontines'), ('admin_general', 'tontines'), ('admin_national', 'tontines'),
  ('super_admin', 'device-sessions'), ('admin_general', 'device-sessions'),
  ('super_admin', 'sync-conflicts'), ('admin_general', 'sync-conflicts'),
  ('super_admin', 'notifications'), ('admin_national', 'notifications'),
  ('super_admin', 'academie'), ('admin_general', 'academie')
) as seed(role_code, permission_code)
on conflict (role_code, permission_code) do nothing;

insert into public.merchant_categories (id, label, description, position_chaine) values
  ('grossiste', 'Grossiste', 'Achète en gros volumes aux producteurs et coopératives, revend aux semi-grossistes et détaillants.', 1),
  ('semi_grossiste', 'Semi-grossiste', 'Achète aux producteurs et revend en quantités intermédiaires aux détaillants.', 2),
  ('detaillant', 'Détaillant', 'Vend en petites quantités au consommateur final, sur un marché, en boutique ou en ambulatoire.', 3)
on conflict (id) do update set
  label = excluded.label,
  description = excluded.description,
  position_chaine = excluded.position_chaine;

insert into public.legacy_bo_identificateurs (id, name, zone)
select distinct on (e.identificateur_id)
  e.identificateur_id, e.identificateur_name, e.zone
from public.legacy_bo_enrolments e
where e.identificateur_id is not null and e.identificateur_id <> ''
order by e.identificateur_id, e.created_at desc
on conflict (id) do nothing;

insert into public.legacy_sync_conflict_reports (id, subject, entity, payload, message, client_created_at, reported_at)
values
  ('legacy-conflict-001', 'merchant:merchant-1', 'product', '{"id":"pending-demo-1","name":"Gombo"}', 'Le produit existe déjà sur le serveur.', now() - interval '2 hours', now() - interval '1 hour')
on conflict (id) do nothing;
