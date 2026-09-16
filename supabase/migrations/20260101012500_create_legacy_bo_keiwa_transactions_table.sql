-- Migration: table legacy_bo_keiwa_transactions (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_keiwa_transactions (
  id               text primary key default gen_random_uuid()::text,
  type             text not null,
  amount           integer not null,
  sender_name      text,
  sender_phone     text,
  recipient_name   text,
  recipient_phone  text,
  account_id       text references public.legacy_bo_keiwa_accounts(id),
  status           text not null default 'termine',
  created_at       timestamptz not null default now()
);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_bo_keiwa_transactions enable row level security;
