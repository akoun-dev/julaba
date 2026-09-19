-- STK-809 — RPC merchant_transfer_out : envoi d'un transfert
-- inter-marchands (§28). Deux transactions liées par le même transfer_id :
-- sorties SORTIE (TRANSFER_OUT) chez l'expéditeur, document
-- merchant_stock_transfers status='sent'. Idempotence sur client_id
-- (= operation_id) : deux envois simultanés du même id → le second viole
-- l'unicité (23505), jamais un double mouvement.
--
-- Contenu = définition EXACTE appliquée en production (dump pg_proc).

CREATE OR REPLACE FUNCTION public.merchant_transfer_out(p_merchant_id text, p_operation_id uuid, p_to_merchant_id text, p_device_id text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_transfer   public.merchant_stock_transfers%rowtype;
  v_product    public.legacy_products%rowtype;
  v_balance    public.merchant_stock_balances%rowtype;
  v_unit       text;
  v_item       jsonb;
  v_product_id text;
  v_quantity   numeric(14, 3);
  v_idx        int := 0;
  v_items      jsonb := '[]'::jsonb;
begin
  if p_merchant_id is null or not exists
    (select 1 from public.merchants where id = p_merchant_id) then
    raise exception using errcode = '22023', message = 'Marchand introuvable';
  end if;
  if p_to_merchant_id is null or not exists
    (select 1 from public.merchants where id = p_to_merchant_id) then
    raise exception using errcode = '22023', message = 'Marchand destinataire introuvable';
  end if;
  if p_to_merchant_id = p_merchant_id then
    raise exception using errcode = 'P0001',
      message = 'TRANSFER_SELF',
      detail = jsonb_build_object('merchant_id', p_merchant_id)::text;
  end if;
  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'operation_id obligatoire';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'Un transfert doit contenir au moins un article';
  end if;

  -- Idempotence : rejeu offline → le transfert existant, sans rien refaire.
  select * into v_transfer from public.merchant_stock_transfers
    where merchant_id = p_merchant_id and client_id = p_operation_id::text;
  if found then
    return jsonb_build_object('created', false, 'transfer', to_jsonb(v_transfer),
      'items',
        coalesce((select jsonb_agg(to_jsonb(i)) from public.merchant_stock_transfer_items i
                  where i.transfer_id = v_transfer.id), '[]'::jsonb));
  end if;

  -- Document d'abord (client_id UNIQUE = garde d'idempotence concurrente :
  -- deux envois simultanés du même operation_id → le second viole l'unicité
  -- et échoue en 23505, jamais en double mouvement).
  insert into public.merchant_stock_transfers
    (merchant_id, to_merchant_id, client_id, status, note, sent_at)
  values
    (p_merchant_id, p_to_merchant_id, p_operation_id::text, 'sent', p_note, now())
  returning * into v_transfer;

  -- ALIAS `item` OBLIGATOIRE : sans lui la colonne produite s'appelle
  -- `jsonb_array_elements` et `(item ->> …)` plante (cf. fix vente
  -- 20260919110000).
  for v_item in
    select * from jsonb_array_elements(p_items) as item
    order by (item ->> 'productId') nulls last, (item ->> 'productId')
  loop
    v_idx := v_idx + 1;
    v_product_id := nullif(trim(v_item ->> 'productId'), '');
    v_quantity := coalesce(
      nullif(v_item ->> 'quantityBase', '')::numeric,
      (v_item ->> 'quantity')::numeric);

    if v_product_id is null then
      raise exception using errcode = '22023',
        message = 'Chaque article doit référencer un produit';
    end if;
    if v_quantity is null or v_quantity <= 0 then
      raise exception using errcode = 'P0001',
        message = 'INVALID_QUANTITY',
        detail = jsonb_build_object('index', v_idx, 'requested', v_item ->> 'quantity')::text;
    end if;

    select * into v_product from public.legacy_products
      where id = v_product_id for update;
    if not found then
      raise exception using errcode = 'P0001',
        message = 'PRODUCT_NOT_FOUND',
        detail = jsonb_build_object('product_id', v_product_id)::text;
    end if;

    -- Sortie de stock : balance connue OBLIGATOIRE (même règle que les
    -- mouvements de sortie — on n'envoie pas un stock inconnu).
    select * into v_balance from public.merchant_stock_balances
      where merchant_id = p_merchant_id and product_id = v_product_id
      for update;
    if not found or v_balance.stock_precision = 'UNKNOWN' then
      raise exception using errcode = 'P0001',
        message = 'UNKNOWN_STOCK',
        detail = jsonb_build_object('product_id', v_product_id,
          'product', v_product.name)::text;
    end if;
    if v_quantity > v_balance.quantity_base then
      select u.unit_code into v_unit from public.merchant_product_units u
        where u.merchant_id = p_merchant_id and u.product_id = v_product_id
          and u.is_base limit 1;
      raise exception using errcode = 'P0001',
        message = 'INSUFFICIENT_STOCK',
        detail = jsonb_build_object(
          'available', v_balance.quantity_base,
          'requested', v_quantity,
          'unit', v_unit,
          'product', v_product.name,
          'product_id', v_product_id)::text;
    end if;

    -- Mouvement TRANSFER_OUT (−qty, signe D4) — operation_id par produit.
    insert into public.merchant_stock_movements
      (merchant_id, product_id, movement_type, quantity_base,
       quantity_commercial, unit_code, reference_type, reference_id,
       operation_id, device_id, created_by)
    values
      (p_merchant_id, v_product_id, 'TRANSFER_OUT', -v_quantity,
       nullif(trim(v_item ->> 'quantityCommercial'), '')::numeric,
       nullif(trim(v_item ->> 'unitCode'), ''),
       'transfer', v_transfer.id,
       md5(p_operation_id::text || ':' || v_product_id)::uuid,
       p_device_id, p_merchant_id);

    update public.merchant_stock_balances
      set quantity_base = quantity_base - v_quantity, last_movement_at = now()
      where merchant_id = p_merchant_id and product_id = v_product_id;

    -- Double écriture D3.
    update public.legacy_products
      set stock_qty = greatest(0, stock_qty - round(v_quantity)::int)
      where id = v_product_id;

    insert into public.merchant_stock_transfer_items
      (transfer_id, product_id, product_name, quantity_base, unit_code)
    values
      (v_transfer.id, v_product_id, v_product.name, v_quantity,
       nullif(trim(v_item ->> 'unitCode'), ''));
    v_items := v_items || (to_jsonb(v_item)
      || jsonb_build_object('productName', v_product.name));
  end loop;

  return jsonb_build_object('created', true, 'transfer', to_jsonb(v_transfer),
    'items', v_items);
end;
$function$

-- Durcissement SEC-813 (défense en profondeur) : réservées au service_role.
revoke execute on function public.merchant_transfer_out from anon, authenticated;

