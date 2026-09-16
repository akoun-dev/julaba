-- Migration: table legacy_voice_logs (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_voice_logs (
  id            text primary key default gen_random_uuid()::text,
  merchant_id   text not null,
  transcript    text not null,
  intent        text,
  confidence    real,
  response_text text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_legacy_voice_logs_merchant_id on public.legacy_voice_logs(merchant_id);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_voice_logs enable row level security;
