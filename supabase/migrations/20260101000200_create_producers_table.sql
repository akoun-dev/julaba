-- Migration: table producers (auth legacy)
-- Extrait de 004500_legacy_auth_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.producers (
  id           text primary key default gen_random_uuid()::text,
  first_name   text not null,
  phone        text not null unique,
  auth_method  text not null default 'pin',
  pin_hash     text,
  pattern_hash text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- RLS désactivée : tables legacy accédées uniquement côté serveur
-- (admin client / device session), l'auth applicative est gérée par l'app.

-- updated_at automatique
drop trigger if exists set_producers_updated_at on public.producers;
create trigger set_producers_updated_at
  before update on public.producers
  for each row execute function public.set_updated_at_legacy();
alter table public.producers enable row level security;

alter table public.producers
  add column if not exists sexe text check (sexe is null or sexe in ('masculin', 'feminin', 'autre'));
