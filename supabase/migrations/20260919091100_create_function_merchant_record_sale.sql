-- Migration: fonction merchant_record_sale (STK-803)
-- La transaction de vente (§35) — la garantie serveur de la règle absolue
-- « IMPOSSIBLE DE VENDRE SANS STOCK » (§3) :
--   1. idempotence : (merchant_id, operation_id) déjà traité → vente
--      existante retournée, rien ne se rejoue ;
--   2. validation du payload (articles, quantités, montants) ;
--   3. verrous : SELECT … FOR UPDATE sur produit + balance, items triés par
--      product_id (anti-deadlock) ;
--   4. vérification : requested > available → REFUS INSUFFICIENT_STOCK avec
--      payload {available, requested, unit, product} pour que Tata réponde
--      intelligemment (§36) — la vente EST refusée, jamais écrêtée ;
--   5. INSERT legacy_sales + legacy_sale_items (total recalculé serveur,
--      contrat actuel préservé) ;
--   6. INSERT mouvement SALE (−qty) + mise à jour balance + double écriture
--      legacy_products.stock_qty (D3, compat écrans actuels) ;
--   7. COMMIT — tout ou rien, tout dans une seule transaction.
--
-- Produit SANS balance ou balance UNKNOWN (§23, D7) : comportement actuel
-- conservé — vente encaissée SANS mouvement stock, stock legacy écrêté à 0.
--
-- Codes métier (§36) : message = code, details = JSON payload.
--   INSUFFICIENT_STOCK {available, requested, unit, product, product_id}
--   PRODUCT_NOT_FOUND {product_id} · PRODUCT_INACTIVE {product_id, product}
--   INVALID_QUANTITY {index, requested}
--
-- Sécurité : security definer, exécution réservée au service_role (le
-- backend authentifie le marchand via requireDeviceOwner avant l'appel).

create or replace function public.merchant_record_sale(
  p_merchant_id     text,
  p_operation_id    uuid,
  p_device_id       text default null,
  p_items           jsonb,
  p_amount_received bigint default 0,
  p_is_voice_sale   boolean default false,
  p_voice_transcript text default null,
  p_note            text default null,
  p_session_id      text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sale        public.legacy_sales%rowtype;
  v_product     public.legacy_products%rowtype;
  v_balance     public.merchant_stock_balances%rowtype;
  v_unit        text;
  v_item        jsonb;
  v_product_id  text;
  v_name        text;
  v_quantity    numeric(14, 3);
  v_unit_price  numeric(14, 2);
  v_q_base      numeric(14, 3);
  v_subtotal    bigint;
  v_total       bigint := 0;
  v_available_before numeric(14, 3);
  v_available_after  numeric(14, 3);
  v_items       jsonb := '[]'::jsonb;
  v_stock       jsonb := '[]'::jsonb;
  v_idx         int := 0;
  v_tracked     boolean;
begin
  if p_merchant_id is null or not exists
    (select 1 from public.merchants where id = p_merchant_id) then
    raise exception using errcode = '22023', message = 'Marchand introuvable';
  end if;
  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'operation_id obligatoire';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'Une vente doit contenir au moins un article';
  end if;
  if p_amount_received < 0 then
    raise exception using errcode = '22023', message = 'Montant reçu invalide';
  end if;

  -- 1. Idempotence : rejeu offline → la vente existante, sans rien refaire.
  select * into v_sale from public.legacy_sales
    where client_id = p_operation_id::text;
  if found then
    return jsonb_build_object('created', false, 'sale', to_jsonb(v_sale),
      'items',
        coalesce((select jsonb_agg(to_jsonb(i)) from public.legacy_sale_items i
                  where i.sale_id = v_sale.id), '[]'::jsonb),
      'stock', '[]'::jsonb);
  end if;

  -- 2. Verrous + vérifications, articles triés par product_id (anti-deadlock).
  for v_item in
    select * from jsonb_array_elements(p_items)
    order by (item ->> 'productId') nulls last, (item ->> 'productId')
  loop
    v_idx := v_idx + 1;
    v_product_id := nullif(trim(v_item ->> 'productId'), '');
    v_name := nullif(trim(v_item ->> 'productName'), '');
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_price := (v_item ->> 'unitPrice')::numeric;
    v_q_base := coalesce(nullif(v_item ->> 'quantityBase', '')::numeric, v_quantity);

    if v_name is null then
      raise exception using errcode = '22023',
        message = 'Chaque article doit avoir un nom de produit';
    end if;
    if v_quantity is null or v_quantity <= 0
      or v_q_base is null or v_q_base <= 0 then
      raise exception using errcode = 'P0001',
        message = 'INVALID_QUANTITY',
        detail = jsonb_build_object('index', v_idx, 'requested', v_item ->> 'quantity')::text;
    end if;
    if v_unit_price is null or v_unit_price < 0 then
      raise exception using errcode = 'P0001',
        message = 'INVALID_QUANTITY',
        detail = jsonb_build_object('index', v_idx, 'field', 'unitPrice')::text;
    end if;
    if v_product_id is null then
      continue; -- ligne libre sans produit : aucun suivi
    end if;

    -- 3. Verrou produit (sérialise aussi les produits non suivis).
    select * into v_product from public.legacy_products
      where id = v_product_id for update;
    if not found then
      raise exception using errcode = 'P0001',
        message = 'PRODUCT_NOT_FOUND',
        detail = jsonb_build_object('product_id', v_product_id)::text;
    end if;
    if not v_product.is_active then
      raise exception using errcode = 'P0001',
        message = 'PRODUCT_INACTIVE',
        detail = jsonb_build_object('product_id', v_product_id,
          'product', v_product.name)::text;
    end if;

    -- 4. Stock suivi (balance EXACT/ESTIMATED) : refus strict §3/§18/§19.
    select * into v_balance from public.merchant_stock_balances
      where merchant_id = p_merchant_id and product_id = v_product_id
      for update;
    v_tracked := found and v_balance.stock_precision <> 'UNKNOWN';
    if v_tracked and v_q_base > v_balance.quantity_base then
      select u.unit_code into v_unit from public.merchant_product_units u
        where u.merchant_id = p_merchant_id and u.product_id = v_product_id
          and u.is_base limit 1;
      raise exception using errcode = 'P0001',
        message = 'INSUFFICIENT_STOCK',
        detail = jsonb_build_object(
          'available', v_balance.quantity_base,
          'requested', v_q_base,
          'unit', v_unit,
          'product', v_product.name,
          'product_id', v_product_id)::text;
    end if;
  end loop;

  -- 5. Vente (contrat actuel préservé : sous-totaux recalculés serveur).
  insert into public.legacy_sales
    (merchant_id, session_id, client_id, total_amount, amount_received,
     change_amount, is_voice_sale, voice_transcript, note)
  values
    (p_merchant_id, p_session_id, p_operation_id::text, 0, p_amount_received,
     0, p_is_voice_sale, p_voice_transcript, p_note)
  returning * into v_sale;

  v_idx := 0;
  for v_item in
    select * from jsonb_array_elements(p_items)
    order by (item ->> 'productId') nulls last, (item ->> 'productId')
  loop
    v_idx := v_idx + 1;
    v_product_id := nullif(trim(v_item ->> 'productId'), '');
    v_name := nullif(trim(v_item ->> 'productName'), '');
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_price := (v_item ->> 'unitPrice')::numeric;
    v_q_base := coalesce(nullif(v_item ->> 'quantityBase', '')::numeric, v_quantity);
    v_subtotal := round(v_quantity * v_unit_price)::bigint;
    v_total := v_total + v_subtotal;

    insert into public.legacy_sale_items
      (sale_id, product_id, product_name, quantity, unit_price, subtotal)
    values
      (v_sale.id, v_product_id, v_name,
       round(v_quantity)::int, round(v_unit_price)::int, v_subtotal);
    v_items := v_items || to_jsonb(v_item) || jsonb_build_object('subtotal', v_subtotal);

    if v_product_id is null then
      continue;
    end if;

    select * into v_balance from public.merchant_stock_balances
      where merchant_id = p_merchant_id and product_id = v_product_id
      for update;
    v_tracked := found and v_balance.stock_precision <> 'UNKNOWN';

    if v_tracked then
      v_available_before := v_balance.quantity_base;
      -- 6. Mouvement (source de vérité) + balance, dans la même transaction.
      insert into public.merchant_stock_movements
        (merchant_id, product_id, movement_type, quantity_base,
         quantity_commercial, unit_code, reference_type, reference_id,
         operation_id, device_id, created_by)
      values
        (p_merchant_id, v_product_id, 'SALE', -v_q_base,
         v_quantity, v_item ->> 'unitCode', 'sale', v_sale.id,
         p_operation_id, p_device_id, p_merchant_id);
      update public.merchant_stock_balances
        set quantity_base = quantity_base - v_q_base, last_movement_at = now()
        where merchant_id = p_merchant_id and product_id = v_product_id
        returning quantity_base into v_available_after;
      -- Double écriture D3 : compatibilité des écrans actuels.
      update public.legacy_products
        set stock_qty = greatest(0, stock_qty - round(v_q_base)::int)
        where id = v_product_id;
      v_stock := v_stock || jsonb_build_object(
        'product_id', v_product_id, 'product', v_name,
        'available_before', v_available_before,
        'available_after', v_available_after);
    else
      -- Produit non suivi (§23 D7) : comportement actuel — écrêtage à 0.
      update public.legacy_products
        set stock_qty = greatest(0, stock_qty - round(v_q_base)::int)
        where id = v_product_id;
      v_stock := v_stock || jsonb_build_object(
        'product_id', v_product_id, 'product', v_name,
        'available_before', null, 'available_after', null);
    end if;
  end loop;

  update public.legacy_sales
    set total_amount = v_total,
        change_amount = greatest(0, p_amount_received - v_total)
    where id = v_sale.id
    returning * into v_sale;

  -- 7. COMMIT (fin de transaction côté appelant) — tout ou rien.
  return jsonb_build_object('created', true, 'sale', to_jsonb(v_sale),
    'items', v_items, 'stock', v_stock);
end;
$$;

revoke all on function public.merchant_record_sale(text, uuid, text, jsonb, bigint, boolean, text, text, text) from public;
grant execute on function public.merchant_record_sale(text, uuid, text, jsonb, bigint, boolean, text, text, text) to service_role;
