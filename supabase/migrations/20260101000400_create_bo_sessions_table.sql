-- Migration: table bo_sessions (auth legacy)
-- Extrait de 004500_legacy_auth_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.bo_sessions (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null references public.bo_users(id) on delete cascade,
  token_hash  text not null unique,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  last_used_at timestamptz not null default now(),
  revoked_at  timestamptz
);

create index if not exists idx_bo_sessions_user_id on public.bo_sessions(user_id);

-- RLS désactivée : tables legacy accédées uniquement côté serveur
-- (admin client / device session), l'auth applicative est gérée par l'app.
alter table public.bo_sessions disable row level security;
