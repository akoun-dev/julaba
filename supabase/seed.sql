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
  ('bo-user-001', 'aminata@julaba.ci', 'scrypt:a403091d8bac77ba1195e80c5c3564ab:ee8ada5ee723f4c47099e1bd3d1bb7424b215fcbe1c0f9d7cdc73786979d2901f7acc4fefab4e37d7f61129dc597480839b035a1923370394654326de05e1744', 'Aminata KONE', 'super_admin', null, true),
  ('bo-user-002', 'koffi@julaba.ci', 'scrypt:18a39aee8b00ddd55cf79fcd3ab169e3:290a23e8949af8ca30ab6b1a2c0014bdf53f7cc534bf0e44915148d500a575452a40d1186dfe46ec492b413f0110f39ddab0d1b0573b71e44ae1dbe52459d1dc', 'Koffi YAO', 'admin_general', null, true),
  ('bo-user-003', 'moussa@dge.ci', 'scrypt:5e472d006d876c09277c3acf23343096:bf0a8afc3377c91d23361218ac3adf8f436d83593110169d5496f5e6671909b5dc24d76353827b54a873b4a3775695de686af0f5d35013845ca873f89e9ebd85', 'Moussa TRAORE', 'admin_national', 'National', true),
  ('bo-user-004', 'fatou@julaba.ci', 'scrypt:46704fbbd1fc24ccb53b53dab618b844:67636f827f9cda75a35a0febc7cffb8260f46c83be0b2d8ac950230e6f82fadbff6d0d8ec5240a231929d777497377e1eaadf68a8839f794b0ee6c49f96a8b5e', 'Fatou SORO', 'gestionnaire_zone', 'Adjame', true),
  ('bo-user-005', 'jean@julaba.ci', 'scrypt:0a077955491a5a9ee65e36a94c6d13c7:232a9dfa46e8c5e2db25c607577efa20622c4c606a706e7f04d3507c3a00fd9446bab84db47b61a065c8abe2c312bbd147a6fb11766431e338d371fb8ff26244', 'Jean KOUADIO', 'operateur_terrain', 'Adjame', true),
  ('bo-user-006', 'affi@julaba.ci', 'scrypt:b26967b81756bc5a7b705ef24f5f5fe1:6512bde22912cc2998bd21776305a738bb14a5482137a2212da78936064fb265fa04fc601d2d36bb578881074159394f2d1a9df1be8fa7b2564d59fac9411a78', 'Affi COULIBALY', 'gestionnaire_zone', 'Bouake', true),
  ('bo-user-007', 'yao@julaba.ci', 'scrypt:c6dc8f878f58e8016965ad720d294edf:9ab20f148a1855a5b12cfa0cf9ad7d5d98fd3d019f0e5ed134024966eaea798b67a0e8d3f67f307b2062994e2fe777f007c284229f273b3a0d70e89ab8d77f87', 'Yao KONAN', 'operateur_terrain', 'Kong', false)
 on conflict (id) do update set
   email = excluded.email,
   password_hash = excluded.password_hash,
   name = excluded.name,
   role = excluded.role,
   zone = excluded.zone,
   is_active = excluded.is_active;

-- AUDIT-005 : les PIN de seed sont désormais hachés en scrypt (format
-- scrypt:<salt>:<hash>, cf. auth-pin.ts) et non plus en djb2 brut — un
-- seed est versionné, son djb2 valait mot de passe pour toute la base.
insert into public.merchants (id, first_name, last_name, phone, auth_method, pin_hash)
values
  ('merchant-1', 'Awa', 'KONE', '0701020304', 'pin', 'scrypt:3efcd8aec4f8c670689621cac52a5dbb:9310935d8d7a7301a14576b2ad401dc71e43b43a4f74a802b2b6c4e6f36e02b958f0bd5eb25628c25a6b96760fdd4842025d742d9e6573413a745df211ce29b2'), -- PIN 1234
  ('merchant-2', 'Fatoumata', 'KEITA', '0705060708', 'pin', 'scrypt:14abf74fbc281f9321c5129caa860ec8:7df585f7b627cf4159452a49b1a2b0424849f06e6cf58602f2bad63090c62f982eb69188b00e0f2523b8054e1f344dbd623c700d3838481c97ac4f17a87da97d'), -- PIN 1235
  ('merchant-3', 'Salimata', 'CISSE', '0501020304', 'pin', 'scrypt:13952fe4c4b95e7bfdca848b9fa53857:c9c7ae37355c04d879e2bfd864ec2c3aa85baf9ebd523798a0bced25950dc426838badf461e8421916940591ed06b5d1bff89d3c5b90b769f25c1cf06f69a840'), -- PIN 1236
  ('merchant-test-1', 'Bakari', 'DIALLO', '0541111111', 'pin', 'scrypt:c7288a8610353fd6ce1514d8b3c85b90:95dda0c84947211c10c9a12559dc461b3850542d07b76ba1b7f7a64a5165e3bb4e35dbee267f818324b368ced8c0803eabb98948170dc0a739c645ab521f450b'), -- PIN 1111
  ('merchant-test-2', 'Clarisse', 'BONI', '0542222222', 'pin', 'scrypt:35b411240c9a9fe5a382d8286ec23fed:a8ac85db14a59dcdc66fdbfd57b3a3a8ebcd95d8653e5030c54eca80c21d9210a123b3eca7ed7711e76f1f7769b3229b0b4ee28e08d28f6524044b51221701b7') -- PIN 2222
on conflict (id) do nothing;

