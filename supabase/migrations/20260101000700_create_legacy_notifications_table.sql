-- Migration: table legacy_notifications (auth legacy)
-- Extrait de 004500_legacy_auth_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_notifications (
  id          text primary key default gen_random_uuid()::text,
  subject     text not null,
  type        text not null,
  title       text not null,
  body        text not null,
  data        text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_legacy_notifications_subject_read on public.legacy_notifications(subject, read);
create index if not exists idx_legacy_notifications_subject_created on public.legacy_notifications(subject, created_at);

-- RLS désactivée : tables legacy accédées uniquement côté serveur
-- (admin client / device session), l'auth applicative est gérée par l'app.
alter table public.legacy_notifications disable row level security;
