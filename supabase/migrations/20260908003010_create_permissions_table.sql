-- Migration: table permissions — catalogue des permissions par module
-- (scission de 20260908003000_roles_catalog.sql, 1 table = 1 fichier.)

create table public.permissions (
  code text primary key,
  module text not null unique
);

alter table public.permissions enable row level security;

create policy permissions_read_all
on public.permissions for select to authenticated using (true);
