-- Migration: MODE-909 (§28) — annulation/correction de vente.
--
-- Une vente enregistrée ne se supprime JAMAIS : ni DELETE ni UPDATE sur
-- legacy_sales. L'annulation est une OPÉRATION INVERSE append-only : une
-- ligne ici ciblant la vente (sale_client_id = legacy_sales.client_id).
-- Une vente annulée = EXISTS une ligne ici la ciblant — l'historique reste
-- intact et le stock revient (RPC merchant_reverse_sale, migration suivante).
--
-- Idempotence (§31-32) :
--   UNIQUE (merchant_id, operation_id) — le rejeu offline rejoue le MÊME
--   operation_id, l'annulation est reconnue sans rien refaire ;
--   UNIQUE (merchant_id, sale_client_id) — une vente ne s'annule qu'UNE
--   fois (toute deuxième demande retourne l'état courant).
--
-- Raison obligatoire 3-200 (après trim) : une annulation sans pourquoi
-- n'est pas traçable — le marchand (ou Tata) dit pourquoi.
--
-- NB : AUCUNE colonne n'est ajoutée à legacy_sales — la vente reste ce
-- qu'elle est ; l'annulation vit dans sa propre entité.

create table if not exists public.merchant_sale_reversals (
  id             uuid primary key default gen_random_uuid(),
  merchant_id    text not null,
  operation_id   uuid not null,
  -- legacy_sales.client_id de la vente annulée (id d'idempotence appareil).
  sale_client_id text not null,
  reason         text not null check (length(trim(reason)) between 3 and 200),
  created_at     timestamptz not null default now(),
  unique (merchant_id, operation_id),
  unique (merchant_id, sale_client_id)
);

-- Historique des annulations du marchand : les plus récentes d'abord.
create index if not exists idx_merchant_sale_reversals_merchant_created
  on public.merchant_sale_reversals(merchant_id, created_at desc);

alter table public.merchant_sale_reversals enable row level security;
