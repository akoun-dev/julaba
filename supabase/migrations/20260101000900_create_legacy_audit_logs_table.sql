-- Migration: table legacy_audit_logs (auth legacy)
-- Extrait de 004500_legacy_auth_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_audit_logs (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null,
  user_name   text not null,
  user_email  text not null,
  action      text not null,
  module      text not null,
  details     text,
  ip_address  text,
  user_agent  text,
  signature   text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_legacy_audit_logs_module on public.legacy_audit_logs(module);
create index if not exists idx_legacy_audit_logs_action on public.legacy_audit_logs(action);
create index if not exists idx_legacy_audit_logs_created on public.legacy_audit_logs(created_at);

-- RLS désactivée : tables legacy accédées uniquement côté serveur
-- (admin client / device session), l'auth applicative est gérée par l'app.
alter table public.legacy_audit_logs disable row level security;
