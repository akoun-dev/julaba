-- Migration: table legacy_caisse_sessions (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_caisse_sessions (
  id             text primary key default gen_random_uuid()::text,
  merchant_id    text not null,
  fond_de_caisse integer not null default 0,
  total_ventes   integer not null default 0,
  total_depenses integer not null default 0,
  total_final    integer not null default 0,
  is_open        boolean not null default true,
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz
);

create index if not exists idx_legacy_caisse_sessions_merchant_id on public.legacy_caisse_sessions(merchant_id);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_caisse_sessions enable row level security;
