-- Migration: fonction merchant_adjust_to_count (STK-803)
-- Ajustement au comptage réel (§22) : « j'ai compté, il reste 30 kg » alors
-- que le système annonce 35 → delta −5 → mouvement ADJUSTMENT_OUT 5 kg
-- reason=INVENTORY_COUNT. L'historique est CONSERVÉ, jamais écrasé sans
-- trace (§44) : la correction EST un mouvement. Après comptage, la balance
-- passe à EXACT. Le comptage d'un produit jamais suivi INITIALISE sa
-- balance (§23 : UNKNOWN → demander une vérification → c'est ce comptage).
--
-- Idempotence : rejeu (merchant_id, operation_id) → résultat existant.
-- Codes métier : PRODUCT_NOT_FOUND, INVALID_QUANTITY.
-- Sécurité : security definer, service_role uniquement.

create or replace function public.merchant_adjust_to_count(
  p_merchant_id            text,
  p_operation_id           uuid,
  p_device_id              text default null,
  p_product_id             text,
  p_counted_quantity_base  numeric,
  p_note                   text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_movement  public.merchant_stock_movements%rowtype;
  v_product   public.legacy_products%rowtype;
  v_balance   public.merchant_stock_balances%rowtype;
  v_balance_exists boolean;
  v_before    numeric(14, 3);
  v_delta     numeric(14, 3);
begin
  if p_merchant_id is null or not exists
    (select 1 from public.merchants where id = p_merchant_id) then
    raise exception using errcode = '22023', message = 'Marchand introuvable';
  end if;
  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'operation_id obligatoire';
  end if;
  if p_counted_quantity_base is null or p_counted_quantity_base < 0 then
    raise exception using errcode = 'P0001',
      message = 'INVALID_QUANTITY',
      detail = jsonb_build_object('requested', p_counted_quantity_base)::text;
  end if;

  select * into v_product from public.legacy_products
    where id = p_product_id for update;
  if not found then
    raise exception using errcode = 'P0001',
      message = 'PRODUCT_NOT_FOUND',
      detail = jsonb_build_object('product_id', p_product_id)::text;
  end if;

  -- Idempotence : rejeu offline → le résultat existant, sans rien refaire.
  select * into v_movement from public.merchant_stock_movements
    where merchant_id = p_merchant_id and operation_id = p_operation_id;
  if found then
    return jsonb_build_object('created', false, 'movement', to_jsonb(v_movement),
      'balance', (select to_jsonb(b) from public.merchant_stock_balances b
                  where b.merchant_id = p_merchant_id
                    and b.product_id = p_product_id));
  end if;

  select * into v_balance from public.merchant_stock_balances
    where merchant_id = p_merchant_id and product_id = p_product_id
    for update;
  v_balance_exists := found;
  v_before := case when v_balance_exists and v_balance.stock_precision <> 'UNKNOWN'
                   then v_balance.quantity_base else 0 end;
  v_delta := p_counted_quantity_base - v_before;

  if not v_balance_exists then
    insert into public.merchant_stock_balances
      (merchant_id, product_id, quantity_base, stock_precision, last_movement_at)
    values
      (p_merchant_id, p_product_id, p_counted_quantity_base, 'EXACT', now());
  else
    update public.merchant_stock_balances
      set quantity_base = p_counted_quantity_base,
          stock_precision = 'EXACT',
          last_movement_at = now()
      where merchant_id = p_merchant_id and product_id = p_product_id;
  end if;

  if v_delta > 0 then
    insert into public.merchant_stock_movements
      (merchant_id, product_id, movement_type, quantity_base, reason,
       reason_note, reference_type, operation_id, device_id, created_by)
    values
      (p_merchant_id, p_product_id, 'ADJUSTMENT_IN', v_delta,
       'INVENTORY_COUNT', p_note, 'inventory_count', p_operation_id,
       p_device_id, p_merchant_id)
    returning * into v_movement;
  elsif v_delta < 0 then
    insert into public.merchant_stock_movements
      (merchant_id, product_id, movement_type, quantity_base, reason,
       reason_note, reference_type, operation_id, device_id, created_by)
    values
      (p_merchant_id, p_product_id, 'ADJUSTMENT_OUT', v_delta,
       'INVENTORY_COUNT', p_note, 'inventory_count', p_operation_id,
       p_device_id, p_merchant_id)
    returning * into v_movement;
  end if;

  -- Double écriture D3 : le comptage est la vérité du marchand.
  update public.legacy_products
    set stock_qty = round(p_counted_quantity_base)::int
    where id = p_product_id;

  select * into v_balance from public.merchant_stock_balances
    where merchant_id = p_merchant_id and product_id = p_product_id;

  return jsonb_build_object('created', v_movement.id is not null,
    'movement', case when v_movement.id is null then null else to_jsonb(v_movement) end,
    'balance', to_jsonb(v_balance),
    'before', v_before,
    'after', p_counted_quantity_base,
    'delta', v_delta);
end;
$$;

revoke all on function public.merchant_adjust_to_count(text, uuid, text, text, numeric, text) from public;
grant execute on function public.merchant_adjust_to_count(text, uuid, text, text, numeric, text) to service_role;
