-- Migration: table legacy_bo_deliveries (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_deliveries (
  id               text primary key default gen_random_uuid()::text,
  order_id         text,
  sender_name      text not null,
  sender_phone     text not null,
  recipient_name   text not null,
  recipient_phone  text not null,
  address          text not null,
  zone             text not null,
  status           text not null default 'en_attente',
  courier_name     text,
  pickup_at        timestamptz,
  delivered_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_legacy_bo_deliveries_zone on public.legacy_bo_deliveries(zone);
create index if not exists idx_legacy_bo_deliveries_status on public.legacy_bo_deliveries(status);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_bo_deliveries disable row level security;

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_bo_deliveries_updated_at on public.legacy_bo_deliveries;
create trigger set_legacy_bo_deliveries_updated_at
  before update on public.legacy_bo_deliveries
  for each row execute function public.set_updated_at_legacy();
