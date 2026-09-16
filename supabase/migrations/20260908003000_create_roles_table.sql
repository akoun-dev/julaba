-- Migration: table roles — catalogue des rôles, seedé depuis la matrice
-- historique src/lib/backoffice-permissions.ts (architecture §4.2).
-- (scission de 20260908003000_roles_catalog.sql, 1 table = 1 fichier.)

create table public.roles (
  code text primary key,
  label text not null,
  rank integer not null,
  is_backoffice boolean not null default false
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

alter table public.roles enable row level security;

create policy roles_read_all
on public.roles for select to authenticated using (true);
