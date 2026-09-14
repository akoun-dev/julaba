-- Migration: Seed bo_users table with admin accounts
-- The table was created in 004500 but left empty. These accounts are
-- required for backoffice login. Passwords are stored as plaintext here;
-- the login route transparently upgrades them to scrypt on first
-- successful authentication (see needsRehash() in password.ts).

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
