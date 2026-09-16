-- Migration: table legacy_keiwa_wallets — portefeuille marchand (Keiwa)
-- Extrait de 20260916000000_marchand_features.sql (re-baseline 1 table = 1 fichier).
--
-- Un portefeuille par marchand, solde FCFA en entier (jamais de float, règle
-- « money » de l'architecture). Créé paresseusement au premier accès via l'API.
-- RLS non activée — cohérent avec toute la famille legacy_* : l'auth passe par
-- requireDeviceOwner à la frontière API (cf. 004500_legacy_auth_tables.sql).

create table if not exists public.legacy_keiwa_wallets (
  id          text primary key default gen_random_uuid()::text,
  merchant_id text not null unique,
  balance     integer not null default 0 check (balance >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session).
alter table public.legacy_keiwa_wallets enable row level security;
