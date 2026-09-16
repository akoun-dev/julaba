-- Migration: table legacy_sync_conflict_reports (auth legacy)
-- Extrait de 004500_legacy_auth_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_sync_conflict_reports (
  id                 text primary key default gen_random_uuid()::text,
  subject            text not null,
  entity             text not null,
  payload            text not null default '{}',
  message            text not null,
  client_created_at  timestamptz not null,
  reported_at        timestamptz not null default now()
);

create index if not exists idx_legacy_sync_conflict_reports_subject on public.legacy_sync_conflict_reports(subject);
create index if not exists idx_legacy_sync_conflict_reports_reported on public.legacy_sync_conflict_reports(reported_at);

-- RLS désactivée : tables legacy accédées uniquement côté serveur
-- (admin client / device session), l'auth applicative est gérée par l'app.
alter table public.legacy_sync_conflict_reports disable row level security;