insert into public.producers (id, first_name, phone, auth_method, pin_hash)
values
  ('producteur-1', 'Kouadio', '0744444444', 'pin', 'scrypt:27c23762780472a70d9c35191d8efb7a:6234e241e3a2bfea5397329ad6cfb7e0982c96949e87d2985eabbded0b593d645c950b9a5c05f5467795e8f1fe166c6ca07f414301e93b2d9ca1b996511e7796'), -- PIN 0000
  ('producteur-2', 'Moussa', '0123456789', 'pin', 'scrypt:296a9de75586dadbc920daf6e31a52c8:fb29195f63f925a97330b14d23727690495446c1be02023bcfd12c5b52379c255b6c8209ae65877910e1129087230d436cce7f2b1e17ca44051ec479a5c4bae5'), -- PIN 0001
  ('producteur-3', 'Adama', '0177777777', 'pin', 'scrypt:edfe010f3613f082ce1df2b08cf46509:ae1d7359b60ae5613ed7fe3800cd9742ff9c51f21f42d5f2d29d1c592169c4178834cdc975bf8f9aed8cbaeb889b1cd250d792188b6cebf799893641541e9b9b'), -- PIN 0002
  ('producteur-test-1', 'Issa', '0543333333', 'pin', 'scrypt:a442f2a76ab96f19e51dce775fc80140:2e3d1caf9de2fc7cde964bff63f002c02e20bf423b893c2405f71641d14f855317863f7711ddec93de5824a0dd578f398d94ca79ea21ac0c173947c6c15a9f2c'), -- PIN 3333
  ('producteur-test-2', 'Mariam', '0544444444', 'pin', 'scrypt:5557509ae7197053ecb32cc836fcfa4d:e68aac25ea4e49dfbe4b595771a520ca742e13769034d08feca2f832d8ed3512395cf2064689a22c6f930e322c084c313adf51014f328ea41153798362cc0e9b') -- PIN 4444
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- 2. Auth locale, organisation et zones modernes
-- ----------------------------------------------------------------
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000201', 'authenticated', 'authenticated', 'fatou.soro@julaba.ci', '$2a$10$julaba-local-demo', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Fatou","actor_type":"identificateur"}', now(), now()),
  ('00000000-0000-0000-0000-000000000202', 'authenticated', 'authenticated', 'affi.coulibaly@julaba.ci', '$2a$10$julaba-local-demo', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Affi","actor_type":"identificateur"}', now(), now()),
  ('00000000-0000-0000-0000-000000000203', 'authenticated', 'authenticated', 'awa.kone@julaba.ci', '$2a$10$julaba-local-demo', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Awa","actor_type":"marchand"}', now(), now()),
  ('00000000-0000-0000-0000-000000000204', 'authenticated', 'authenticated', 'identificateur@julaba.ci', '$2a$10$julaba-local-demo', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Koffi","last_name":"Diallo","actor_type":"identificateur"}', now(), now()),
  ('00000000-0000-0000-0000-000000000205', 'authenticated', 'authenticated', 'issa.konate@julaba.ci', '$2a$10$julaba-local-demo', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Issa","last_name":"Konate","actor_type":"marchand"}', now(), now()),
  ('00000000-0000-0000-0000-000000000206', 'authenticated', 'authenticated', 'rahama.diallo@julaba.ci', '$2a$10$julaba-local-demo', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Rahama","last_name":"Diallo","actor_type":"marchand"}', now(), now()),
  ('00000000-0000-0000-0000-000000000207', 'authenticated', 'authenticated', 'moussavou.bidie@julaba.ci', '$2a$10$julaba-local-demo', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Moussavou","last_name":"Bidie","actor_type":"marchand"}', now(), now()),
  ('00000000-0000-0000-0000-000000000208', 'authenticated', 'authenticated', 'sandrine.kouame@julaba.ci', '$2a$10$julaba-local-demo', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Sandrine","last_name":"Kouame","actor_type":"marchand"}', now(), now()),
  ('00000000-0000-0000-0000-000000000209', 'authenticated', 'authenticated', 'awa.producer@julaba.ci', '$2a$10$julaba-local-demo', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Awa","actor_type":"producteur"}', now(), now()),
  ('00000000-0000-0000-0000-000000000210', 'authenticated', 'authenticated', 'jean.producer@julaba.ci', '$2a$10$julaba-local-demo', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Jean","last_name":"N''Guessan","actor_type":"producteur"}', now(), now()),
  ('00000000-0000-0000-0000-000000000211', 'authenticated', 'authenticated', 'kone.producer@julaba.ci', '$2a$10$julaba-local-demo', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Kone","last_name":"Fofana","actor_type":"producteur"}', now(), now())
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
  ('00000000-0000-0000-0000-000000000203', 'Awa', 'Kone', '0701020304', 'marchand'),
  ('00000000-0000-0000-0000-000000000204', 'Koffi', 'Diallo', '0700000003', 'identificateur'),
  ('00000000-0000-0000-0000-000000000205', 'Issa', 'Konate', '0507070707', 'marchand'),
  ('00000000-0000-0000-0000-000000000206', 'Rahama', 'Diallo', '0508080808', 'marchand'),
  ('00000000-0000-0000-0000-000000000207', 'Moussavou', 'Bidie', '0509090909', 'marchand'),
  ('00000000-0000-0000-0000-000000000208', 'Sandrine', 'Kouame', '0510101010', 'marchand'),
  ('00000000-0000-0000-0000-000000000209', 'Awa', null, '0511111111', 'producteur'),
  ('00000000-0000-0000-0000-000000000210', 'Jean', 'N''Guessan', '0522222222', 'producteur'),
  ('00000000-0000-0000-0000-000000000211', 'Kone', 'Fofana', '0533333333', 'producteur')
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id, role, zone_id, is_active)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'gestionnaire_zone', '00000000-0000-0000-0000-000000000101', true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'operateur_terrain', '00000000-0000-0000-0000-000000000104', true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'marchand', '00000000-0000-0000-0000-000000000101', true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000204', 'identificateur', '00000000-0000-0000-0000-000000000101', true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000205', 'marchand', '00000000-0000-0000-0000-000000000101', true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000206', 'marchand', '00000000-0000-0000-0000-000000000102', true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000207', 'marchand', '00000000-0000-0000-0000-000000000103', true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000208', 'marchand', '00000000-0000-0000-0000-000000000101', true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000209', 'producteur', '00000000-0000-0000-0000-000000000101', true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000210', 'producteur', '00000000-0000-0000-0000-000000000104', true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000211', 'producteur', '00000000-0000-0000-0000-000000000105', true)
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

-- Ventes de démonstration datées DU JOUR (journée en cours) pour le module
-- BO « Ventes marchands » — greatest() garantit une heure aujourd'hui,
-- même si le seed est exécuté juste après minuit.
insert into public.legacy_sales (id, merchant_id, session_id, client_id, total_amount, change_amount, amount_received, is_voice_sale, voice_transcript, note, created_at)
values
  ('legacy-sale-003', 'merchant-2', null, 'legacy-client-sale-003', 12500, 0, 12500, false, null, null,
    greatest(now() - interval '3 hours', date_trunc('day', now()))),
  ('legacy-sale-004', 'merchant-1', null, 'legacy-client-sale-004', 5000, 0, 5000, true, 'Deux sacs de tomates et un kilo d''oignons', null,
    greatest(now() - interval '90 minutes', date_trunc('day', now()))),
  ('legacy-sale-005', 'merchant-3', null, 'legacy-client-sale-005', 8500, 1500, 10000, false, null, 'Client fidèle — commande spéciale',
    greatest(now() - interval '45 minutes', date_trunc('day', now())))
on conflict (id) do nothing;

insert into public.legacy_sale_items (id, sale_id, product_id, product_name, quantity, unit_price, subtotal)
values
  ('legacy-item-004', 'legacy-sale-003', null, 'Riz local 5 kg', 2, 5000, 10000),
  ('legacy-item-005', 'legacy-sale-003', null, 'Huile végétale 1 L', 1, 2500, 2500),
  ('legacy-item-006', 'legacy-sale-004', 'legacy-product-001', 'Tomates fraîches', 4, 500, 2000),
  ('legacy-item-007', 'legacy-sale-004', 'legacy-product-002', 'Oignons', 4, 750, 3000),
  ('legacy-item-008', 'legacy-sale-005', null, 'Savon de Marseille', 5, 1000, 5000),
  ('legacy-item-009', 'legacy-sale-005', null, 'Beurre de karité', 1, 3500, 3500)
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
  ('device-session-002', 'producteur:producteur-1', 'seed-device-token-002', now() + interval '30 days'),
  ('device-session-003', 'identificateur:ident-demo-000001', 'seed-device-token-003', now() + interval '30 days'),
  ('device-session-004', 'identificateur:ident-demo-000002', 'seed-device-token-004', now() + interval '30 days'),
  ('device-session-005', 'identificateur:ident-demo-000003', 'seed-device-token-005', now() + interval '30 days'),
  ('device-session-006', 'identificateur:ident-demo-000004', 'seed-device-token-006', now() + interval '30 days'),
  ('device-session-007', 'identificateur:ident-test-000005', 'seed-device-token-007', now() + interval '30 days'),
  ('device-session-008', 'identificateur:ident-test-000006', 'seed-device-token-008', now() + interval '30 days'),
  ('device-session-009', 'identificateur:ident-test-000007', 'seed-device-token-009', now() + interval '30 days'),
  ('device-session-010', 'identificateur:ident-test-000008', 'seed-device-token-010', now() + interval '30 days'),
  ('device-session-011', 'identificateur:ident-test-000009', 'seed-device-token-011', now() + interval '30 days'),
  ('device-session-012', 'merchant:merchant-test-1', 'seed-device-token-012', now() + interval '30 days'),
  ('device-session-013', 'merchant:merchant-test-2', 'seed-device-token-013', now() + interval '30 days'),
  ('device-session-014', 'producteur:producteur-test-1', 'seed-device-token-014', now() + interval '30 days'),
  ('device-session-015', 'producteur:producteur-test-2', 'seed-device-token-015', now() + interval '30 days'),
  ('device-session-016', 'cooperateur:coop-1', 'seed-device-token-016', now() + interval '30 days'),
  ('device-session-017', 'cooperateur:coop-2', 'seed-device-token-017', now() + interval '30 days')
on conflict (subject) do update set
  token_hash = excluded.token_hash,
  expires_at = excluded.expires_at;

insert into public.bo_sessions (id, user_id, token_hash, ip_address, user_agent, expires_at, last_used_at)
values
  ('bo-session-001', 'bo-user-001', 'seed-bo-token-001', '127.0.0.1', 'Supabase seed', now() + interval '8 hours', now()),
  ('bo-session-002', 'bo-user-004', 'seed-bo-token-002', '127.0.0.1', 'Supabase seed', now() + interval '8 hours', now() - interval '30 minutes')
on conflict (id) do nothing;

insert into public.legacy_bo_mutations (id, actor_id, actor_name, from_zone, to_zone, reason, status, requested_by, requested_at)
values
  ('legacy-mutation-001', '#M-0003', 'Fatoumata Keita', 'Cocody', 'Adjame', 'Changement de point de vente', 'en_attente', 'Fatou Soro', now() - interval '1 day')
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- 9b. Coopératives — comptes, entités, memberships et sessions
-- ----------------------------------------------------------------

-- Comptes coopérateurs (utilisateurs auth PIN)
insert into public.cooperateurs (id, first_name, phone, auth_method, pin_hash, sexe)
values
  ('coop-1', 'Mariam', '0561111111', 'pin', 'scrypt:9e64aecc849e63ef61e503c961da07d0:4114bfda86fe1493fad5abfac2269c290ffbab3fe0153193e08d6d90a2bcdb331e5dee9f5c08f0c66fb0a39020c1142157df566b6cb1fe993370364e8b771765', 'feminin'),   -- PIN 1234
  ('coop-2', 'Ibrahim', '0562222222', 'pin', 'scrypt:303d915f3950dddda72a003d599fafd0:d8e2843b0a4663d6df48393db8c8c196448f69e4f4ef1eb2d3c7c0f61559de2962c431b57651a12fc0c0a1fc3bc801272c42e1731a7c38fba91a72739c84faa3', 'masculin')  -- PIN 1235
on conflict (id) do nothing;

-- Entités coopératives (une par président)
insert into public.cooperatives (id, nom, responsable_id, commune, actif)
values
  ('00000000-0000-0000-0000-000000006001', 'Coopérative des femmes de Koumassi', 'coop-1', 'Koumassi', true),
  ('00000000-0000-0000-0000-000000006002', 'Coopérative agricole de Yopougon', 'coop-2', 'Yopougon', true)
on conflict (id) do nothing;

-- Appartenance des marchands aux coopératives
insert into public.cooperative_membres (id, cooperative_id, membre_id, statut, role, actif)
values
  ('00000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-000000006001', 'merchant-1', 'actif', 'president', true),
  ('00000000-0000-0000-0000-000000006102', '00000000-0000-0000-0000-000000006001', 'merchant-2', 'actif', 'membre', true),
  ('00000000-0000-0000-0000-000000006103', '00000000-0000-0000-0000-000000006002', 'merchant-3', 'actif', 'membre', true)
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
select role_code, permission_code from (values
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

-- Identificateurs provisionnés par le back-office (règle produit : pas
-- d'auto-inscription sur l'app). Le compte démo 05 55 55 55 55 correspond
-- à l'astuce affichée sur l'écran d'authentification (PIN créé sur
-- l'appareil à la première connexion) ; chaque compte reçoit un code agent
-- unique JID-XXXX utilisable en lieu et place du numéro.
--
-- Upsert par agent_code : si un enregistrement portant le même JID existe
-- déjà (id potentiellement différent), on le MET À JOUR.
do $$
declare
  r jsonb;
  v_id text; v_name text; v_first text; v_last text;
  v_phone text; v_email text; v_zone text; v_code text; v_active boolean;
begin
  for r in select * from jsonb_array_elements('[
    {"id":"ident-demo-000001","name":"Kouamé Bamba","first_name":"Kouamé","last_name":"Bamba","phone":"0555555555","email":"kouame.bamba@julaba.ci","zone":"Adjamé","agent_code":"JID-0001"},
    {"id":"ident-demo-000002","name":"Fatou Soro","first_name":"Fatou","last_name":"Soro","phone":"0700000001","email":"fatou.soro@julaba.ci","zone":"Cocody","agent_code":"JID-0002"},
    {"id":"ident-demo-000003","name":"Affi Coulibaly","first_name":"Affi","last_name":"Coulibaly","phone":"0700000002","email":"affi.coulibaly@julaba.ci","zone":"Yopougon","agent_code":"JID-0003"},
    {"id":"ident-demo-000004","name":"Koffi Diallo","first_name":"Koffi","last_name":"Diallo","phone":"0700000003","email":"koffi.diallo@julaba.ci","zone":"Bouaké","agent_code":"JID-0004"},
    {"id":"ident-test-000005","name":"Mariam Ouattara","first_name":"Mariam","last_name":"Ouattara","phone":"0540000005","email":"mariam.ouattara@julaba.ci","zone":"Adjamé","agent_code":"JID-0005"},
    {"id":"ident-test-000006","name":"Ibrahim Traoré","first_name":"Ibrahim","last_name":"Traoré","phone":"0540000006","email":"ibrahim.traore@julaba.ci","zone":"Yopougon","agent_code":"JID-0006"},
    {"id":"ident-test-000007","name":"Awa Cissé","first_name":"Awa","last_name":"Cissé","phone":"0540000007","email":"awa.cisse@julaba.ci","zone":"Bouaké","agent_code":"JID-0007"},
    {"id":"ident-test-000008","name":"Serge N''Guessan","first_name":"Serge","last_name":"N''Guessan","phone":"0540000008","email":"serge.nguessan@julaba.ci","zone":"San Pedro","agent_code":"JID-0008"},
    {"id":"ident-test-000009","name":"Adjoua Kouamé","first_name":"Adjoua","last_name":"Kouamé","phone":"0540000009","email":"adjoua.kouame@julaba.ci","zone":"Korhogo","agent_code":"JID-0009"},
    {"id":"ident-test-000010","name":"Bakary Touré","first_name":"Bakary","last_name":"Touré","phone":"0540000010","email":"bakary.toure@julaba.ci","zone":"Daloa","agent_code":"JID-0010","active":false}
  ]'::jsonb) loop
    v_id    := r->>'id';
    v_name  := r->>'name';
    v_first := r->>'first_name';
    v_last  := r->>'last_name';
    v_phone := r->>'phone';
    v_email := r->>'email';
    v_zone  := r->>'zone';
    v_code  := r->>'agent_code';
    v_active := coalesce((r->>'active')::text, 'true')::boolean;

    if exists (select 1 from public.legacy_bo_identificateurs where agent_code = v_code) then
      update public.legacy_bo_identificateurs set
        id = v_id, name = v_name, first_name = v_first, last_name = v_last,
        phone = v_phone, email = v_email, zone = v_zone, is_active = v_active
      where agent_code = v_code;
    else
      insert into public.legacy_bo_identificateurs
        (id, name, first_name, last_name, phone, email, zone, agent_code, is_active)
      values (v_id, v_name, v_first, v_last, v_phone, v_email, v_zone, v_code, v_active);
    end if;
  end loop;
end $$;

-- Identificateurs provenant des enrôlements (insérés après les comptes
-- démo/test pour ne pas conflictuer sur agent_code). ON CONFLICT DO
-- NOTHING car les comptes démo/test ont déjà la priorité.
insert into public.legacy_bo_identificateurs (id, name, zone)
select distinct on (e.identificateur_id)
  e.identificateur_id, e.identificateur_name, e.zone
from public.legacy_bo_enrolments e
where e.identificateur_id is not null and e.identificateur_id <> ''
order by e.identificateur_id, e.created_at desc
on conflict do nothing;

-- Objectifs mensuels définis depuis le back-office (source de vérité de la
-- mission mensuelle affichée sur l'app identificateur). Mois courant, pour
-- que la démo reste vivante quel que soit le jour d'exécution du seed.
insert into public.legacy_bo_objectifs (id, scope, cible_id, cible_label, month, year, target, created_by)
values
  ('legacy-objectif-001', 'identificateur', 'ident-demo-000001', 'Kouamé Bamba',
     extract(month from now())::int - 1, extract(year from now())::int, 40, 'seed'),
  ('legacy-objectif-002', 'identificateur', 'ident-demo-000002', 'Fatou Soro',
     extract(month from now())::int - 1, extract(year from now())::int, 30, 'seed'),
  ('legacy-objectif-003', 'identificateur', 'ident-demo-000003', 'Affi Coulibaly',
     extract(month from now())::int - 1, extract(year from now())::int, 25, 'seed'),
  ('legacy-objectif-005', 'identificateur', 'ident-test-000005', 'Mariam Ouattara',
     extract(month from now())::int - 1, extract(year from now())::int, 35, 'seed'),
  ('legacy-objectif-006', 'identificateur', 'ident-test-000006', 'Ibrahim Traoré',
     extract(month from now())::int - 1, extract(year from now())::int, 20, 'seed'),
  ('legacy-objectif-007', 'identificateur', 'ident-test-000007', 'Awa Cissé',
     extract(month from now())::int - 1, extract(year from now())::int, 28, 'seed'),
  ('legacy-objectif-008', 'identificateur', 'ident-test-000008', 'Serge N''Guessan',
     extract(month from now())::int - 1, extract(year from now())::int, 22, 'seed'),
  ('legacy-objectif-009', 'identificateur', 'ident-test-000009', 'Adjoua Kouamé',
     extract(month from now())::int - 1, extract(year from now())::int, 30, 'seed'),
  ('legacy-objectif-004', 'zone', 'adjamé', 'Adjamé',
     extract(month from now())::int - 1, extract(year from now())::int, 60, 'seed')
on conflict (scope, cible_id, month, year) do nothing;

-- Seuils par défaut du moteur d'alertes BO (proactif) : dossiers en
-- attente > 48 h, identificateur inactif > 7 jours, chute de ventes
-- > 30 % vs moyenne 7 jours, objectif en retard > 20 % du rythme attendu.
insert into public.legacy_bo_alert_rules (id, rule_type, threshold, enabled, created_by)
values
  ('legacy-alert-rule-001', 'dossiers_en_attente', 48, true, 'seed'),
  ('legacy-alert-rule-002', 'identificateur_inactif', 7, true, 'seed'),
  ('legacy-alert-rule-003', 'chute_ventes', 30, true, 'seed'),
  ('legacy-alert-rule-004', 'objectif_en_retard', 20, true, 'seed')
on conflict (rule_type) do nothing;

insert into public.legacy_sync_conflict_reports (id, subject, entity, payload, message, client_created_at, reported_at)
values
  ('legacy-conflict-001', 'merchant:merchant-1', 'product', '{"id":"pending-demo-1","name":"Gombo"}', 'Le produit existe déjà sur le serveur.', now() - interval '2 hours', now() - interval '1 hour')
on conflict (id) do nothing;

-- ================================================================
-- 11. Seed étendu — données pour admin, identificateur, cooperative
-- ================================================================

-- ----------------------------------------------------------------
-- 11a. Comptes marchands et producteurs supplémentaires
-- ----------------------------------------------------------------
insert into public.merchants (id, first_name, last_name, phone, auth_method, pin_hash)
values
  ('merchant-4', 'Issa', 'KONATE', '0507070707', 'pin', 'scrypt:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6:aaa111bbb222ccc333ddd444eee555fff666777888999000aaabbbcccdddeeefffggghhhiijj'),
  ('merchant-5', 'Rahama', 'DIALLO', '0508080808', 'pin', 'scrypt:b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7:bbb222ccc333ddd444eee555fff666777888999000aaabbbcccdddeeefffggghhhiijjkkk'),
  ('merchant-6', 'Moussavou', 'BIDIE', '0509090909', 'pin', 'scrypt:c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8:ccc333ddd444eee555fff666777888999000aaabbbcccdddeeefffggghhhiijjkkklllmmm'),
  ('merchant-7', 'Sandrine', 'KOUAME', '0510101010', 'pin', 'scrypt:d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9:ddd444eee555fff666777888999000aaabbbcccdddeeefffggghhhiijjkkklllmmmnnn')
on conflict (id) do nothing;

insert into public.producers (id, first_name, phone, auth_method, pin_hash)
values
  ('producteur-4', 'Awa', '0511111111', 'pin', 'scrypt:e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0:eee555fff666777888999000aaabbbcccdddeeefffggghhhiijjkkklllmmmnnnooo'),
  ('producteur-5', 'Jean', '0522222222', 'pin', 'scrypt:f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1:fff666777888999000aaabbbcccdddeeefffggghhhiijjkkklllmmmnnnooopppqqq'),
  ('producteur-6', 'Kone', '0533333333', 'pin', 'scrypt:a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2:777888999000aaabbbcccdddeeefffggghhhiijjkkklllmmmnnnooopppqqqrrrss')
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- 11b. Acteurs modernes supplémentaires
-- ----------------------------------------------------------------
insert into public.actors (id, organization_id, zone_id, actor_code, first_name, last_name, actor_type, phone, status, gps_lat, gps_lng, identificateur_user_id, identificateur_name, validated_at, categorie_marchand, notes)
values
  ('00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', '#M-0005', 'Issa', 'Konate', 'marchand', '0507070707', 'actif', 5.3550, -4.0050, '00000000-0000-0000-0000-000000000201', 'Fatou Soro', now(), 'grossiste', 'Grossiste Adjamé'),
  ('00000000-0000-0000-0000-000000001006', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000102', '#M-0006', 'Rahama', 'Diallo', 'marchand', '0508080808', 'actif', 5.3480, -3.9950, '00000000-0000-0000-0000-000000000201', 'Fatou Soro', now(), 'detaillant', 'Détaillante Cocody'),
  ('00000000-0000-0000-0000-000000001007', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000103', '#M-0007', 'Moussavou', 'Bidie', 'marchand', '0509090909', 'actif', 5.3400, -4.0200, '00000000-0000-0000-0000-000000000202', 'Affi Coulibaly', now(), 'semi_grossiste', 'Semi-grossiste Yopougon'),
  ('00000000-0000-0000-0000-000000001008', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', '#M-0008', 'Sandrine', 'Kouame', 'marchand', '0510101010', 'suspendu', 5.3620, -4.0100, '00000000-0000-0000-0000-000000000201', 'Fatou Soro', now(), 'detaillant', 'Compte suspendu — documents expirés'),
  ('00000000-0000-0000-0000-000000001009', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000104', '#P-0009', 'Awa', 'Kone', 'producteur', '0511111111', 'actif', 7.6800, -5.0400, '00000000-0000-0000-0000-000000000202', 'Affi Coulibaly', now(), null, 'Productrice maraîchère Bouaké'),
  ('00000000-0000-0000-0000-000000001010', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000105', '#P-0010', 'Jean', 'N''Guessan', 'producteur', '0522222222', 'actif', 9.4700, -5.6200, '00000000-0000-0000-0000-000000000202', 'Affi Coulibaly', now(), null, 'Producteur céréalier Korhogo'),
  ('00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000106', '#C-0011', 'Kone', 'Fofana', 'cooperatif', '0533333333', 'actif', 9.4500, -5.6400, '00000000-0000-0000-0000-000000000202', 'Affi Coulibaly', now(), null, 'Coopérative Kong'),
  ('00000000-0000-0000-0000-000000001012', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000103', '#M-0012', 'Aminata', 'Bamba', 'marchand', '0512121212', 'en_attente', 5.3450, -4.0150, null, null, null, null, null),
  ('00000000-0000-0000-0000-000000001013', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', '#M-0013', 'Bakari', 'Sangare', 'marchand', '0513131313', 'rejete', 5.3580, -4.0060, '00000000-0000-0000-0000-000000000201', 'Fatou Soro', null, null, 'Dossier rejeté — CNI invalide')
on conflict (id) do nothing;

insert into public.legacy_bo_actors (id, actor_id, first_name, last_name, type, phone, zone, status, gps_lat, gps_lng, identificateur_name, categorie_marchand)
values
  ('legacy-actor-004', '#M-0005', 'Issa', 'Konate', 'marchand', '0507070707', 'Adjame', 'actif', 5.3550, -4.0050, 'Fatou Soro', 'grossiste'),
  ('legacy-actor-005', '#M-0006', 'Rahama', 'Diallo', 'marchand', '0508080808', 'Cocody', 'actif', 5.3480, -3.9950, 'Fatou Soro', 'detaillant'),
  ('legacy-actor-006', '#M-0007', 'Moussavou', 'Bidie', 'marchand', '0509090909', 'Yopougon', 'actif', 5.3400, -4.0200, 'Affi Coulibaly', 'semi_grossiste'),
  ('legacy-actor-007', '#M-0008', 'Sandrine', 'Kouame', 'marchand', '0510101010', 'Adjame', 'suspendu', 5.3620, -4.0100, 'Fatou Soro', 'detaillant'),
  ('legacy-actor-008', '#P-0009', 'Awa', 'Kone', 'producteur', '0511111111', 'Bouake', 'actif', 7.6800, -5.0400, 'Affi Coulibaly', null),
  ('legacy-actor-009', '#P-0010', 'Jean', 'N''Guessan', 'producteur', '0522222222', 'Korhogo', 'actif', 9.4700, -5.6200, 'Affi Coulibaly', null),
  ('legacy-actor-010', '#C-0011', 'Kone', 'Fofana', 'cooperatif', '0533333333', 'Kong', 'actif', 9.4500, -5.6400, 'Affi Coulibaly', null),
  ('legacy-actor-011', '#M-0012', 'Aminata', 'Bamba', 'marchand', '0512121212', 'Yopougon', 'en_attente', 5.3450, -4.0150, null, null),
  ('legacy-actor-012', '#M-0013', 'Bakari', 'Sangare', 'marchand', '0513131313', 'Adjame', 'rejete', 5.3580, -4.0060, 'Fatou Soro', null)
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- 11c. Enrôlements supplémentaires
-- ----------------------------------------------------------------
insert into public.enrolments (organization_id, zone_id, dossier_id, actor_name, actor_type, phone, has_photo, has_gps, gps_lat, gps_lng, identificateur_user_id, identificateur_name, status, validated_at, reject_reason, categorie_marchand, activite)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'DOS-2026-0004', 'Issa Konate', 'marchand', '0507070707', true, true, 5.3550, -4.0050, '00000000-0000-0000-0000-000000000201', 'Fatou Soro', 'valide', now() - interval '3 days', null, 'grossiste', 'Commerce en gros'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000102', 'DOS-2026-0005', 'Rahama Diallo', 'marchand', '0508080808', true, true, 5.3480, -3.9950, '00000000-0000-0000-0000-000000000201', 'Fatou Soro', 'valide', now() - interval '2 days', null, 'detaillant', 'Boutique de quartier'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000103', 'DOS-2026-0006', 'Moussavou Bidie', 'marchand', '0509090909', true, false, 5.3400, -4.0200, '00000000-0000-0000-0000-000000000202', 'Affi Coulibaly', 'en_attente', null, null, 'semi_grossiste', null),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'DOS-2026-0007', 'Sandrine Kouame', 'marchand', '0510101010', false, true, 5.3620, -4.0100, '00000000-0000-0000-0000-000000000201', 'Fatou Soro', 'info_demandee', null, null, null, 'Documents manquants — CNI expirée'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000104', 'DOS-2026-0008', 'Awa Kone', 'producteur', '0511111111', true, true, 7.6800, -5.0400, '00000000-0000-0000-0000-000000000202', 'Affi Coulibaly', 'valide', now() - interval '5 days', null, null, 'Maraîchage'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000105', 'DOS-2026-0009', 'Jean N''Guessan', 'producteur', '0522222222', true, true, 9.4700, -5.6200, '00000000-0000-0000-0000-000000000202', 'Affi Coulibaly', 'valide', now() - interval '1 day', null, null, 'Céréaliculture'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000106', 'DOS-2026-0010', 'Kone Fofana', 'cooperatif', '0533333333', true, true, 9.4500, -5.6400, '00000000-0000-0000-0000-000000000202', 'Affi Coulibaly', 'valide', now() - interval '4 days', null, null, 'Coopérative agricole'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000103', 'DOS-2026-0011', 'Aminata Bamba', 'marchand', '0512121212', false, false, null, null, null, 'Non assigné', 'en_attente', null, null, null, null),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'DOS-2026-0012', 'Bakari Sangare', 'marchand', '0513131313', true, true, 5.3580, -4.0060, '00000000-0000-0000-0000-000000000201', 'Fatou Soro', 'rejete', null, 'CNI invalide — numéro ne correspond pas', null, null)
on conflict (organization_id, dossier_id) do nothing;

insert into public.legacy_bo_enrolments (id, dossier_id, actor_name, actor_type, zone, identificateur_name, status, has_photo, has_gps, phone, submitted_at, info_request_reason)
values
  ('legacy-enrolment-003', 'DOS-2026-0004', 'Issa Konate', 'marchand', 'Adjame', 'Fatou Soro', 'valide', true, true, '0507070707', now() - interval '3 days', null),
  ('legacy-enrolment-004', 'DOS-2026-0005', 'Rahama Diallo', 'marchand', 'Cocody', 'Fatou Soro', 'valide', true, true, '0508080808', now() - interval '2 days', null),
  ('legacy-enrolment-005', 'DOS-2026-0006', 'Moussavou Bidie', 'marchand', 'Yopougon', 'Affi Coulibaly', 'en_attente', true, false, '0509090909', now() - interval '1 day', null),
  ('legacy-enrolment-006', 'DOS-2026-0007', 'Sandrine Kouame', 'marchand', 'Adjame', 'Fatou Soro', 'info_demandee', false, true, '0510101010', now() - interval '4 days', 'Documents manquants — CNI expirée'),
  ('legacy-enrolment-007', 'DOS-2026-0008', 'Awa Kone', 'producteur', 'Bouake', 'Affi Coulibaly', 'valide', true, true, '0511111111', now() - interval '5 days', null),
  ('legacy-enrolment-008', 'DOS-2026-0009', 'Jean N''Guessan', 'producteur', 'Korhogo', 'Affi Coulibaly', 'valide', true, true, '0522222222', now() - interval '1 day', null),
  ('legacy-enrolment-009', 'DOS-2026-0010', 'Kone Fofana', 'cooperatif', 'Kong', 'Affi Coulibaly', 'valide', true, true, '0533333333', now() - interval '4 days', null),
  ('legacy-enrolment-010', 'DOS-2026-0011', 'Aminata Bamba', 'marchand', 'Yopougon', 'Non assigné', 'en_attente', false, false, '0512121212', now() - interval '12 hours', null),
  ('legacy-enrolment-011', 'DOS-2026-0012', 'Bakari Sangare', 'marchand', 'Adjame', 'Fatou Soro', 'rejete', true, true, '0513131313', now() - interval '6 days', null)
on conflict (id) do nothing;
-- ----------------------------------------------------------------
-- 11d. Produits supplémentaires
-- ----------------------------------------------------------------
insert into public.products (id, organization_id, merchant_user_id, name, category, price_unit, stock_qty, is_active)
values
  ('00000000-0000-0000-0000-000000003005', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'Gombo frais', 'Légumes', 1000, 45, true),
  ('00000000-0000-0000-0000-000000003006', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'Arachides décortiquées', 'Légumineuses', 1500, 60, true),
  ('00000000-0000-0000-0000-000000003007', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'Ignames', 'Tubercules', 800, 35, true),
  ('00000000-0000-0000-0000-000000003008', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'Piment frais', 'Condiments', 2000, 25, true),
  ('00000000-0000-0000-0000-000000003009', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000205', 'Riz local 50 kg', 'Céréales', 25000, 12, true),
  ('00000000-0000-0000-0000-000000003010', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000205', 'Huile de palme 5 L', 'Condiments', 7500, 20, true),
  ('00000000-0000-0000-0000-000000003011', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000206', 'Savon de Marseille', 'Hygiène', 1000, 80, true),
  ('00000000-0000-0000-0000-000000003012', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000206', 'Bouillon Cube', 'Condiments', 200, 200, true),
  ('00000000-0000-0000-0000-000000003013', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000207', 'Pâte d''arachide', 'Condiments', 3000, 40, true),
  ('00000000-0000-0000-0000-000000003014', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000207', 'Charbon de bois', 'Énergie', 5000, 15, true)
on conflict (id) do nothing;

insert into public.legacy_products (id, merchant_id, client_id, name, category, price_unit, stock_qty, is_active)
values
  ('legacy-product-004', 'merchant-1', 'legacy-client-product-004', 'Gombo frais', 'Légumes', 1000, 45, true),
  ('legacy-product-005', 'merchant-1', 'legacy-client-product-005', 'Arachides décortiquées', 'Légumineuses', 1500, 60, true),
  ('legacy-product-006', 'merchant-1', 'legacy-client-product-006', 'Ignames', 'Tubercules', 800, 35, true),
  ('legacy-product-007', 'merchant-4', 'legacy-client-product-007', 'Riz local 50 kg', 'Céréales', 25000, 12, true),
  ('legacy-product-008', 'merchant-4', 'legacy-client-product-008', 'Huile de palme 5 L', 'Condiments', 7500, 20, true),
  ('legacy-product-009', 'merchant-5', 'legacy-client-product-009', 'Savon de Marseille', 'Hygiène', 1000, 80, true),
  ('legacy-product-010', 'merchant-5', 'legacy-client-product-010', 'Bouillon Cube', 'Condiments', 200, 200, true),
  ('legacy-product-011', 'merchant-6', 'legacy-client-product-011', 'Pâte d''arachide', 'Condiments', 3000, 40, true),
  ('legacy-product-012', 'merchant-6', 'legacy-client-product-012', 'Charbon de bois', 'Énergie', 5000, 15, true)
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- 11e. Sessions de caisse et ventes supplémentaires
-- ----------------------------------------------------------------
insert into public.cash_sessions (id, organization_id, merchant_user_id, opening_float, total_sales, total_expenses, closing_amount, is_open, opened_at)
values
  ('00000000-0000-0000-0000-000000004002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000205', 50000, 125000, 8000, null, true, now() - interval '6 hours'),
  ('00000000-0000-0000-0000-000000004003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000206', 15000, 42000, 2500, null, true, now() - interval '4 hours'),
  ('00000000-0000-0000-0000-000000004004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000207', 30000, 67000, 5000, 92000, false, now() - interval '1 day')
on conflict (id) do nothing;

insert into public.sales (id, organization_id, merchant_user_id, total_amount, amount_received, change_amount, note, cash_session_id)
values
  ('00000000-0000-0000-0000-000000004103', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000205', 55000, 60000, 5000, 'Vente en gros — 10 sacs de riz', '00000000-0000-0000-0000-000000004002'),
  ('00000000-0000-0000-0000-000000004104', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000205', 35000, 35000, 0, 'Huile de palme et riz', '00000000-0000-0000-0000-000000004002'),
  ('00000000-0000-0000-0000-000000004105', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000205', 35000, 40000, 5000, null, '00000000-0000-0000-0000-000000004002'),
  ('00000000-0000-0000-0000-000000004106', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000206', 18000, 20000, 2000, 'Client fidèle', '00000000-0000-0000-0000-000000004003'),
  ('00000000-0000-0000-0000-000000004107', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000206', 24000, 25000, 1000, 'Savon et bouillons', '00000000-0000-0000-0000-000000004003'),
  ('00000000-0000-0000-0000-000000004108', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000207', 42000, 45000, 3000, 'Vente de la veille', '00000000-0000-0000-0000-000000004004'),
  ('00000000-0000-0000-0000-000000004109', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000207', 25000, 25000, 0, null, '00000000-0000-0000-0000-000000004004')
on conflict (id) do nothing;

insert into public.sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal)
values
  ('00000000-0000-0000-0000-000000004103', '00000000-0000-0000-0000-000000003009', 'Riz local 50 kg', 2, 25000, 50000),
  ('00000000-0000-0000-0000-000000004103', '00000000-0000-0000-0000-000000003012', 'Bouillon Cube', 25, 200, 5000),
  ('00000000-0000-0000-0000-000000004104', '00000000-0000-0000-0000-000000003010', 'Huile de palme 5 L', 3, 7500, 22500),
  ('00000000-0000-0000-0000-000000004104', '00000000-0000-0000-0000-000000003009', 'Riz local 50 kg', 1, 25000, 25000),
  ('00000000-0000-0000-0000-000000004105', '00000000-0000-0000-0000-000000003010', 'Huile de palme 5 L', 2, 7500, 15000),
  ('00000000-0000-0000-0000-000000004105', '00000000-0000-0000-0000-000000003009', 'Riz local 50 kg', 1, 25000, 25000),
  ('00000000-0000-0000-0000-000000004106', '00000000-0000-0000-0000-000000003011', 'Savon de Marseille', 8, 1000, 8000),
  ('00000000-0000-0000-0000-000000004106', '00000000-0000-0000-0000-000000003012', 'Bouillon Cube', 50, 200, 10000),
  ('00000000-0000-0000-0000-000000004107', '00000000-0000-0000-0000-000000003011', 'Savon de Marseille', 12, 1000, 12000),
  ('00000000-0000-0000-0000-000000004107', '00000000-0000-0000-0000-000000003012', 'Bouillon Cube', 60, 200, 12000),
  ('00000000-0000-0000-0000-000000004108', '00000000-0000-0000-0000-000000003013', 'Pâte d''arachide', 10, 3000, 30000),
  ('00000000-0000-0000-0000-000000004108', '00000000-0000-0000-0000-000000003014', 'Charbon de bois', 2, 5000, 10000),
  ('00000000-0000-0000-0000-000000004109', '00000000-0000-0000-0000-000000003013', 'Pâte d''arachide', 5, 3000, 15000),
  ('00000000-0000-0000-0000-000000004109', '00000000-0000-0000-0000-000000003014', 'Charbon de bois', 2, 5000, 10000)
on conflict do nothing;

insert into public.legacy_sales (id, merchant_id, session_id, client_id, total_amount, change_amount, amount_received, is_voice_sale, voice_transcript, note, created_at)
values
  ('legacy-sale-006', 'merchant-4', null, 'legacy-client-sale-006', 55000, 5000, 60000, false, null, 'Vente en gros — 10 sacs de riz', greatest(now() - interval '6 hours', date_trunc('day', now()))),
  ('legacy-sale-007', 'merchant-4', null, 'legacy-client-sale-007', 35000, 0, 35000, false, null, null, greatest(now() - interval '4 hours', date_trunc('day', now()))),
  ('legacy-sale-008', 'merchant-5', null, 'legacy-client-sale-008', 18000, 2000, 20000, false, null, 'Client fidèle', greatest(now() - interval '3 hours', date_trunc('day', now()))),
  ('legacy-sale-009', 'merchant-5', null, 'legacy-client-sale-009', 24000, 1000, 25000, true, 'Savon et bouillons pour la boutique', null, greatest(now() - interval '2 hours', date_trunc('day', now()))),
  ('legacy-sale-010', 'merchant-6', null, 'legacy-client-sale-010', 42000, 3000, 45000, false, null, 'Vente de la veille', greatest(now() - interval '9 hours', date_trunc('day', now()))),
  ('legacy-sale-011', 'merchant-1', null, 'legacy-client-sale-011', 15000, 0, 15000, false, null, null, greatest(now() - interval '1 hours', date_trunc('day', now()))),
  ('legacy-sale-012', 'merchant-2', null, 'legacy-client-sale-012', 22500, 2500, 25000, true, 'Deux kilos de gombo et des oignons', null, greatest(now() - interval '30 minutes', date_trunc('day', now())))
on conflict (id) do nothing;

insert into public.legacy_sale_items (id, sale_id, product_id, product_name, quantity, unit_price, subtotal)
values
  ('legacy-item-010', 'legacy-sale-006', 'legacy-product-007', 'Riz local 50 kg', 2, 25000, 50000),
  ('legacy-item-011', 'legacy-sale-006', 'legacy-product-010', 'Bouillon Cube', 25, 200, 5000),
  ('legacy-item-012', 'legacy-sale-007', 'legacy-product-008', 'Huile de palme 5 L', 3, 7500, 22500),
  ('legacy-item-013', 'legacy-sale-007', 'legacy-product-007', 'Riz local 50 kg', 1, 25000, 25000),
  ('legacy-item-014', 'legacy-sale-008', 'legacy-product-009', 'Savon de Marseille', 8, 1000, 8000),
  ('legacy-item-015', 'legacy-sale-008', 'legacy-product-010', 'Bouillon Cube', 50, 200, 10000),
  ('legacy-item-016', 'legacy-sale-009', 'legacy-product-009', 'Savon de Marseille', 12, 1000, 12000),
  ('legacy-item-017', 'legacy-sale-009', 'legacy-product-010', 'Bouillon Cube', 60, 200, 12000),
  ('legacy-item-018', 'legacy-sale-010', 'legacy-product-011', 'Pâte d''arachide', 10, 3000, 30000),
  ('legacy-item-019', 'legacy-sale-010', 'legacy-product-012', 'Charbon de bois', 2, 5000, 10000),
  ('legacy-item-020', 'legacy-sale-011', 'legacy-product-001', 'Tomates fraîches', 10, 500, 5000),
  ('legacy-item-021', 'legacy-sale-011', 'legacy-product-002', 'Oignons', 10, 750, 7500),
  ('legacy-item-022', 'legacy-sale-011', null, 'Piment frais', 1, 2500, 2500),
  ('legacy-item-023', 'legacy-sale-012', 'legacy-product-004', 'Gombo frais', 5, 1000, 5000),
  ('legacy-item-024', 'legacy-sale-012', 'legacy-product-002', 'Oignons', 10, 750, 7500),
  ('legacy-item-025', 'legacy-sale-012', 'legacy-product-003', 'Bananes plantain', 5, 1500, 7500)
on conflict (id) do nothing;

insert into public.expenses (organization_id, merchant_user_id, amount, category, description, cash_session_id)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000205', 3000, 'Transport', 'Camion de livraison', '00000000-0000-0000-0000-000000004002'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000205', 5000, 'Approvisionnement', 'Sacs de riz en gros', '00000000-0000-0000-0000-000000004002'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000206', 1500, 'Transport', 'Taxi Cocody', '00000000-0000-0000-0000-000000004003'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000206', 1000, 'Fonctionnement', 'Électricité boutique', '00000000-0000-0000-0000-000000004003'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000207', 5000, 'Transport', 'Wôrô-Wôrô Yopougon', '00000000-0000-0000-0000-000000004004')
on conflict do nothing;

insert into public.legacy_expenses (id, merchant_id, client_id, amount, category, description, is_voice, voice_transcript)
values
  ('legacy-expense-003', 'merchant-4', 'legacy-client-expense-003', 3000, 'Transport', 'Camion de livraison', false, null),
  ('legacy-expense-004', 'merchant-4', 'legacy-client-expense-004', 5000, 'Approvisionnement', 'Sacs de riz en gros', false, null),
  ('legacy-expense-005', 'merchant-5', 'legacy-client-expense-005', 1500, 'Transport', 'Taxi Cocody', false, null),
  ('legacy-expense-006', 'merchant-5', 'legacy-client-expense-006', 1000, 'Fonctionnement', 'Électricité boutique', true, 'Mille francs pour l''électricité'),
  ('legacy-expense-007', 'merchant-6', 'legacy-client-expense-007', 5000, 'Transport', 'Wôrô-Wôrô Yopougon', false, null),
  ('legacy-expense-008', 'merchant-1', 'legacy-client-expense-008', 3500, 'Fonctionnement', 'Loyer stand marché', false, null)
on conflict (id) do nothing;

insert into public.stock_movements (organization_id, product_id, user_id, movement_type, quantity, reason)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000003005', '00000000-0000-0000-0000-000000000203', 'entree', 50, 'Réception du producteur'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000003005', '00000000-0000-0000-0000-000000000203', 'vente', -5, 'Vente du matin'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000003006', '00000000-0000-0000-0000-000000000203', 'entree', 60, 'Approvisionnement'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000003009', '00000000-0000-0000-0000-000000000205', 'entree', 15, 'Gros achat usine'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000003009', '00000000-0000-0000-0000-000000000205', 'vente', -3, 'Ventes en gros'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000003011', '00000000-0000-0000-0000-000000000206', 'entree', 80, 'Commande fournisseur'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000003011', '00000000-0000-0000-0000-000000000206', 'vente', -20, 'Ventes boutique')
on conflict do nothing;
-- ----------------------------------------------------------------
-- 11f. Données marchands avancées
-- ----------------------------------------------------------------
insert into public.business_partners (id, merchant_id, kind, name, phone, notes, balance_cfa)
values
  ('bp-001', 'merchant-1', 'client', 'Koudjou Alexandre', '0711111111', 'Client régulier — stand 5B', 0),
  ('bp-002', 'merchant-1', 'fournisseur', 'Société Ivoire Distribution', '0102030405', 'Fournisseur tomates et oignons', -15000),
  ('bp-003', 'merchant-4', 'client', 'Hôtel Ivoire Sofitel', '2722487600', 'Commande hebdomadaire riz', 0),
  ('bp-004', 'merchant-4', 'client', 'Restaurant Chez Mamadou', '0755667788', 'Gros client — riz et huile', 5000),
  ('bp-005', 'merchant-4', 'fournisseur', 'Usine Riz de Bouaké', '0309090909', 'Fournisseur principal riz', -85000),
  ('bp-006', 'merchant-5', 'client', 'Association Femmes Actives', '0766778899', 'Commande savon mensuelle', 0),
  ('bp-007', 'merchant-6', 'client', 'Menuiserie Bois d''Or', '0788990011', 'Achat charbon régulier', 0),
  ('bp-008', 'merchant-6', 'fournisseur', 'Producteurs Arachides Nord', '0545556666', 'Achats arachides et pâte', -22000)
on conflict (id) do nothing;

insert into public.merchant_purchases (id, merchant_id, supplier_id, total_amount, amount_paid, note, is_voice, voice_transcript)
values
  ('purchase-001', 'merchant-4', 'bp-005', 125000, 40000, 'Commande 5 sacs de riz 50 kg', false, null),
  ('purchase-002', 'merchant-4', 'bp-005', 75000, 75000, 'Récupération sacs', true, 'Cinq sacs de riz récupérés'),
  ('purchase-003', 'merchant-5', null, 30000, 30000, 'Achat savons en gros', false, null),
  ('purchase-004', 'merchant-6', 'bp-008', 45000, 23000, 'Arachides et pâte', false, null)
on conflict (id) do nothing;

insert into public.merchant_purchase_items (purchase_id, product_id, product_name, quantity, unit_code, quantity_base, unit_cost_cfa, line_cost_cfa)
values
  ('purchase-001', 'legacy-product-007', 'Riz local 50 kg', 5, 'sac', 250, 25000, 125000),
  ('purchase-002', 'legacy-product-007', 'Riz local 50 kg', 3, 'sac', 150, 25000, 75000),
  ('purchase-003', 'legacy-product-009', 'Savon de Marseille', 30, 'unite', 30, 1000, 30000),
  ('purchase-004', 'legacy-product-011', 'Pâte d''arachide', 10, 'kg', 10, 3000, 30000),
  ('purchase-004', 'legacy-product-005', 'Arachides décortiquées', 10, 'kg', 10, 1500, 15000)
on conflict do nothing;

insert into public.merchant_selling_points (id, merchant_id, client_id, name, kind, archived_at)
values
  ('00000000-0000-0000-0000-000000000601', 'merchant-1', 'sp-client-001', 'Stand Adjamé principal', 'marche', null),
  ('00000000-0000-0000-0000-000000000602', 'merchant-1', 'sp-client-002', 'Boutique Cocody', 'boutique', null),
  ('00000000-0000-0000-0000-000000000603', 'merchant-4', 'sp-client-003', 'Entrepôt Bouaké', 'boutique', null),
  ('00000000-0000-0000-0000-000000000604', 'merchant-4', 'sp-client-004', 'Marché de Bouaké', 'marche', null),
  ('00000000-0000-0000-0000-000000000605', 'merchant-5', 'sp-client-005', 'Boutique Cocody Centre', 'boutique', null),
  ('00000000-0000-0000-0000-000000000606', 'merchant-6', 'sp-client-006', 'Stand Yopougon Kouté', 'marche', null)
on conflict (id) do nothing;

insert into public.merchant_market_sessions (id, merchant_id, client_id, market_name, location_mode, latitude, longitude, starting_cash, status, closed_at, ending_cash, sales_total, expenses_total, started_at)
values
  ('mkt-001', 'merchant-1', 'mkt-client-001', 'Marché Adjamé', 'gps', 5.3600, -4.0083, 25000, 'closed', now() - interval '1 day', 58500, 38500, 3500, now() - interval '1 day'),
  ('mkt-002', 'merchant-4', 'mkt-client-002', 'Marché de Bouaké', 'gps', 7.6900, -5.0300, 50000, 'closed', now() - interval '1 day', 167000, 125000, 8000, now() - interval '1 day'),
  ('mkt-003', 'merchant-5', 'mkt-client-003', 'Boutique Cocody', 'none', 5.3500, -3.9900, 15000, 'open', null, null, 42000, 2500, now() - interval '4 hours'),
  ('mkt-004', 'merchant-6', 'mkt-client-004', 'Marché Yopougon', 'gps', 5.3400, -4.0200, 30000, 'closed', now() - interval '2 days', 92000, 67000, 5000, now() - interval '2 days')
on conflict (id) do nothing;

insert into public.merchant_stock_movements (id, merchant_id, product_id, movement_type, quantity_base, quantity_commercial, unit_code, reason, operation_id, created_by)
values
  ('msm-001', 'merchant-1', 'legacy-product-001', 'SALE', -16, null, 'kg', 'Ventes de la journée', '00000000-0000-0000-0000-000000000001', 'merchant-1'),
  ('msm-002', 'merchant-1', 'legacy-product-001', 'PURCHASE', 100, 100, 'kg', 'Approvisionnement du matin', '00000000-0000-0000-0000-000000000002', 'merchant-1'),
  ('msm-003', 'merchant-4', 'legacy-product-007', 'PURCHASE', 15, 15, 'sac', 'Commande usine', '00000000-0000-0000-0000-000000000003', 'merchant-4'),
  ('msm-004', 'merchant-4', 'legacy-product-007', 'SALE', -3, null, 'sac', 'Ventes en gros', '00000000-0000-0000-0000-000000000004', 'merchant-4'),
  ('msm-005', 'merchant-5', 'legacy-product-009', 'PURCHASE', 80, 80, 'unite', 'Commande fournisseur', '00000000-0000-0000-0000-000000000005', 'merchant-5'),
  ('msm-006', 'merchant-5', 'legacy-product-009', 'SALE', -20, null, 'unite', 'Ventes boutique', '00000000-0000-0000-0000-000000000006', 'merchant-5')
on conflict (id) do nothing;

insert into public.merchant_stock_balances (merchant_id, product_id, quantity_base, last_movement_at)
values
  ('merchant-1', 'legacy-product-001', 84, now()),
  ('merchant-4', 'legacy-product-007', 12, now()),
  ('merchant-4', 'legacy-product-008', 20, now()),
  ('merchant-5', 'legacy-product-009', 60, now()),
  ('merchant-5', 'legacy-product-010', 140, now()),
  ('merchant-6', 'legacy-product-011', 30, now()),
  ('merchant-6', 'legacy-product-012', 15, now())
on conflict (merchant_id, product_id) do update set
  quantity_base = excluded.quantity_base,
  last_movement_at = excluded.last_movement_at;

insert into public.merchant_product_units (id, merchant_id, product_id, unit_code, conversion_to_base, is_base, is_default_sale)
values
  ('mpu-001', 'merchant-1', 'legacy-product-001', 'kg', 1, true, true),
  ('mpu-002', 'merchant-1', 'legacy-product-002', 'kg', 1, true, true),
  ('mpu-003', 'merchant-1', 'legacy-product-003', 'botte', 1, true, true),
  ('mpu-004', 'merchant-4', 'legacy-product-007', 'sac', 50, false, true),
  ('mpu-005', 'merchant-4', 'legacy-product-007', 'kg', 1, true, false),
  ('mpu-006', 'merchant-4', 'legacy-product-008', 'litre', 1, true, true),
  ('mpu-007', 'merchant-4', 'legacy-product-008', 'bidon', 5, false, false),
  ('mpu-008', 'merchant-5', 'legacy-product-009', 'unite', 1, true, true),
  ('mpu-009', 'merchant-5', 'legacy-product-010', 'unite', 1, true, true)
on conflict (id) do nothing;

insert into public.merchant_credit_ops (id, merchant_id, operation_id, kind, partner_id, amount_cfa, note)
values
  ('00000000-0000-0000-0000-000000007001', 'merchant-4', '00000000-0000-0000-0000-000000000010', 'credit', 'bp-003', 50000, 'Crédit Hôtel Ivoire — 2 sacs de riz'),
  ('00000000-0000-0000-0000-000000007002', 'merchant-4', '00000000-0000-0000-0000-000000000011', 'repayment', 'bp-003', 25000, 'Remboursement partiel'),
  ('00000000-0000-0000-0000-000000007003', 'merchant-6', '00000000-0000-0000-0000-000000000012', 'credit', 'bp-007', 15000, 'Crédit Menuiserie Bois d''Or')
on conflict (id) do nothing;
-- ----------------------------------------------------------------
-- 11g. Récoltes et commandes producteur supplémentaires
-- ----------------------------------------------------------------
insert into public.harvests (organization_id, producer_user_id, product_name, quantity_kg, quality, harvested_at, plot, desired_price_per_kg, photo_paths, status, buyer, sale_amount, notes)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'Arachides', 120, 'premium', now() - interval '1 day', 'Parcelle C2', 2000, '[]', 'publiee', null, null, 'Récolte prête pour vente'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'Igname', 300, 'standard', now() - interval '4 days', 'Parcelle D1', 600, '[]', 'publiee', null, null, null),
  ('00000000-0000-0000-0000-000000000001', 'producteur-4', 'Tomates', 200, 'premium', now() - interval '3 days', 'Parcelle E1', 800, '[]', 'publiee', null, null, 'Tomates de saison'),
  ('00000000-0000-0000-0000-000000000001', 'producteur-4', 'Gombo', 80, 'standard', now() - interval '12 hours', 'Parcelle E2', 1200, '[]', 'vendue', 'Marché de Bouaké', 96000, null),
  ('00000000-0000-0000-0000-000000000001', 'producteur-5', 'Manioc', 500, 'standard', now() - interval '6 days', 'Parcelle F1', 250, '[]', 'vendue', 'Coopérative Korhogo', 125000, 'Grosse récolte'),
  ('00000000-0000-0000-0000-000000000001', 'producteur-5', 'Maïs', 150, 'premium', now() - interval '2 days', 'Parcelle F2', 500, '[]', 'publiee', null, null, null),
  ('00000000-0000-0000-0000-000000000001', 'producteur-6', 'Oignons', 90, 'standard', now() - interval '1 day', 'Parcelle G1', 900, '[]', 'publiee', null, null, null)
on conflict do nothing;

insert into public.legacy_producteur_recoltes (id, producteur_id, produit, quantite_kg, qualite, date_recolte, parcelle, prix_souhaite_par_kg, photos, statut, acheteur, montant_vente, notes)
values
  ('legacy-harvest-003', 'producteur-1', 'Arachides', 120, 'Premium', now() - interval '1 day', 'Parcelle C2', 2000, '[]', 'disponible', null, null, 'Récolte prête pour vente'),
  ('legacy-harvest-004', 'producteur-1', 'Igname', 300, 'Bonne', now() - interval '4 days', 'Parcelle D1', 600, '[]', 'disponible', null, null, null),
  ('legacy-harvest-005', 'producteur-test-1', 'Tomates', 200, 'Premium', now() - interval '3 days', 'Parcelle E1', 800, '[]', 'disponible', null, null, 'Tomates de saison'),
  ('legacy-harvest-006', 'producteur-test-1', 'Gombo', 80, 'Bonne', now() - interval '12 hours', 'Parcelle E2', 1200, '[]', 'vendue', 'Marché de Bouaké', 96000, null),
  ('legacy-harvest-007', 'producteur-test-2', 'Manioc', 500, 'Bonne', now() - interval '6 days', 'Parcelle F1', 250, '[]', 'vendue', 'Coopérative Korhogo', 125000, 'Grosse récolte'),
  ('legacy-harvest-008', 'producteur-test-2', 'Maïs', 150, 'Premium', now() - interval '2 days', 'Parcelle F2', 500, '[]', 'disponible', null, null, null),
  ('legacy-harvest-009', 'producteur-3', 'Oignons', 90, 'Bonne', now() - interval '1 day', 'Parcelle G1', 900, '[]', 'disponible', null, null, null)
on conflict (id) do nothing;

insert into public.producer_orders (organization_id, producer_user_id, reference, buyer_name, product_name, quantity_kg, amount, desired_delivery_date, status, is_urgent, carrier)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'CMD-2026-0003', 'Marché Adjamé', 'Arachides', 100, 200000, now() + interval '2 days', 'en_cours', true, 'Wôrô-Wôrô Express'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'CMD-2026-0004', 'Restaurant Le Maquis', 'Igname', 200, 120000, now() + interval '5 days', 'a_traiter', false, null),
  ('00000000-0000-0000-0000-000000000001', 'producteur-4', 'CMD-2026-0005', 'Coopérative Bouaké', 'Tomates', 150, 120000, now() + interval '1 day', 'livree', false, 'Transporteur local'),
  ('00000000-0000-0000-0000-000000000001', 'producteur-5', 'CMD-2026-0006', 'Usine d''amidon', 'Manioc', 400, 100000, now() + interval '10 days', 'en_cours', false, null),
  ('00000000-0000-0000-0000-000000000001', 'producteur-5', 'CMD-2026-0007', 'Marché de Korhogo', 'Maïs', 100, 50000, now() + interval '3 days', 'a_traiter', false, null),
  ('00000000-0000-0000-0000-000000000001', 'producteur-6', 'CMD-2026-0008', 'Marché de Daloa', 'Oignons', 80, 72000, now() + interval '4 days', 'a_traiter', true, null)
on conflict (organization_id, reference) do nothing;

insert into public.legacy_producteur_commandes (id, producteur_id, reference, acheteur_nom, produit, quantite_kg, montant, date_livraison_souhaitee, statut, urgent, transporteur)
values
  ('legacy-order-003', 'producteur-1', 'CMD-2026-0003', 'Marché Adjamé', 'Arachides', 100, 200000, now() + interval '2 days', 'en_cours', true, 'Wôrô-Wôrô Express'),
  ('legacy-order-004', 'producteur-1', 'CMD-2026-0004', 'Restaurant Le Maquis', 'Igname', 200, 120000, now() + interval '5 days', 'en_attente', false, null),
  ('legacy-order-005', 'producteur-test-1', 'CMD-2026-0005', 'Coopérative Bouaké', 'Tomates', 150, 120000, now() + interval '1 day', 'livree', false, 'Transporteur local'),
  ('legacy-order-006', 'producteur-test-2', 'CMD-2026-0006', 'Usine d''amidon', 'Manioc', 400, 100000, now() + interval '10 days', 'confirmee', false, null),
  ('legacy-order-007', 'producteur-test-2', 'CMD-2026-0007', 'Marché de Korhogo', 'Maïs', 100, 50000, now() + interval '3 days', 'en_attente', false, null),
  ('legacy-order-008', 'producteur-3', 'CMD-2026-0008', 'Marché de Daloa', 'Oignons', 80, 72000, now() + interval '4 days', 'en_attente', true, null)
on conflict (id) do nothing;

insert into public.producer_journals (organization_id, producer_user_id, cycle_id, entry_date, text, photo_path)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'cycle-mais-2026', now() - interval '10 days', 'Semis terminé sur les parcelles B1, B2 et B3.', null),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'cycle-mais-2026', now() - interval '4 days', 'Apport d''engrais organique sur B3.', null),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'cycle-arachides-2026', now() - interval '3 days', 'Les arachides sont bien développées. Récolte prévue dans 2 semaines.', null),
  ('00000000-0000-0000-0000-000000000001', 'producteur-4', 'cycle-tomates-2026', now() - interval '5 days', 'Plantation des nouvelles tomates sur parcelle E1.', null),
  ('00000000-0000-0000-0000-000000000001', 'producteur-4', 'cycle-gombo-2026', now() - interval '2 days', 'Récolte de gombo terminée. 80 kg récoltés.', null),
  ('00000000-0000-0000-0000-000000000001', 'producteur-5', 'cycle-manioc-2026', now() - interval '7 days', 'Début de récolte du manioc sur parcelle F1.', null),
  ('00000000-0000-0000-0000-000000000001', 'producteur-5', 'cycle-mais-2026', now() - interval '3 days', 'Les maïs sont presque mûrs. Récolte dans 3-4 jours.', null)
on conflict do nothing;

insert into public.legacy_producteur_journals (id, producteur_id, cycle_id, date, texte)
values
  ('legacy-journal-003', 'producteur-1', 'cycle-mais-2026', now() - interval '10 days', 'Semis terminé sur les parcelles B1, B2 et B3.'),
  ('legacy-journal-004', 'producteur-1', 'cycle-mais-2026', now() - interval '4 days', 'Apport d''engrais organique sur B3.'),
  ('legacy-journal-005', 'producteur-1', 'cycle-arachides-2026', now() - interval '3 days', 'Les arachides sont bien développées. Récolte prévue dans 2 semaines.'),
  ('legacy-journal-006', 'producteur-test-1', 'cycle-tomates-2026', now() - interval '5 days', 'Plantation des nouvelles tomates sur parcelle E1.'),
  ('legacy-journal-007', 'producteur-test-1', 'cycle-gombo-2026', now() - interval '2 days', 'Récolte de gombo terminée. 80 kg récoltés.'),
  ('legacy-journal-008', 'producteur-test-2', 'cycle-manioc-2026', now() - interval '7 days', 'Début de récolte du manioc sur parcelle F1.'),
  ('legacy-journal-009', 'producteur-test-2', 'cycle-mais-2026', now() - interval '3 days', 'Les maïs sont presque mûrs. Récolte dans 3-4 jours.')
on conflict (id) do nothing;
-- ----------------------------------------------------------------
-- 11h. Coopératives — stock, besoins, transactions, rôles, docs, audit
-- ----------------------------------------------------------------
insert into public.cooperative_stock (id, cooperative_id, produit, categorie, quantite, unite)
values
  ('00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000006001', 'Tomates', 'Légumes', 250, 'kg'),
  ('00000000-0000-0000-0000-000000008002', '00000000-0000-0000-0000-000000006001', 'Oignons', 'Légumes', 120, 'kg'),
  ('00000000-0000-0000-0000-000000008003', '00000000-0000-0000-0000-000000006001', 'Arachides', 'Légumineuses', 80, 'kg'),
  ('00000000-0000-0000-0000-000000008004', '00000000-0000-0000-0000-000000006002', 'Riz', 'Céréales', 500, 'kg'),
  ('00000000-0000-0000-0000-000000008005', '00000000-0000-0000-0000-000000006002', 'Manioc', 'Tubercules', 300, 'kg'),
  ('00000000-0000-0000-0000-000000008006', '00000000-0000-0000-0000-000000006002', 'Maïs', 'Céréales', 200, 'kg')
on conflict (id) do nothing;

insert into public.cooperative_besoins (id, cooperative_id, marchand_id, produit, categorie, quantite, unite, prix_max, priorite, statut, notes, quantite_attribuee, prix_achat, prix_dispatch)
values
  ('00000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-000000006001', 'merchant-1', 'Tomates', 'Légumes', 200, 'kg', 600, 'normale', 'consolide', 'Achat groupé pour revente', 200, 450, 500),
  ('00000000-0000-0000-0000-000000009002', '00000000-0000-0000-0000-000000006001', 'merchant-2', 'Oignons', 'Légumes', 100, 'kg', 900, 'normale', 'livre', 'Livré au marché', 100, 700, 750),
  ('00000000-0000-0000-0000-000000009003', '00000000-0000-0000-0000-000000006001', 'merchant-1', 'Arachides', 'Légumineuses', 50, 'kg', 2200, 'urgente', 'en_cours', 'Commande urgente pour salon', null, null, null),
  ('00000000-0000-0000-0000-000000009004', '00000000-0000-0000-0000-000000006002', 'merchant-3', 'Riz', 'Céréales', 300, 'kg', 28000, 'normale', 'consolide', 'Achat en gros usine', 300, 25000, 27000),
  ('00000000-0000-0000-0000-000000009005', '00000000-0000-0000-0000-000000006002', 'merchant-3', 'Manioc', 'Tubercules', 150, 'kg', 400, 'normale', 'en_attente', null, null, null, null)
on conflict (id) do nothing;

insert into public.cooperative_stock_mouvements (id, cooperative_id, produit, unite, type, quantite, membre_id, besoin_id, note)
values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-000000006001', 'Tomates', 'kg', 'apport', 150, 'merchant-1', null, 'Apport de la récolte'),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-000000006001', 'Tomates', 'kg', 'distribution', -50, 'merchant-2', '00000000-0000-0000-0000-000000009001', 'Distribution pour les membres'),
  ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-000000006001', 'Oignons', 'kg', 'apport', 120, 'merchant-1', null, null),
  ('00000000-0000-0000-0000-00000000a004', '00000000-0000-0000-0000-000000006002', 'Riz', 'kg', 'apport', 500, 'merchant-3', null, 'Achat groupé usine'),
  ('00000000-0000-0000-0000-00000000a005', '00000000-0000-0000-0000-000000006002', 'Riz', 'kg', 'distribution', -100, 'merchant-3', '00000000-0000-0000-0000-000000009002', 'Distribution aux membres'),
  ('00000000-0000-0000-0000-00000000a006', '00000000-0000-0000-0000-000000006002', 'Manioc', 'kg', 'apport', 300, 'merchant-3', null, 'Récolte cooperative')
on conflict (id) do nothing;

insert into public.cooperative_transactions (id, cooperative_id, type, categorie, montant, membre_id, description, statut, created_by)
values
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-000000006001', 'entree', 'cotisation', 25000, 'merchant-1', 'Cotisation trimestrielle — président', 'validee', 'merchant-1'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-000000006001', 'entree', 'vente_groupee', 150000, 'merchant-1', 'Vente groupée tomates — marché Adjamé', 'validee', 'merchant-1'),
  ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-000000006001', 'sortie', 'achat_groupe', 90000, 'merchant-2', 'Achat groupé oignons producteurs', 'validee', 'merchant-1'),
  ('00000000-0000-0000-0000-00000000b004', '00000000-0000-0000-0000-000000006001', 'sortie', 'frais', 5000, null, 'Frais de fonctionnement', 'validee', 'merchant-1'),
  ('00000000-0000-0000-0000-00000000b005', '00000000-0000-0000-0000-000000006002', 'entree', 'cotisation', 50000, 'merchant-3', 'Cotisation annuelle', 'validee', 'merchant-3'),
  ('00000000-0000-0000-0000-00000000b006', '00000000-0000-0000-0000-000000006002', 'entree', 'vente_groupee', 200000, 'merchant-3', 'Vente riz — cantines scolaires', 'validee', 'merchant-3'),
  ('00000000-0000-0000-0000-00000000b007', '00000000-0000-0000-0000-000000006002', 'sortie', 'achat_groupe', 125000, 'merchant-3', 'Achat riz usine Bouaké', 'validee', 'merchant-3'),
  ('00000000-0000-0000-0000-00000000b008', '00000000-0000-0000-0000-000000006002', 'entree', 'subvention', 200000, null, 'Subvention DGE pour équipement', 'en_attente', 'merchant-3')
on conflict (id) do nothing;

insert into public.cooperative_roles (id, cooperative_id, code, libelle, est_systeme)
values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000006001', 'president', 'Président', true),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-000000006001', 'tresorier', 'Trésorier', true),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-000000006001', 'membre', 'Membre', true),
  ('00000000-0000-0000-0000-00000000c004', '00000000-0000-0000-0000-000000006002', 'president', 'Président', true),
  ('00000000-0000-0000-0000-00000000c005', '00000000-0000-0000-0000-000000006002', 'secretaire', 'Secrétaire', true),
  ('00000000-0000-0000-0000-00000000c006', '00000000-0000-0000-0000-000000006002', 'membre', 'Membre', true)
on conflict (id) do nothing;

insert into public.cooperative_member_roles (id, cooperative_membre_id, role_id, est_principal, started_at, ended_at)
values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-00000000c001', true, now() - interval '90 days', null),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-000000006102', '00000000-0000-0000-0000-00000000c003', false, now() - interval '60 days', null),
  ('00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-000000006103', '00000000-0000-0000-0000-00000000c004', true, now() - interval '45 days', null)
on conflict (id) do nothing;

insert into public.cooperative_documents (id, cooperative_id, type, nom, storage_path, version, statut, expires_at)
values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-000000006001', 'statuts', 'Statuts coopérative Koumassi', '/docs/coop-6001/statuts-v1.pdf', 1, 'valide', null),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-000000006001', 'pv', 'PV assemblée générale 2026', '/docs/coop-6001/pv-ag-2026.pdf', 1, 'valide', null),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-000000006001', 'reglement', 'Règlement intérieur', '/docs/coop-6001/reglement-v2.pdf', 2, 'valide', null),
  ('00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-000000006002', 'statuts', 'Statuts coopérative Yopougon', '/docs/coop-6002/statuts-v1.pdf', 1, 'valide', null),
  ('00000000-0000-0000-0000-00000000e005', '00000000-0000-0000-0000-000000006002', 'autorisation', 'Autorisation DGE', '/docs/coop-6002/autorisation-dge.pdf', 1, 'valide', now() + interval '6 months'),
  ('00000000-0000-0000-0000-00000000e006', '00000000-0000-0000-0000-000000006002', 'rapport', 'Rapport trimestriel T2 2026', '/docs/coop-6002/rapport-t2-2026.pdf', 1, 'brouillon', null)
on conflict (id) do nothing;

insert into public.cooperative_audit_logs (id, cooperative_id, actor_id, action, entity_type, entity_id, old_value, new_value)
values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-000000006001', '00000000-0000-0000-0000-000000000205', 'create', 'cooperative', '00000000-0000-0000-0000-000000006001', null, '{"nom":"Coopérative des femmes de Koumassi"}'),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-000000006001', '00000000-0000-0000-0000-000000000205', 'add_member', 'membre', 'merchant-1', null, '{"membre_id":"merchant-1","role":"president"}'),
  ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-000000006001', '00000000-0000-0000-0000-000000000205', 'add_member', 'membre', 'merchant-2', null, '{"membre_id":"merchant-2","role":"membre"}'),
  ('00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-000000006001', '00000000-0000-0000-0000-000000000205', 'validate_transaction', 'transaction', '00000000-0000-0000-0000-00000000b002', '{"statut":"en_attente"}', '{"statut":"validee"}'),
  ('00000000-0000-0000-0000-00000000f005', '00000000-0000-0000-0000-000000006002', '00000000-0000-0000-0000-000000000207', 'create', 'cooperative', '00000000-0000-0000-0000-000000006002', null, '{"nom":"Coopérative agricole de Yopougon"}'),
  ('00000000-0000-0000-0000-00000000f006', '00000000-0000-0000-0000-000000006002', '00000000-0000-0000-0000-000000000207', 'add_member', 'membre', 'merchant-3', null, '{"membre_id":"merchant-3","role":"president"}'),
  ('00000000-0000-0000-0000-00000000f007', '00000000-0000-0000-0000-000000006002', '00000000-0000-0000-0000-000000000207', 'upload_document', 'document', '00000000-0000-0000-0000-00000000e005', null, '{"nom":"Autorisation DGE"}')
on conflict (id) do nothing;

insert into public.cooperative_invitations (id, cooperative_id, canal, destination, merchant_id, statut, expires_at, sent_by)
values
  ('00000000-0000-0000-0000-00000000g001', '00000000-0000-0000-0000-000000006001', 'telephone', '0507070707', null, 'envoyee', now() + interval '7 days', '00000000-0000-0000-0000-000000000205'),
  ('00000000-0000-0000-0000-00000000g002', '00000000-0000-0000-0000-000000006001', 'telephone', '0508080808', null, 'acceptee', now() - interval '1 day', '00000000-0000-0000-0000-000000000205'),
  ('00000000-0000-0000-0000-00000000g003', '00000000-0000-0000-0000-000000006002', 'email', '0509090909', null, 'en_attente', now() + interval '5 days', '00000000-0000-0000-0000-000000000207')
on conflict (id) do nothing;
-- ----------------------------------------------------------------
-- 11i. Alertes, communications, modération, voice_logs
-- ----------------------------------------------------------------
insert into public.alerts (organization_id, severity, title, message, module, acknowledged)
values
  ('00000000-0000-0000-0000-000000000001', 'haute', 'Identificateur inactif', 'Bakary Touré (JID-0010) n''a pas synchronisé depuis 10 jours.', 'identificateurs', false),
  ('00000000-0000-0000-0000-000000000001', 'moyenne', 'Objectif en retard', 'Kouamé Bamba n''a réalisé que 65 % de son objectif mensuel.', 'missions', false),
  ('00000000-0000-0000-0000-000000000001', 'haute', 'Ventes en chute', 'Les ventes de Fatoumata Keita ont chuté de 35 % cette semaine.', 'ventes', false),
  ('00000000-0000-0000-0000-000000000001', 'basse', 'Nouvel identificateur', '3 nouveaux identificateurs actifs ce mois.', 'identificateurs', true),
  ('00000000-0000-0000-0000-000000000001', 'moyenne', 'Stock critique', 'Stock de manioc de la coopérative Yopougon inférieur à 50 kg.', 'stock', false),
  ('00000000-0000-0000-0000-000000000001', 'haute', 'Dossier expiré', 'Dossier DOS-2026-0007 en attente d''info depuis 5 jours.', 'enrolement', false)
on conflict do nothing;

insert into public.legacy_bo_alerts (id, severity, title, message, module, acknowledged)
values
  ('legacy-alert-003', 'haute', 'Identificateur inactif', 'Bakary Touré (JID-0010) n''a pas synchronisé depuis 10 jours.', 'identificateurs', false),
  ('legacy-alert-004', 'moyenne', 'Objectif en retard', 'Kouamé Bamba n''a réalisé que 65 % de son objectif mensuel.', 'missions', false),
  ('legacy-alert-005', 'haute', 'Ventes en chute', 'Les ventes de Fatoumata Keita ont chuté de 35 % cette semaine.', 'ventes', false),
  ('legacy-alert-006', 'basse', 'Nouvel identificateur', '3 nouveaux identificateurs actifs ce mois.', 'identificateurs', true),
  ('legacy-alert-007', 'moyenne', 'Stock critique', 'Stock de manioc de la coopérative Yopougon inférieur à 50 kg.', 'stock', false),
  ('legacy-alert-008', 'haute', 'Dossier expiré', 'Dossier DOS-2026-0007 en attente d''info depuis 5 jours.', 'enrolement', false)
on conflict (id) do nothing;

insert into public.communications (organization_id, title, type, content, target_group, target_zone_id, status, sent_count, delivery_rate, sent_at, created_by_user_id)
values
  ('00000000-0000-0000-0000-000000000001', 'Formation sécurité alimentaire', 'notification', 'Une formation gratuite aura lieu samedi au marché Adjamé.', 'marchands', '00000000-0000-0000-0000-000000000101', 'envoyee', 45, 0.91, now() - interval '2 days', '00000000-0000-0000-0000-000000000202'),
  ('00000000-0000-0000-0000-000000000001', 'Campagne vaccination bétail', 'sms', 'N''oubliez pas la vaccination de votre bétail ce weekend à Korhogo.', 'producteurs', '00000000-0000-0000-0000-000000000105', 'envoyee', 28, 0.85, now() - interval '5 days', '00000000-0000-0000-0000-000000000201'),
  ('00000000-0000-0000-0000-000000000001', 'Réunion coopérative', 'notification', 'Assemblée générale le 15 du mois. Participation obligatoire.', 'cooperatives', null, 'brouillon', 0, null, null, '00000000-0000-0000-0000-000000000202')
on conflict do nothing;

insert into public.legacy_bo_communications (id, title, type, content, target_group, target_zone, status, sent_count, delivery_rate, sent_at)
values
  ('legacy-communication-002', 'Formation sécurité alimentaire', 'notification', 'Une formation gratuite aura lieu samedi au marché Adjamé.', 'marchands', 'Adjame', 'envoyee', 45, 0.91, now() - interval '2 days'),
  ('legacy-communication-003', 'Campagne vaccination bétail', 'sms', 'N''oubliez pas la vaccination de votre bétail ce weekend à Korhogo.', 'producteurs', 'Korhogo', 'envoyee', 28, 0.85, now() - interval '5 days'),
  ('legacy-communication-004', 'Réunion coopérative', 'notification', 'Assemblée générale le 15 du mois. Participation obligatoire.', 'cooperatives', null, 'brouillon', 0, null, null)
on conflict (id) do nothing;

insert into public.moderation_reports (organization_id, target_type, target_id, target_name, reason, severity, status, reported_by_user_id)
values
  ('00000000-0000-0000-0000-000000000001', 'actor', '#M-0008', 'Sandrine Kouame', 'Compte suspendu — documents expirés depuis 3 mois', 'haute', 'ouvert', '00000000-0000-0000-0000-000000000201'),
  ('00000000-0000-0000-0000-000000000001', 'actor', '#M-0013', 'Bakari Sangaré', 'CNI falsifiée — numéro ne correspond pas', 'haute', 'en_cours', '00000000-0000-0000-0000-000000000202'),
  ('00000000-0000-0000-0000-000000000001', 'cooperative', '#C-0011', 'Kone Fofana', 'Cotisation impayée depuis 2 mois', 'moyenne', 'ouvert', '00000000-0000-0000-0000-000000000202')
on conflict do nothing;

insert into public.legacy_bo_moderation_reports (id, target_type, target_id, target_name, reason, severity, status, reported_by)
values
  ('legacy-report-002', 'actor', '#M-0008', 'Sandrine Kouame', 'Compte suspendu — documents expirés depuis 3 mois', 'haute', 'ouvert', 'Fatou Soro'),
  ('legacy-report-003', 'actor', '#M-0013', 'Bakari Sangare', 'CNI falsifiée — numéro ne correspond pas', 'haute', 'en_cours', 'Affi Coulibaly'),
  ('legacy-report-004', 'cooperative', '#C-0011', 'Kone Fofana', 'Cotisation impayée depuis 2 mois', 'moyenne', 'ouvert', 'Affi Coulibaly')
on conflict (id) do nothing;

insert into public.voice_logs (organization_id, merchant_user_id, transcript, intent, confidence, response_text)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'Ouvre la caisse', 'open_cash_register', 0.94, 'Caisse ouverte. Fond de caisse : 25 000 FCFA.'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'Ajoute 5 kilos de gombo', 'add_to_cart', 0.97, '5 kg de gombo ajoutés au panier. Total : 5 000 FCFA.'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'Combien de stock pour les tomates', 'check_stock', 0.92, 'Il vous reste 84 kg de tomates fraîches.'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000205', 'Enregistre une vente de 55 000 francs', 'create_sale', 0.89, 'Vente de 55 000 FCFA enregistrée.'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000205', 'Quel est mon chiffre d''affaires', 'sales_summary', 0.93, 'Votre chiffre d''affaires aujourd''hui est de 125 000 FCFA.'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000206', 'Ajoute un savon de Marseille', 'add_to_cart', 0.96, 'Savon de Marseille ajouté. Total : 1 000 FCFA.'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000206', 'Ferme la caisse', 'close_cash_register', 0.95, 'Caisse fermée. Total : 42 000 FCFA. Dépenses : 2 500 FCFA.')
on conflict do nothing;

insert into public.legacy_voice_logs (id, merchant_id, transcript, intent, confidence, response_text)
values
  ('legacy-voice-003', 'merchant-1', 'Ouvre la caisse', 'open_cash_register', 0.94, 'Caisse ouverte. Fond de caisse : 25 000 FCFA.'),
  ('legacy-voice-004', 'merchant-1', 'Ajoute 5 kilos de gombo', 'add_to_cart', 0.97, '5 kg de gombo ajoutés au panier. Total : 5 000 FCFA.'),
  ('legacy-voice-005', 'merchant-1', 'Combien de stock pour les tomates', 'check_stock', 0.92, 'Il vous reste 84 kg de tomates fraîches.'),
  ('legacy-voice-006', 'merchant-4', 'Enregistre une vente de 55 000 francs', 'create_sale', 0.89, 'Vente de 55 000 FCFA enregistrée.'),
  ('legacy-voice-007', 'merchant-4', 'Quel est mon chiffre d''affaires', 'sales_summary', 0.93, 'Votre chiffre d''affaires aujourd''hui est de 125 000 FCFA.'),
  ('legacy-voice-008', 'merchant-5', 'Ajoute un savon de Marseille', 'add_to_cart', 0.96, 'Savon de Marseille ajouté. Total : 1 000 FCFA.'),
  ('legacy-voice-009', 'merchant-5', 'Ferme la caisse', 'close_cash_register', 0.95, 'Caisse fermée. Total : 42 000 FCFA. Dépenses : 2 500 FCFA.')
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- 11j. Missions et objectifs supplémentaires
-- ----------------------------------------------------------------
insert into public.missions (organization_id, zone_id, title, description, assignee_user_id, assignee_name, status, target_count, current_count, starts_on, ends_on)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000102', 'Enrôlement Cocody - semaine 2', 'Identifier les commerçants de la zone Cocody.', '00000000-0000-0000-0000-000000000201', 'Fatou Soro', 'en_cours', 30, 18, current_date - 1, current_date + 6),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000103', 'Vérification Yopougon', 'Vérifier les dossiers en attente de la zone Yopougon.', '00000000-0000-0000-0000-000000000202', 'Affi Coulibaly', 'a_venir', 15, 0, current_date + 3, current_date + 10)
on conflict do nothing;

insert into public.legacy_bo_missions (id, title, description, zone, assignee_name, status, target_count, current_count, start_date, end_date)
values
  ('legacy-mission-003', 'Enrôlement Cocody - semaine 2', 'Identifier les commerçants de la zone Cocody.', 'Cocody', 'Fatou Soro', 'en_cours', 30, 18, current_date - 1, current_date + 6),
  ('legacy-mission-004', 'Vérification Yopougon', 'Vérifier les dossiers en attente de la zone Yopougon.', 'Yopougon', 'Affi Coulibaly', 'a_venir', 15, 0, current_date + 3, current_date + 10)
on conflict (id) do nothing;

insert into public.legacy_bo_objectifs (id, scope, cible_id, cible_label, month, year, target, created_by)
values
  ('legacy-objectif-010', 'zone', 'cocody', 'Cocody',
     extract(month from now())::int - 1, extract(year from now())::int, 45, 'seed'),
  ('legacy-objectif-011', 'zone', 'yopougon', 'Yopougon',
     extract(month from now())::int - 1, extract(year from now())::int, 35, 'seed'),
  ('legacy-objectif-012', 'identificateur', 'ident-test-000010', 'Bakary Touré',
     extract(month from now())::int - 1, extract(year from now())::int, 15, 'seed')
on conflict (scope, cible_id, month, year) do nothing;

-- ----------------------------------------------------------------
-- 11k. Livraisons, Keiwa, API keys, contenus formation
-- ----------------------------------------------------------------
insert into public.deliveries (organization_id, zone_id, order_reference, sender_name, sender_phone, recipient_name, recipient_phone, address, status, courier_name)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'CMD-2026-0003', 'Marché Adjamé', '0711111111', 'Kouadio Yao', '0744444444', 'Marché de Bouaké, stand 12', 'livree', 'Wôrô-Wôrô Express'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000104', 'CMD-2026-0005', 'Coopérative Bouaké', '0703030303', 'Restaurant Le Maquis', '0755667788', 'Bouaké centre, face station Total', 'en_cours', 'Transporteur local'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000105', 'CMD-2026-0007', 'Marché de Korhogo', '0309090909', 'Jean N''Guessan', '0522222222', 'Korhogo, quartier Nord', 'en_attente', null)
on conflict do nothing;

insert into public.legacy_bo_deliveries (id, order_id, sender_name, sender_phone, recipient_name, recipient_phone, address, zone, status, courier_name)
values
  ('legacy-delivery-002', 'legacy-order-003', 'Marché Adjamé', '0711111111', 'Kouadio Yao', '0744444444', 'Marché de Bouaké, stand 12', 'Bouake', 'livree', 'Wôrô-Wôrô Express'),
  ('legacy-delivery-003', 'legacy-order-005', 'Coopérative Bouaké', '0703030303', 'Restaurant Le Maquis', '0755667788', 'Bouaké centre, face station Total', 'Bouake', 'en_cours', 'Transporteur local'),
  ('legacy-delivery-004', 'legacy-order-007', 'Marché de Korhogo', '0309090909', 'Jean N''Guessan', '0522222222', 'Korhogo, quartier Nord', 'Korhogo', 'en_attente', null)
on conflict (id) do nothing;

insert into public.keiwa_accounts (organization_id, holder_name, holder_phone, zone_id, balance, transaction_count, is_active)
values
  ('00000000-0000-0000-0000-000000000001', 'Issa Konate', '0507070707', '00000000-0000-0000-0000-000000000101', 250000, 8, true),
  ('00000000-0000-0000-0000-000000000001', 'Rahama Diallo', '0508080808', '00000000-0000-0000-0000-000000000102', 95000, 5, true),
  ('00000000-0000-0000-0000-000000000001', 'Awa Kone', '0511111111', '00000000-0000-0000-0000-000000000104', 42000, 2, true)
on conflict do nothing;

insert into public.legacy_bo_keiwa_accounts (id, holder_name, holder_phone, zone, balance, transaction_count, is_active)
values
  ('legacy-keiwa-account-003', 'Issa Konate', '0507070707', 'Adjame', 250000, 8, true),
  ('legacy-keiwa-account-004', 'Rahama Diallo', '0508080808', 'Cocody', 95000, 5, true),
  ('legacy-keiwa-account-005', 'Awa Kone', '0511111111', 'Bouake', 42000, 2, true)
on conflict (id) do nothing;

insert into public.keiwa_transactions (organization_id, account_id, type, amount, sender_name, sender_phone, recipient_name, recipient_phone, status)
select '00000000-0000-0000-0000-000000000001', id, 'depot', 100000, 'Issa Konate', '0507070707', 'Compte Keiwa', '0507070707', 'termine'
from public.keiwa_accounts where holder_phone = '0507070707'
on conflict do nothing;

insert into public.legacy_bo_keiwa_transactions (id, type, amount, sender_name, sender_phone, recipient_name, recipient_phone, account_id, status)
values
  ('legacy-keiwa-tx-002', 'depot', 100000, 'Issa Konate', '0507070707', 'Compte Keiwa', '0507070707', 'legacy-keiwa-account-003', 'termine'),
  ('legacy-keiwa-tx-003', 'transfert', 25000, 'Rahama Diallo', '0508080808', 'Awa Kone', '0511111111', 'legacy-keiwa-account-004', 'termine'),
  ('legacy-keiwa-tx-004', 'retrait', 15000, 'Compte Keiwa', '0511111111', 'Awa Kone', '0511111111', 'legacy-keiwa-account-005', 'termine')
on conflict (id) do nothing;

insert into public.api_keys (organization_id, name, description, key_prefix, secret_hash, permissions, request_count, is_active, created_by_user_id)
values
  ('00000000-0000-0000-0000-000000000001', 'API Mobile', 'Clé pour l''application mobile', 'jlb_mobile_', 'seed-mobile-hash', 'read:actors,write:sales,read:products', 156, true, '00000000-0000-0000-0000-000000000201'),
  ('00000000-0000-0000-0000-000000000001', 'API Coopérative', 'Clé pour les coopératives', 'jlb_coop_', 'seed-coop-hash', 'read:cooperatives,write:stock', 42, true, '00000000-0000-0000-0000-000000000202')
on conflict do nothing;

insert into public.legacy_bo_api_keys (id, name, description, key, secret_hash, permissions, request_count, is_active, created_by)
values
  ('legacy-api-key-002', 'API Mobile', 'Clé pour l''application mobile', 'jlb_mobile_demo', 'seed-mobile-hash', 'read:actors,write:sales,read:products', 156, true, 'bo-user-001'),
  ('legacy-api-key-003', 'API Coopérative', 'Clé pour les coopératives', 'jlb_coop_demo', 'seed-coop-hash', 'read:cooperatives,write:stock', 42, true, 'bo-user-002')
on conflict (id) do nothing;

insert into public.cron_jobs (organization_id, name, schedule, command, status, run_count, avg_duration_ms, next_run_at)
values
  ('00000000-0000-0000-0000-000000000001', 'Rapport ventes quotidien', '0 20 * * *', 'daily_sales_report', 'actif', 15, 320, now() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000001', 'Synchronisation producteurs', '0 6 * * *', 'sync_producer_data', 'actif', 30, 210, now() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000001', 'Vérification stocks', '0 18 * * *', 'check_stock_levels', 'actif', 28, 95, now() + interval '1 day')
on conflict do nothing;

insert into public.legacy_bo_cron_jobs (id, name, schedule, command, status, run_count, avg_duration_ms, next_run_at)
values
  ('legacy-cron-002', 'Rapport ventes quotidien', '0 20 * * *', 'daily_sales_report', 'actif', 15, 320, now() + interval '1 day'),
  ('legacy-cron-003', 'Synchronisation producteurs', '0 6 * * *', 'sync_producer_data', 'actif', 30, 210, now() + interval '1 day'),
  ('legacy-cron-004', 'Vérification stocks', '0 18 * * *', 'check_stock_levels', 'actif', 28, 95, now() + interval '1 day')
on conflict (id) do nothing;

insert into public.training_contents (organization_id, title, type, category, content, excerpt, author, status, difficulty, duration, target_role, sort_order, view_count)
values
  ('00000000-0000-0000-0000-000000000001', 'Gérer ses stocks', 'guide', 'marchand', 'Apprenez à suivre vos entrées et sorties de marchandises pour éviter les ruptures.', 'Gestion des stocks pour marchands.', 'Équipe Jùlaba', 'publie', 'debutant', '7 min', 'marchand', 3, 24),
  ('00000000-0000-0000-0000-000000000001', 'Déclarer une récolte', 'guide', 'producteur', 'Remplissez le formulaire de récolte avec les bonnes informations.', 'Les étapes pour déclarer votre récolte.', 'Équipe Jùlaba', 'publie', 'debutant', '6 min', 'producteur', 4, 15),
  ('00000000-0000-0000-0000-000000000001', 'Utiliser la caisse vocale', 'tutoriel', 'marchand', 'Commandez à la voix : ouvrez la caisse, ajoutez des produits, enregistrez les ventes.', 'Le guide complet de la caisse vocale.', 'Équipe Jùlaba', 'publie', 'debutant', '10 min', 'marchand', 5, 31),
  ('00000000-0000-0000-0000-000000000001', 'Valider un dossier producteur', 'guide', 'enrolement', 'Vérifiez les informations spécifiques aux producteurs : superficie, cultures, cycle.', 'Contrôle qualité des dossiers producteurs.', 'Équipe Jùlaba', 'publie', 'intermediaire', '10 min', 'identificateur', 6, 8),
  ('00000000-0000-0000-0000-000000000001', 'Gestion d''une coopérative', 'guide', 'cooperative', 'Organisez les cotisations, les achats groupés et la répartition des bénéfices.', 'Le manuel du président de coopérative.', 'Équipe Jùlaba', 'publie', 'avance', '15 min', 'cooperatif', 7, 5)
on conflict do nothing;

insert into public.legacy_bo_contents (id, title, type, category, content, excerpt, author, status, difficulty, duration, target_role, sort_order, view_count)
values
  ('legacy-content-003', 'Gérer ses stocks', 'guide', 'marchand', 'Apprenez à suivre vos entrées et sorties de marchandises pour éviter les ruptures.', 'Gestion des stocks pour marchands.', 'Équipe Jùlaba', 'publie', 'debutant', '7 min', 'marchand', 3, 24),
  ('legacy-content-004', 'Déclarer une récolte', 'guide', 'producteur', 'Remplissez le formulaire de récolte avec les bonnes informations.', 'Les étapes pour déclarer votre récolte.', 'Équipe Jùlaba', 'publie', 'debutant', '6 min', 'producteur', 4, 15),
  ('legacy-content-005', 'Utiliser la caisse vocale', 'tutoriel', 'marchand', 'Commandez à la voix : ouvrez la caisse, ajoutez des produits, enregistrez les ventes.', 'Le guide complet de la caisse vocale.', 'Équipe Jùlaba', 'publie', 'debutant', '10 min', 'marchand', 5, 31),
  ('legacy-content-006', 'Valider un dossier producteur', 'guide', 'enrolement', 'Vérifiez les informations spécifiques aux producteurs : superficie, cultures, cycle.', 'Contrôle qualité des dossiers producteurs.', 'Équipe Jùlaba', 'publie', 'intermediaire', '10 min', 'identificateur', 6, 8),
  ('legacy-content-007', 'Gestion d''une coopérative', 'guide', 'cooperative', 'Organisez les cotisations, les achats groupés et la répartition des bénéfices.', 'Le manuel du président de coopérative.', 'Équipe Jùlaba', 'publie', 'avance', '15 min', 'cooperatif', 7, 5)
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- 11l. Notifications et événements système supplémentaires
-- ----------------------------------------------------------------
insert into public.notifications (organization_id, user_id, type, title, body, data)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'stock_alert', 'Stock faible', 'Votre stock de gombo est inférieur à 10 kg.', '{"product":"Gombo frais","quantity":5}'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'order', 'Commande confirmée', 'Votre commande CMD-2026-0003 est en cours de livraison.', '{"reference":"CMD-2026-0003"}'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'mission', 'Nouvelle mission', 'Mission « Enrôlement Cocody - semaine 2 » assignée.', '{"mission_id":"mission-cocody-2"}')
on conflict do nothing;

insert into public.legacy_notifications (id, subject, type, title, body, data, read)
values
  ('legacy-notification-003', 'merchant:merchant-1', 'stock_alert', 'Stock faible', 'Votre stock de gombo est inférieur à 10 kg.', '{"product":"Gombo frais","quantity":5}', false),
  ('legacy-notification-004', 'producteur:producteur-1', 'order', 'Commande confirmée', 'Votre commande CMD-2026-0003 est en cours de livraison.', '{"reference":"CMD-2026-0003"}', false),
  ('legacy-notification-005', 'identificateur:ident-demo-000001', 'mission', 'Nouvelle mission', 'Mission « Enrôlement Cocody - semaine 2 » assignée.', '{"mission_id":"mission-cocody-2"}', true)
on conflict (id) do nothing;

insert into public.system_events (organization_id, level, source, message, metadata)
values
  ('00000000-0000-0000-0000-000000000001', 'INFO', 'seed', 'Données étendues chargées', '{"version":"2026.09-extended"}'),
  ('00000000-0000-0000-0000-000000000001', 'WARN', 'ventes', 'Chute de ventes détectée — merchant-2', '{"merchant":"merchant-2","drop_pct":35}'),
  ('00000000-0000-0000-0000-000000000001', 'ERROR', 'sync', 'Échec synchronisation appareil ident-test-000010', '{"device":"ident-test-000010","error":"timeout"}')
on conflict do nothing;

insert into public.legacy_bo_system_events (id, level, source, message)
values
  ('legacy-event-003', 'INFO', 'seed', 'Données étendues chargées'),
  ('legacy-event-004', 'WARN', 'ventes', 'Chute de ventes détectée — merchant-2'),
  ('legacy-event-005', 'ERROR', 'sync', 'Échec synchronisation appareil ident-test-000010')
on conflict (id) do nothing;

insert into public.audit_events (organization_id, actor_id, action, resource_type, resource_id, metadata)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000203', 'create', 'sale', '00000000-0000-0000-0000-000000004103', '{"source":"seed"}'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'create', 'harvest', 'harvest-arachides', '{"source":"seed"}'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'validate', 'enrolment', 'DOS-2026-0004', '{"source":"seed"}')
on conflict do nothing;

insert into public.legacy_audit_logs (id, user_id, user_name, user_email, action, module, details, ip_address, user_agent, signature)
values
  ('legacy-audit-003', 'bo-user-001', 'Aminata KONE', 'aminata@julaba.ci', 'create', 'sales', 'Vente de 55 000 FCFA créée', '127.0.0.1', 'Supabase seed', 'seed'),
  ('legacy-audit-004', 'bo-user-004', 'Fatou SORO', 'fatou@julaba.ci', 'validate', 'enrolements', 'Dossier DOS-2026-0004 validé', '127.0.0.1', 'Supabase seed', 'seed'),
  ('legacy-audit-005', 'bo-user-005', 'Jean KOUADIO', 'jean@julaba.ci', 'create', 'missions', 'Mission Cocody créée', '127.0.0.1', 'Supabase seed', 'seed')
on conflict (id) do nothing;

insert into public.devices (organization_id, user_id, device_key_hash, label, last_seen_at, expires_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'seed-device-key-003', 'Tablette Fatou - Bouaké', now() - interval '2 hours', now() + interval '85 days'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000205', 'seed-device-key-004', 'Téléphone Issa - Bouaké', now() - interval '3 hours', now() + interval '90 days'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000206', 'seed-device-key-005', 'Téléphone Rahama - Cocody', now() - interval '1 hour', now() + interval '90 days'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000207', 'seed-device-key-006', 'Téléphone Moussavou - Yopougon', now() - interval '30 minutes', now() + interval '90 days')
on conflict do nothing;

insert into public.sync_conflict_reports (organization_id, user_id, entity, payload, message, client_created_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000205', 'product', '{"id":"pending-issa-1","name":"Riz premium"}', 'Conflit de synchronisation — produit déjà existant.', now() - interval '5 hours'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000206', 'sale', '{"id":"pending-rahama-1","amount":18000}', 'Vente synchronisée avec décalage horaire.', now() - interval '2 hours')
on conflict do nothing;

insert into public.legacy_sync_conflict_reports (id, subject, entity, payload, message, client_created_at, reported_at)
values
  ('legacy-conflict-002', 'merchant:merchant-4', 'product', '{"id":"pending-issa-1","name":"Riz premium"}', 'Conflit de synchronisation — produit déjà existant.', now() - interval '5 hours', now() - interval '4 hours'),
  ('legacy-conflict-003', 'merchant:merchant-5', 'sale', '{"id":"pending-rahama-1","amount":18000}', 'Vente synchronisée avec décalage horaire.', now() - interval '2 hours', now() - interval '1 hour')
on conflict (id) do nothing;

insert into public.platform_configs (organization_id, category, config)
values
  ('00000000-0000-0000-0000-000000000001', 'voice', '{"enabled":true,"languages":["fr","bci"],"defaultLanguage":"fr"}'),
  ('00000000-0000-0000-0000-000000000001', 'loyalty', '{"enabled":true,"programCode":"JLB-DEFAULT"}')
on conflict (organization_id, category) do update set config = excluded.config;

insert into public.legacy_bo_platform_configs (id, category, config)
values
  ('legacy-config-003', 'voice', '{"enabled":true,"languages":["fr","bci"],"defaultLanguage":"fr"}'),
  ('legacy-config-004', 'loyalty', '{"enabled":true,"programCode":"JLB-DEFAULT"}')
on conflict (id) do nothing;

insert into public.mutations (organization_id, actor_id, from_zone_id, to_zone_id, reason, status, requested_by_user_id, requested_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001008', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103', 'Changement de zone de vente', 'approuvee', '00000000-0000-0000-0000-000000000201', now() - interval '3 days'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001007', '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000101', 'Point de vente principal déplacé', 'en_attente', '00000000-0000-0000-0000-000000000202', now() - interval '12 hours')
on conflict do nothing;

insert into public.legacy_bo_mutations (id, actor_id, actor_name, from_zone, to_zone, reason, status, requested_by, requested_at)
values
  ('legacy-mutation-002', '#M-0008', 'Sandrine Kouame', 'Adjame', 'Yopougon', 'Changement de zone de vente', 'approuvee', 'Fatou Soro', now() - interval '3 days'),
  ('legacy-mutation-003', '#M-0007', 'Moussavou Bidie', 'Yopougon', 'Adjame', 'Point de vente principal déplacé', 'en_attente', 'Affi Coulibaly', now() - interval '12 hours')
on conflict (id) do nothing;

insert into public.institutions (organization_id, name, type, contact_name, contact_email, contact_phone, address, linked_actors, is_active)
values
  ('00000000-0000-0000-0000-000000000001', 'Ministère de l''Agriculture', 'institution_publique', 'Dr. Amadou Ouattara', 'contact@agriculture.gouv.ci', '2720202021', 'Plateau, Abidjan', 520, true),
  ('00000000-0000-0000-0000-000000000001', 'Banque Mondiale - CI', 'partenaire_financier', 'Sophie Martin', 'sophie.martin@worldbank.org', '2720202030', 'Abidjan', 15, true)
on conflict do nothing;

insert into public.legacy_bo_institutions (id, name, type, contact_name, contact_email, contact_phone, address, linked_actors, is_active)
values
  ('legacy-institution-003', 'Ministère de l''Agriculture', 'institution_publique', 'Dr. Amadou Ouattara', 'contact@agriculture.gouv.ci', '2720202021', 'Plateau, Abidjan', 520, true),
  ('legacy-institution-004', 'Banque Mondiale - CI', 'partenaire_financier', 'Sophie Martin', 'sophie.martin@worldbank.org', '2720202030', 'Abidjan', 15, true)
on conflict (id) do nothing;

insert into public.tontines (id, organization_id, client_id, name, amount, frequency, member_count, next_due_date)
values
  ('00000000-0000-0000-0000-000000005003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000005103', 'Épargne Yopougon', 3000, 'hebdomadaire', 5, current_date + 3),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000005104', 'Mutuelle Bouaké', 7500, 'mensuel', 4, current_date + 15)
on conflict (id) do nothing;

insert into public.legacy_tontines (id, name, amount, frequency, member_count, next_due_date)
values
  ('legacy-tontine-003', 'Épargne Yopougon', 3000, 'hebdomadaire', 5, current_date + 3),
  ('legacy-tontine-004', 'Mutuelle Bouaké', 7500, 'mensuelle', 4, current_date + 15)
on conflict (id) do nothing;

insert into public.credit_scores (organization_id, actor_id, score, risk_level, credit_limit, last_calculated_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001005', 75, 'faible', 200000, now()),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001006', 88, 'faible', 120000, now()),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001007', 62, 'moyen', 90000, now()),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001009', 45, 'eleve', 30000, now()),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001010', 71, 'faible', 100000, now())
on conflict (organization_id, actor_id) do update set
  score = excluded.score,
  risk_level = excluded.risk_level,
  credit_limit = excluded.credit_limit,
  last_calculated_at = excluded.last_calculated_at;

insert into public.legacy_bo_credit_scores (id, actor_id, actor_name, zone, score, risk_level, credit_limit, last_calculated_at)
values
  ('legacy-score-003', '#M-0005', 'Issa Konate', 'Adjame', 75, 'faible', 200000, now()),
  ('legacy-score-004', '#M-0006', 'Rahama Diallo', 'Cocody', 88, 'faible', 120000, now()),
  ('legacy-score-005', '#M-0007', 'Moussavou Bidie', 'Yopougon', 62, 'modere', 90000, now()),
  ('legacy-score-006', '#P-0009', 'Awa Kone', 'Bouake', 45, 'eleve', 30000, now()),
  ('legacy-score-007', '#P-0010', 'Jean N''Guessan', 'Korhogo', 71, 'faible', 100000, now())
on conflict (id) do nothing;
