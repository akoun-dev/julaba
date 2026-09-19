-- STK-809 — RPC merchant_transfer_receive : réception d'un transfert
-- inter-marchands (§28) — entrées RECEIPT chez le destinataire, statut
-- 'received', ajustement des écarts éventuels. SECURITY DEFINER, réservée
-- au service_role (voir 20260919100000).
--
-- Contenu = définition EXACTE appliquée en production (dump pg_proc).

CREATE OR REPLACE FUNCTION public.merchant_transfer_receive(p_merchant_id text, p_transfer_id text, p_device_id text DEFAULT NULL::text, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_transfer    public.merchant_stock_transfers%rowtype;
  v_item        public.merchant_stock_transfer_items%rowtype;
  v_product     public.legacy_products%rowtype;
  v_receiver_product_id text;
  v_received    numeric(14, 3);
  v_confirm     jsonb;
  v_items_out   jsonb := '[]'::jsonb;
begin
  if p_merchant_id is null or not exists
    (select 1 from public.merchants where id = p_merchant_id) then
    raise exception using errcode = '22023', message = 'Marchand introuvable';
  end if;
  if p_transfer_id is null or p_transfer_id = '' then
    raise exception using errcode = '22023', message = 'transfer_id obligatoire';
  end if;
  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'p_items doit être un tableau';
  end if;

  select * into v_transfer from public.merchant_stock_transfers
    where id = p_transfer_id for update;
  if not found then
    raise exception using errcode = 'P0001',
      message = 'TRANSFER_NOT_FOUND',
      detail = jsonb_build_object('transfer_id', p_transfer_id)::text;
  end if;
  if v_transfer.to_merchant_id <> p_merchant_id then
    raise exception using errcode = 'P0001',
      message = 'TRANSFER_NOT_ADDRESSED',
      detail = jsonb_build_object('transfer_id', p_transfer_id,
        'to_merchant_id', v_transfer.to_merchant_id)::text;
  end if;
  if v_transfer.status = 'received' then
    -- Idempotence : déjà reçu → état existant, rien ne se rejoue.
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

  for v_item in
    select * from public.merchant_stock_transfer_items
    where transfer_id = v_transfer.id
    order by product_id
  loop
    -- Quantité confirmée par le destinataire (match sur le produit de
    -- l'expéditeur), sinon la quantité envoyée.
    v_received := v_item.quantity_base;
    if p_items is not null then
      select coalesce(nullif(c ->> 'receivedQuantityBase', '')::numeric, v_received)
        into v_received
        from jsonb_array_elements(p_items) c
        where c ->> 'productId' = v_item.product_id
        limit 1;
    end if;
    if v_received is null or v_received < 0 then
      raise exception using errcode = 'P0001',
        message = 'INVALID_QUANTITY',
        detail = jsonb_build_object('product_id', v_item.product_id,
          'received', v_received)::text;
    end if;

    -- Résolution du produit CHEZ LE DESTINATAIRE (même nom, sinon création).
    select * into v_product from public.legacy_products
      where merchant_id = p_merchant_id
        and lower(trim(name)) = lower(trim(v_item.product_name))
      order by created_at
      limit 1;
    if found then
      v_receiver_product_id := v_product.id;
    else
      insert into public.legacy_products
        (merchant_id, name, category, price_unit, stock_qty)
      values
        (p_merchant_id, trim(v_item.product_name), 'autre', 0, 0)
      returning * into v_product;
      v_receiver_product_id := v_product.id;
    end if;

    -- Reçu > 0 : mouvement + balance (créée EXACT si première entrée).
    if v_received > 0 then
      insert into public.merchant_stock_balances
        (merchant_id, product_id, quantity_base, stock_precision)
      values (p_merchant_id, v_receiver_product_id, 0, 'EXACT')
        on conflict (merchant_id, product_id) do nothing;

      insert into public.merchant_stock_movements
        (merchant_id, product_id, movement_type, quantity_base,
         quantity_commercial, unit_code, reference_type, reference_id,
         operation_id, device_id, created_by)
      values
        (p_merchant_id, v_receiver_product_id, 'TRANSFER_IN', v_received,
         null, v_item.unit_code, 'transfer', v_transfer.id,
         md5('transfer-in:' || v_transfer.id || ':' || v_item.product_id)::uuid,
         p_device_id, p_merchant_id);

      update public.merchant_stock_balances
        set quantity_base = quantity_base + v_received, last_movement_at = now()
        where merchant_id = p_merchant_id and product_id = v_receiver_product_id;

      -- Double écriture D3 (produit du destinataire).
      update public.legacy_products
        set stock_qty = stock_qty + round(v_received)::int
        where id = v_receiver_product_id;
    end if;

    update public.merchant_stock_transfer_items
      set received_quantity_base = v_received
      where id = v_item.id
      returning * into v_item;

    v_items_out := v_items_out || to_jsonb(v_item)
      || jsonb_build_object('receiverProductId', v_receiver_product_id);
  end loop;

  update public.merchant_stock_transfers
    set status = 'received', received_at = now()
    where id = v_transfer.id
    returning * into v_transfer;

  return jsonb_build_object('created', true, 'transfer', to_jsonb(v_transfer),
    'items', v_items_out);
end;
$function$

-- Durcissement SEC-813 (défense en profondeur) : réservées au service_role.
revoke execute on function public.merchant_transfer_receive from anon, authenticated;

