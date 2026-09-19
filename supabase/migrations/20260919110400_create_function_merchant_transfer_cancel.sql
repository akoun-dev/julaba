-- STK-809 — RPC merchant_transfer_cancel : annulation d'un transfert
-- non encore reçu (status sent → cancelled, raison obligatoire).
--
-- Contenu = définition EXACTE appliquée en production (dump pg_proc).

CREATE OR REPLACE FUNCTION public.merchant_transfer_cancel(p_merchant_id text, p_transfer_id text, p_device_id text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_transfer public.merchant_stock_transfers%rowtype;
  v_item     public.merchant_stock_transfer_items%rowtype;
  v_items_out jsonb := '[]'::jsonb;
begin
  if p_merchant_id is null or not exists
    (select 1 from public.merchants where id = p_merchant_id) then
    raise exception using errcode = '22023', message = 'Marchand introuvable';
  end if;
  if p_transfer_id is null or p_transfer_id = '' then
    raise exception using errcode = '22023', message = 'transfer_id obligatoire';
  end if;

  select * into v_transfer from public.merchant_stock_transfers
    where id = p_transfer_id for update;
  if not found then
    raise exception using errcode = 'P0001',
      message = 'TRANSFER_NOT_FOUND',
      detail = jsonb_build_object('transfer_id', p_transfer_id)::text;
  end if;
  if v_transfer.merchant_id <> p_merchant_id then
    raise exception using errcode = 'P0001',
      message = 'TRANSFER_NOT_ADDRESSED',
      detail = jsonb_build_object('transfer_id', p_transfer_id,
        'merchant_id', v_transfer.merchant_id)::text;
  end if;
  if v_transfer.status = 'cancelled' then
    return jsonb_build_object('created', false, 'transfer', to_jsonb(v_transfer),
      'items',
        coalesce((select jsonb_agg(to_jsonb(i)) from public.merchant_stock_transfer_items i
                  where i.transfer_id = v_transfer.id), '[]'::jsonb));
  end if;
  if v_transfer.status <> 'sent' then
    raise exception using errcode = 'P0001',
      message = 'TRANSFER_ALREADY_PROCESSED',
      detail = jsonb_build_object('transfer_id', p_transfer_id,
        'status', v_transfer.status)::text;
  end if;

  -- Rentrer le stock chez l'expéditeur : TRANSFER_IN référencé au transfert.
  for v_item in
    select * from public.merchant_stock_transfer_items
    where transfer_id = v_transfer.id
    order by product_id
  loop
    -- Le produit de l'expéditeur existe forcément (FK + envoi réussi).
    insert into public.merchant_stock_movements
      (merchant_id, product_id, movement_type, quantity_base,
       unit_code, reference_type, reference_id,
       operation_id, device_id, created_by)
    values
      (p_merchant_id, v_item.product_id, 'TRANSFER_IN', v_item.quantity_base,
       v_item.unit_code, 'transfer-cancel', v_transfer.id,
       md5('transfer-cancel:' || v_transfer.id || ':' || v_item.product_id)::uuid,
       p_device_id, p_merchant_id);

    insert into public.merchant_stock_balances
      (merchant_id, product_id, quantity_base, stock_precision)
    values (p_merchant_id, v_item.product_id, 0, 'EXACT')
      on conflict (merchant_id, product_id) do nothing;

    update public.merchant_stock_balances
      set quantity_base = quantity_base + v_item.quantity_base,
          last_movement_at = now()
      where merchant_id = p_merchant_id and product_id = v_item.product_id;

    update public.legacy_products
      set stock_qty = stock_qty + round(v_item.quantity_base)::int
      where id = v_item.product_id;

    v_items_out := v_items_out || to_jsonb(v_item);
  end loop;

  update public.merchant_stock_transfers
    set status = 'cancelled', note = coalesce(nullif(trim(p_reason), ''), note)
    where id = v_transfer.id
    returning * into v_transfer;

  return jsonb_build_object('created', true, 'transfer', to_jsonb(v_transfer),
    'items', v_items_out);
end;
$function$

-- Durcissement SEC-813 (défense en profondeur) : réservées au service_role.
revoke execute on function public.merchant_transfer_cancel from anon, authenticated;

