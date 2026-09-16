-- Migration: fonction legacy_keiwa_apply_operation — opération de portefeuille atomique
-- Extrait de 20260916000000_marchand_features.sql (re-baseline 1 objet = 1 fichier).
--
-- Verrou de ligne du portefeuille (for update) : sérialise chaque
-- depot/retrait/transfert d'un marchand, si bien que des appels concurrents
-- ne peuvent ni dépenser deux fois le solde ni perdre une mise à jour
-- (un read-then-write depuis l'API serait exposé aux deux). Les mutations
-- financières passent par une fonction SQL transactionnelle (doc
-- d'architecture §Principes).
--
-- Lève l'exception 'SOLDE_INSUFFISANT' quand un retrait/transfert dépasse le
-- solde — l'API la traduit en 400.

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
  -- Idempotence : une opération en file offline rejouée deux fois renvoie la
  -- transaction d'origine au lieu de s'appliquer deux fois.
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
