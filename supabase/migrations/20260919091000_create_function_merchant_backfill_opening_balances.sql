-- Migration: fonction merchant_backfill_opening_balances (STK-802)
-- Migration de l'existant (§40) : chaque produit actif du marchand reçoit
-- une balance (stock legacy = point de départ) et, si son stock legacy est
-- non nul, un mouvement OPENING_BALANCE (+qty). Idempotent et rejouable :
--   - balance : ON CONFLICT (merchant_id, product_id) DO NOTHING ;
--   - mouvement : operation_id déterministe md5('opening:' || product_id),
--     UNIQUE (merchant_id, operation_id) DO NOTHING.
-- Aucune donnée legacy n'est modifiée ni supprimée (§40-41).

create or replace function public.merchant_backfill_opening_balances()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_product  public.legacy_products%rowtype;
  v_balances bigint := 0;
  v_movements bigint := 0;
  v_scanned  bigint := 0;
begin
  for v_product in
    select * from public.legacy_products where is_active
    order by merchant_id, id  -- ordre stable, anti-deadlock
  loop
    v_scanned := v_scanned + 1;

    insert into public.merchant_stock_balances
      (merchant_id, product_id, quantity_base, stock_precision, last_movement_at)
    values
      (v_product.merchant_id, v_product.id, v_product.stock_qty, 'EXACT', now())
    on conflict (merchant_id, product_id) do nothing;
    if found then
      v_balances := v_balances + 1;
    end if;

    if v_product.stock_qty > 0 then
      insert into public.merchant_stock_movements
        (merchant_id, product_id, movement_type, quantity_base,
         quantity_commercial, unit_code, reason, reference_type,
         operation_id, device_id, created_by)
      values
        (v_product.merchant_id, v_product.id, 'OPENING_BALANCE', v_product.stock_qty,
         v_product.stock_qty, null, 'MIGRATION', 'backfill',
         md5('opening:' || v_product.id)::uuid, 'backfill', v_product.merchant_id)
      on conflict (merchant_id, operation_id) do nothing;
      if found then
        v_movements := v_movements + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'products_scanned', v_scanned,
    'balances_created', v_balances,
    'movements_created', v_movements
  );
end;
$$;

revoke all on function public.merchant_backfill_opening_balances() from public;
grant execute on function public.merchant_backfill_opening_balances() to service_role;
