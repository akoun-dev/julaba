-- Migration: table legacy_tontine_contributions (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_tontine_contributions (
  id          text primary key default gen_random_uuid()::text,
  tontine_id  text not null,
  merchant_id text not null,
  amount      integer not null,
  client_id   text unique,
  created_at  timestamptz not null default now()
);

create index if not exists idx_legacy_tontine_contributions_tontine_id on public.legacy_tontine_contributions(tontine_id);
create index if not exists idx_legacy_tontine_contributions_merchant_id on public.legacy_tontine_contributions(merchant_id);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_tontine_contributions disable row level security;
