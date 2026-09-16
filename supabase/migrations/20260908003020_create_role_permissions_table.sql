-- Migration: table role_permissions — matrice rôle × permission
-- (scission de 20260908003000_roles_catalog.sql, 1 table = 1 fichier.)

create table public.role_permissions (
  role_code text not null references public.roles(code) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

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
) as seed(r, p);

alter table public.role_permissions enable row level security;

create policy role_permissions_read_all
on public.role_permissions for select to authenticated using (true);
