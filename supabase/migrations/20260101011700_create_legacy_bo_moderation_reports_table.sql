-- Migration: table legacy_bo_moderation_reports (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_moderation_reports (
  id           text primary key default gen_random_uuid()::text,
  target_type  text not null,
  target_id    text,
  target_name  text,
  reason       text not null,
  severity     text not null default 'moyenne',
  status       text not null default 'en_attente',
  reported_by  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_legacy_bo_moderation_reports_status on public.legacy_bo_moderation_reports(status);
create index if not exists idx_legacy_bo_moderation_reports_target on public.legacy_bo_moderation_reports(target_type, target_id);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_bo_moderation_reports_updated_at on public.legacy_bo_moderation_reports;
create trigger set_legacy_bo_moderation_reports_updated_at
  before update on public.legacy_bo_moderation_reports
  for each row execute function public.set_updated_at_legacy();
alter table public.legacy_bo_moderation_reports enable row level security;

alter table public.legacy_bo_moderation_reports
  add column if not exists reporter_role text,
  add column if not exists description text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution_note text;
