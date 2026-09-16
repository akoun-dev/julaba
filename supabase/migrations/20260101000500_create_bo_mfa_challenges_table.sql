-- Migration: table bo_mfa_challenges (auth legacy)
-- Extrait de 004500_legacy_auth_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.bo_mfa_challenges (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null references public.bo_users(id) on delete cascade,
  code_hash   text not null,
  attempts    integer not null default 0,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_bo_mfa_challenges_user_id on public.bo_mfa_challenges(user_id);

-- RLS désactivée : tables legacy accédées uniquement côté serveur
-- (admin client / device session), l'auth applicative est gérée par l'app.
alter table public.bo_mfa_challenges disable row level security;
