-- Migration: table legacy_bo_credit_scores (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_credit_scores (
  id                 text primary key default gen_random_uuid()::text,
  actor_id           text not null,
  actor_name         text not null,
  zone               text not null,
  score              integer not null,
  risk_level         text not null,
  credit_limit       integer,
  last_calculated_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_legacy_bo_credit_scores_actor_id on public.legacy_bo_credit_scores(actor_id);
create index if not exists idx_legacy_bo_credit_scores_zone on public.legacy_bo_credit_scores(zone);
create index if not exists idx_legacy_bo_credit_scores_risk_level on public.legacy_bo_credit_scores(risk_level);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_bo_credit_scores disable row level security;

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_bo_credit_scores_updated_at on public.legacy_bo_credit_scores;
create trigger set_legacy_bo_credit_scores_updated_at
  before update on public.legacy_bo_credit_scores
  for each row execute function public.set_updated_at_legacy();
