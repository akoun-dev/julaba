-- Migration: table legacy_keiwa_transactions — registre du portefeuille (append-only)
-- Extrait de 20260916000000_marchand_features.sql (re-baseline 1 table = 1 fichier).
--
-- Piste d'audit financière : les lignes ne sont jamais mises à jour ni
-- supprimées par l'API, seulement insérées. type : depot | retrait |
-- transfert | paiement.

create table if not exists public.legacy_keiwa_transactions (
  id              text primary key default gen_random_uuid()::text,
  wallet_id       text not null references public.legacy_keiwa_wallets(id) on delete cascade,
  merchant_id     text not null,
  type            text not null check (type in ('depot', 'retrait', 'transfert', 'paiement')),
  amount          integer not null check (amount > 0),
  balance_after   integer not null,
  recipient_name  text,
  recipient_phone text,
  note            text,
  client_id       text unique,
  created_at      timestamptz not null default now()
);

create index if not exists idx_legacy_keiwa_tx_wallet
  on public.legacy_keiwa_transactions(wallet_id, created_at desc);
create index if not exists idx_legacy_keiwa_tx_merchant
  on public.legacy_keiwa_transactions(merchant_id, created_at desc);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session).
alter table public.legacy_keiwa_transactions disable row level security;
