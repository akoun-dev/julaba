-- Migration: table permissions — catalogue des permissions par module
-- (scission de 20260908003000_roles_catalog.sql, 1 table = 1 fichier.)

create table public.permissions (
  code text primary key,
  module text not null unique
);

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

alter table public.permissions enable row level security;

create policy permissions_read_all
on public.permissions for select to authenticated using (true);
