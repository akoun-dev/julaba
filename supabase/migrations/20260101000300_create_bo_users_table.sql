-- Migration: table bo_users (auth legacy)
-- Extrait de 004500_legacy_auth_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.bo_users (
  id                     text primary key default gen_random_uuid()::text,
  email                  text not null unique,
  password_hash          text not null,
  name                   text not null,
  role                   text not null default 'operateur_terrain',
  zone                   text,
  is_active              boolean not null default true,
  last_login             timestamptz,
  mfa_secret             text,
  force_password_change  boolean not null default false,
  failed_login_attempts  integer not null default 0,
  locked_until           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_bo_users_zone on public.bo_users(zone);
create index if not exists idx_bo_users_role on public.bo_users(role);

-- RLS désactivée : tables legacy accédées uniquement côté serveur
-- (admin client / device session), l'auth applicative est gérée par l'app.

-- updated_at automatique
drop trigger if exists set_bo_users_updated_at on public.bo_users;
create trigger set_bo_users_updated_at
  before update on public.bo_users
  for each row execute function public.set_updated_at_legacy();
alter table public.bo_users enable row level security;
