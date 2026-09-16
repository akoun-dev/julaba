-- Migration: marchand features — tontine creation, Keiwa wallet, supplier orders
-- These tables serve the marchand device-flow (auth = device-session cookie +
-- admin client, RLS not enabled — consistent with every other legacy_* table:
-- see 004500_legacy_auth_tables.sql for why the legacy family opts out of RLS
-- and relies on requireDeviceOwner at the API boundary instead).

-- ============================================================
-- 1. legacy_tontines.client_id — idempotent tontine creation
-- ============================================================
-- The marchand can now CREATE a tontine (not only cotise). Every device
-- write carries a clientId for safe replay (offline queue), so the tontines
-- table needs the same unique client_id the other marchand tables have.
alter table public.legacy_tontines
  add column if not exists client_id text unique;

-- ============================================================
-- 2. legacy_keiwa_wallets — marchand wallet (Keiwa)
-- ============================================================
-- One wallet per marchand, FCFA balance as integer (never float, per the
-- architecture's money rule). Created lazily on first access via the API.
create table if not exists public.legacy_keiwa_wallets (
  id          text primary key default gen_random_uuid()::text,
  merchant_id text not null unique,
  balance     integer not null default 0 check (balance >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- 3. legacy_keiwa_transactions — wallet ledger (append-only)
-- ============================================================
-- Financial audit trail: rows are never updated or deleted by the API, only
-- inserted. type: depot | retrait | transfert | paiement.
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

-- Atomic wallet operation: wallet row lock (for update) serializes every
-- depot/retrait/transfert for a merchant, so concurrent calls can neither
-- double-spend past the balance nor lose an update (read-then-write from
-- the API layer would be subject to both). Financial mutations go through
-- a transactional SQL function per the architecture doc (§Principes).
-- Raises exception 'SOLDE_INSUFFISANT' when a retrait/transfert exceeds
-- the balance — the API maps it to a 400.
create or replace function public.legacy_keiwa_apply_operation(
  p_merchant_id text,
  p_type text,
  p_amount integer,
  p_recipient_name text default null,
  p_recipient_phone text default null,
  p_note text default null,
  p_client_id text default null
) returns json
language plpgsql
as $$
declare
  v_wallet public.legacy_keiwa_wallets;
  v_tx public.legacy_keiwa_transactions;
  v_balance_after integer;
begin
  -- Idempotency: an offline-queued operation replayed twice returns the
  -- original transaction instead of applying twice.
  if p_client_id is not null then
    select * into v_tx
    from public.legacy_keiwa_transactions
    where client_id = p_client_id;
    if found then
      select * into v_wallet from public.legacy_keiwa_wallets where id = v_tx.wallet_id;
      return json_build_object(
        'replayed', true,
        'transaction', to_jsonb(v_tx),
        'balance', v_wallet.balance
      );
    end if;
  end if;

  insert into public.legacy_keiwa_wallets (merchant_id)
  values (p_merchant_id)
  on conflict (merchant_id) do nothing;

  select * into v_wallet
  from public.legacy_keiwa_wallets
  where merchant_id = p_merchant_id
  for update;

  if p_type = 'depot' then
    v_balance_after := v_wallet.balance + p_amount;
  else
    if v_wallet.balance < p_amount then
      raise exception 'SOLDE_INSUFFISANT';
    end if;
    v_balance_after := v_wallet.balance - p_amount;
  end if;

  update public.legacy_keiwa_wallets
  set balance = v_balance_after, updated_at = now()
  where id = v_wallet.id
  returning * into v_wallet;

  insert into public.legacy_keiwa_transactions
    (wallet_id, merchant_id, type, amount, balance_after,
     recipient_name, recipient_phone, note, client_id)
  values
    (v_wallet.id, p_merchant_id, p_type, p_amount, v_balance_after,
     p_recipient_name, p_recipient_phone, p_note, p_client_id)
  returning * into v_tx;

  return json_build_object(
    'replayed', false,
    'transaction', to_jsonb(v_tx),
    'balance', v_wallet.balance
  );
end;
$$;

-- ============================================================
-- 4. legacy_supplier_orders — Marché Jùlaba supplier ordering
-- ============================================================
-- Orders a marchand places against a supplier catalog entry (the Marché
-- screen's hardcoded catalog is the supplier side until a real supplier
-- portal exists). Status lifecycle owned by the supplier/backoffice side:
-- en_attente → confirmee → livree, en_attente → annulee (by the marchand).
create table if not exists public.legacy_supplier_orders (
  id           text primary key default gen_random_uuid()::text,
  merchant_id  text not null,
  client_id    text unique,
  supplier     text not null,
  product_name text not null,
  quantity     integer not null default 1 check (quantity > 0),
  unit_price   integer not null default 0 check (unit_price >= 0),
  total_amount integer not null default 0 check (total_amount >= 0),
  status       text not null default 'en_attente'
    check (status in ('en_attente', 'confirmee', 'livree', 'annulee')),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_legacy_supplier_orders_merchant
  on public.legacy_supplier_orders(merchant_id, created_at desc);
create index if not exists idx_legacy_supplier_orders_status
  on public.legacy_supplier_orders(merchant_id, status);

-- ============================================================
-- 5. legacy_bo_content_increment_views — atomic Academy view counter
-- ============================================================
-- Supabase JS cannot express "set view_count = view_count + 1" in a PATCH
-- body, and read-then-write from the route would let two concurrent
-- readers overwrite each other's count. Only published rows are
-- countable: the function returns null for unknown/draft/archived ids,
-- which the API maps to a 404.
create or replace function public.legacy_bo_content_increment_views(
  p_id text
) returns integer
language sql
as $$
  update public.legacy_bo_contents
  set view_count = view_count + 1
  where id = p_id and status = 'publie'
  returning view_count;
$$;
