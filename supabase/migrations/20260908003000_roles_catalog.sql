-- Catalogue des rôles et permissions, seedé depuis la matrice historique
-- src/lib/backoffice-permissions.ts (source de vérité recommandée par
-- l'architecture §4.2). Lecture par tout utilisateur authentifié pour piloter
-- l'UI ; écriture réservée aux migrations/service, aucune policy client.

create table public.roles (
  code text primary key,
  label text not null,
  rank integer not null,
  is_backoffice boolean not null default false
);

create table public.permissions (
  code text primary key,
  module text not null unique
);

create table public.role_permissions (
  role_code text not null references public.roles(code) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

insert into public.roles (code, label, rank, is_backoffice) values
  ('super_admin', 'Super administrateur', 50, true),
  ('admin_general', 'Administrateur général', 40, true),
  ('admin_national', 'Administrateur national', 30, true),
  ('gestionnaire_zone', 'Gestionnaire de zone', 20, true),
  ('operateur_terrain', 'Opérateur terrain', 10, true),
  ('marchand', 'Marchand', 0, false),
  ('producteur', 'Producteur', 0, false),
  ('identificateur', 'Identificateur', 0, false);

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
  ('sync-conflicts', 'sync-conflicts'), ('notifications', 'notifications'), ('academie', 'academie');

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

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

create policy roles_read_all
on public.roles for select to authenticated using (true);

create policy permissions_read_all
on public.permissions for select to authenticated using (true);

create policy role_permissions_read_all
on public.role_permissions for select to authenticated using (true);
