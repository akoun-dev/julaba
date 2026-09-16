-- Migration: table legacy_tontines (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_tontines (
  id           text primary key default gen_random_uuid()::text,
  name         text not null,
  amount       integer not null default 0,
  frequency    text not null default 'mensuel',
  member_count integer not null default 0,
  next_due_date timestamptz,
  created_at   timestamptz not null default now()
);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_tontines enable row level security;

alter table public.legacy_tontines
  add column if not exists client_id text unique;
