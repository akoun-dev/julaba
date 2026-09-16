-- Migration: table legacy_bo_keiwa_accounts (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_keiwa_accounts (
  id                text primary key default gen_random_uuid()::text,
  holder_name       text not null,
  holder_phone      text not null,
  zone              text,
  balance           integer not null default 0,
  transaction_count integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_legacy_bo_keiwa_accounts_zone on public.legacy_bo_keiwa_accounts(zone);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_bo_keiwa_accounts disable row level security;

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_bo_keiwa_accounts_updated_at on public.legacy_bo_keiwa_accounts;
create trigger set_legacy_bo_keiwa_accounts_updated_at
  before update on public.legacy_bo_keiwa_accounts
  for each row execute function public.set_updated_at_legacy();
