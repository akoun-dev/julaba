-- Migration: fonction merchant_record_movement (STK-803)
-- Mouvement de stock simple (§20-22) : PERTES (« j'ai perdu 5 kilos » →
-- LOSS −5, PAS une vente), DÉGÂTS, DONS, RETOURS CLIENT, RÉCEPTION libre,
-- PRODUCTION, AJUSTEMENTS manuels. La magnitude passée est positive, le
-- signe est dérivé du type (D4). Sortie anormale ⇒ reason OBLIGATOIRE
-- (CHECK en table + garde ici, message propre).
--
-- Stock inconnu (§23) : toute SORTIE sur un produit sans balance ou
-- balance UNKNOWN → UNKNOWN_STOCK (« vérifie ton stock d'abord ») —
-- on ne décrémente jamais un stock qu'on ne connaît pas. Les ENTRÉES
-- créent la balance (le marchand sait ce qui entre).
--
-- Types gérés ici : RECEIPT, PRODUCTION, CUSTOMER_RETURN, ADJUSTMENT_IN,
-- LOSS, DAMAGE, DONATION, SUPPLIER_RETURN, ADJUSTMENT_OUT.
-- SALE → merchant_record_sale ; PURCHASE → merchant_record_purchase ;
-- TRANSFER_* → RPC de transfert (STK-809) ; OPENING_BALANCE → backfill.
--
-- Codes métier : INSUFFICIENT_STOCK, PRODUCT_NOT_FOUND, UNKNOWN_STOCK,
-- INVALID_QUANTITY. Sécurité : security definer, service_role uniquement.

create or replace function public.merchant_record_movement(
  p_merchant_id        text,
  p_operation_id       uuid,
  p_device_id          text default null,
  p_product_id         text,
  p_movement_type      text,
  p_quantity_base      numeric,
  p_quantity_commercial numeric default null,
  p_unit_code          text default null,
  p_reason             text default null,
  p_reason_note        text default null,
  p_reference_type     text default null,
  p_reference_id       text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_in_types  constant text[] := array['RECEIPT', 'PRODUCTION', 'CUSTOMER_RETURN', 'ADJUSTMENT_IN'];
  c_out_types constant text[] := array['LOSS', 'DAMAGE', 'DONATION', 'SUPPLIER_RETURN', 'ADJUSTMENT_OUT'];
  v_movement  public.merchant_stock_movements%rowtype;
  v_product   public.legacy_products%rowtype;
  v_balance   public.merchant_stock_balances%rowtype;
  v_balance_exists boolean;
  v_unit      text;
  v_signed    numeric(14, 3);
begin
  if p_merchant_id is null or not exists
    (select 1 from public.merchants where id = p_merchant_id) then
    raise exception using errcode = '22023', message = 'Marchand introuvable';
  end if;
  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'operation_id obligatoire';
  end if;
  if p_movement_type in ('SALE') then
    raise exception using errcode = '22023',
      message = 'Une vente passe par merchant_record_sale';
  end if;
  if p_movement_type in ('PURCHASE') then
    raise exception using errcode = '22023',
      message = 'Un achat passe par merchant_record_purchase';
  end if;
  if p_movement_type in ('TRANSFER_IN', 'TRANSFER_OUT') then
    raise exception using errcode = '22023',
      message = 'Un transfert passe par les RPC de transfert';
  end if;
  if p_movement_type = 'OPENING_BALANCE' then
    raise exception using errcode = '22023',
      message = 'Le stock initial passe par merchant_backfill_opening_balances';
  end if;
  if not (p_movement_type = any (c_in_types) or p_movement_type = any (c_out_types)) then
    raise exception using errcode = '22023', message = 'Type de mouvement invalide';
  end if;
  if p_quantity_base is null or p_quantity_base <= 0 then
    raise exception using errcode = 'P0001',
      message = 'INVALID_QUANTITY',
      detail = jsonb_build_object('requested', p_quantity_base)::text;
  end if;
  if p_movement_type = any (c_out_types) and coalesce(p_reason, '') = '' then
    raise exception using errcode = '22023',
      message = 'Une raison est obligatoire pour une sortie de stock';
  end if;

  select * into v_product from public.legacy_products
    where id = p_product_id for update;
  if not found then
    raise exception using errcode = 'P0001',
      message = 'PRODUCT_NOT_FOUND',
      detail = jsonb_build_object('product_id', p_product_id)::text;
  end if;

  -- Idempotence : rejeu offline → le mouvement existant, sans rien refaire.
  select * into v_movement from public.merchant_stock_movements
    where merchant_id = p_merchant_id and operation_id = p_operation_id;
  if found then
    return jsonb_build_object('created', false, 'movement', to_jsonb(v_movement));
  end if;

  select * into v_balance from public.merchant_stock_balances
    where merchant_id = p_merchant_id and product_id = p_product_id
    for update;
  v_balance_exists := found;

  if p_movement_type = any (c_out_types) then
    v_signed := -p_quantity_base;
    if not v_balance_exists or v_balance.stock_precision = 'UNKNOWN' then
      raise exception using errcode = 'P0001',
        message = 'UNKNOWN_STOCK',
        detail = jsonb_build_object('product_id', p_product_id,
          'product', v_product.name)::text;
    end if;
    if p_quantity_base > v_balance.quantity_base then
      select u.unit_code into v_unit from public.merchant_product_units u
        where u.merchant_id = p_merchant_id and u.product_id = p_product_id
          and u.is_base limit 1;
      raise exception using errcode = 'P0001',
        message = 'INSUFFICIENT_STOCK',
        detail = jsonb_build_object(
          'available', v_balance.quantity_base,
          'requested', p_quantity_base,
          'unit', v_unit,
          'product', v_product.name,
          'product_id', p_product_id)::text;
    end if;
  else
    v_signed := p_quantity_base;
    if not v_balance_exists then
      insert into public.merchant_stock_balances
        (merchant_id, product_id, quantity_base, stock_precision)
      values (p_merchant_id, p_product_id, 0, 'EXACT');
      select * into v_balance from public.merchant_stock_balances
        where merchant_id = p_merchant_id and product_id = p_product_id
        for update;
    end if;
  end if;

  insert into public.merchant_stock_movements
    (merchant_id, product_id, movement_type, quantity_base,
     quantity_commercial, unit_code, reason, reason_note,
     reference_type, reference_id, operation_id, device_id, created_by)
  values
    (p_merchant_id, p_product_id, p_movement_type, v_signed,
     p_quantity_commercial, p_unit_code, p_reason, p_reason_note,
     p_reference_type, p_reference_id, p_operation_id, p_device_id,
     p_merchant_id)
  returning * into v_movement;

  update public.merchant_stock_balances
    set quantity_base = quantity_base + v_signed, last_movement_at = now()
    where merchant_id = p_merchant_id and product_id = p_product_id
    returning * into v_balance;

  -- Double écriture D3 (écrêtage défensif sur les sorties).
  if v_signed > 0 then
    update public.legacy_products
      set stock_qty = stock_qty + round(v_signed)::int where id = p_product_id;
  else
    update public.legacy_products
      set stock_qty = greatest(0, stock_qty + round(v_signed)::int)
      where id = p_product_id;
  end if;

  return jsonb_build_object('created', true, 'movement', to_jsonb(v_movement),
    'balance', to_jsonb(v_balance));
end;
$$;

revoke all on function public.merchant_record_movement(text, uuid, text, text, text, numeric, numeric, text, text, text, text, text) from public;
grant execute on function public.merchant_record_movement(text, uuid, text, text, text, numeric, numeric, text, text, text, text, text) to service_role;
