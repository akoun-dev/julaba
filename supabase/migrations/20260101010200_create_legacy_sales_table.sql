-- Migration: table legacy_sales (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_sales (
  id               text primary key default gen_random_uuid()::text,
  merchant_id      text not null,
  session_id       text,
  client_id        text unique,
  total_amount     integer not null default 0,
  change_amount    integer not null default 0,
  amount_received  integer not null default 0,
  is_voice_sale    boolean not null default false,
  voice_transcript text,
  note             text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_legacy_sales_merchant_id on public.legacy_sales(merchant_id);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_sales enable row level security;
