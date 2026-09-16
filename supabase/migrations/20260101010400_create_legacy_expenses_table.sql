-- Migration: table legacy_expenses (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_expenses (
  id               text primary key default gen_random_uuid()::text,
  merchant_id      text not null,
  client_id        text unique,
  amount           integer not null,
  category         text not null,
  description      text,
  is_voice         boolean not null default false,
  voice_transcript text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_legacy_expenses_merchant_id on public.legacy_expenses(merchant_id);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_expenses disable row level security;
