-- MODE-1004 / AUDIT-012 (audit externe Manus, P1-1/P1-2/P1-3) — 2026-09-25
-- Transition vendeur marketplace + initiation de paiement deviennent des RPC
-- TRANSACTIONNELLES : verrou FOR UPDATE sur la commande, événement écrit dans
-- la MÊME transaction, toute erreur d'événement annule la mutation.
--
-- AVANT (constat A12-P1-1/P1-2) : la route seller-orders lisait le statut,
-- vérifiait la transition EN MÉMOIRE, mettait à jour par id seul (deux PATCH
-- concurrents pouvaient valider deux fois la même transition) puis insérait
-- l'événement séparément en IGNORANT son erreur ; le paiement insérait
-- marketplace_payments puis mettait à jour la commande séparément (un
-- `pending` orphelin possible en cas de panne intermédiaire).
--
-- L'idempotence de marketplace_create_order est durcie : une violation
-- unique concurrente (23505 sur client_id) relit la commande existante au
-- lieu de renvoyer une erreur générique — le client retrouve toujours une
-- réponse déterministe (critère externe « retry après perte de réponse »).

-- ══ 1. Transition vendeur atomique ══════════════════════════════════════
create or replace function public.marketplace_seller_transition(
  p_order_id uuid,
  p_merchant_id text,
  p_target text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order public.marketplace_orders%rowtype;
  v_seller public.marketplace_seller_profiles%rowtype;
  v_seller_count int;
  v_next_status text;
  v_confirmed_at timestamptz;
  v_delivered_at timestamptz;
begin
  -- Le vendeur doit exister et être actif (miroir du contrôle route).
  select * into v_seller
    from public.marketplace_seller_profiles
    where merchant_id = p_merchant_id;
  if not found or v_seller.status <> 'active' then
    raise exception using errcode='P0001', message='SELLER_UNAVAILABLE';
  end if;

  -- Verrou de commande : sérialise toute transition concurrente.
  select * into v_order from public.marketplace_orders where id = p_order_id for update;
  if not found then
    raise exception using errcode='P0001', message='ORDER_NOT_FOUND';
  end if;

  -- Le vendeur doit posséder TOUS les articles (commande multi-vendeurs
  -- interdite, miroir du contrôle route : traitement séparé non autorisé).
  select count(distinct oi.seller_id) into v_seller_count
    from public.marketplace_order_items oi
    where oi.order_id = p_order_id;
  if v_seller_count is null or v_seller_count = 0 then
    raise exception using errcode='P0001', message='ORDER_NOT_FOUND';
  end if;
  if v_seller_count > 1 or not exists (
    select 1 from public.marketplace_order_items oi
    where oi.order_id = p_order_id and oi.seller_id = v_seller.id
  ) then
    raise exception using errcode='P0001', message='MULTI_SELLER_ORDER';
  end if;

  -- Grille de transitions (miroir exact de la route, verrouillée côté SQL).
  v_next_status := case v_order.status
    when 'pending'   then case when p_target in ('confirmed','cancelled','rejected') then p_target end
    when 'confirmed' then case when p_target in ('preparing','cancelled') then p_target end
    when 'preparing' then case when p_target in ('ready','cancelled') then p_target end
    when 'ready'     then case when p_target = 'shipped' then p_target end
    when 'shipped'   then case when p_target = 'delivered' then p_target end
  end;
  if v_next_status is null then
    raise exception using errcode='P0001', message='INVALID_TRANSITION',
      detail=jsonb_build_object('from',v_order.status,'target',p_target)::text;
  end if;

  v_confirmed_at := case when v_next_status = 'confirmed' then now() end;
  v_delivered_at := case when v_next_status = 'delivered' then now() end;

  update public.marketplace_orders
    set status = v_next_status,
        confirmed_at = coalesce(v_confirmed_at, confirmed_at),
        delivered_at = coalesce(v_delivered_at, delivered_at),
        updated_at = now()
    where id = p_order_id;

  -- L'événement est écrit dans la MÊME transaction : si cette insert échoue,
  -- TOUTE la transition est annulée (critère d'acceptation externe).
  insert into public.marketplace_order_events
    (order_id, event_type, from_status, to_status, actor_type, actor_id)
  values (p_order_id, 'status_changed', v_order.status, v_next_status, 'seller', p_merchant_id);

  select * into v_order from public.marketplace_orders where id = p_order_id;
  return jsonb_build_object('order', to_jsonb(v_order));
end;
$$;

-- ══ 2. Paiement atomique ════════════════════════════════════════════════
create or replace function public.marketplace_pay_order(
  p_order_id uuid,
  p_merchant_id text,
  p_method text,
  p_provider text default null,
  p_provider_reference text default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order public.marketplace_orders%rowtype;
  v_pending public.marketplace_payments%rowtype;
  v_payment public.marketplace_payments%rowtype;
begin
  if p_method not in ('cash','mobile_money','card','wallet','credit','cash_on_delivery','other') then
    raise exception using errcode='P0001', message='INVALID_PAYMENT_METHOD';
  end if;

  -- Verrou de commande : sérialise deux initiations concurrentes.
  select * into v_order from public.marketplace_orders where id = p_order_id for update;
  if not found then
    raise exception using errcode='P0001', message='ORDER_NOT_FOUND';
  end if;
  if v_order.buyer_merchant_id <> p_merchant_id then
    raise exception using errcode='P0001', message='NOT_YOUR_ORDER';
  end if;
  if v_order.status in ('cancelled','rejected') then
    raise exception using errcode='P0001', message='ORDER_NOT_PAYABLE';
  end if;

  -- Vérification du montant CÔTÉ SQL : le paiement porte exactement le
  -- total de la commande (aucun montant négocié côté client).
  -- Un seul paiement actif par commande : le contrôle existant de la route
  -- devient un verrou réel (deux concurrents ne passent plus tous les deux).
  select * into v_pending
    from public.marketplace_payments
    where order_id = p_order_id and status in ('pending','authorized')
    limit 1;
  if found then
    raise exception using errcode='P0001', message='PAYMENT_ALREADY_PENDING';
  end if;

  insert into public.marketplace_payments
    (order_id, provider, provider_reference, amount_cfa, currency, status, metadata)
  values
    (p_order_id, p_provider, p_provider_reference, v_order.total_cfa, 'XOF', 'pending', p_metadata)
  returning * into v_payment;

  update public.marketplace_orders
    set payment_method = p_method, updated_at = now()
    where id = p_order_id;

  -- Événement dans la même transaction : une erreur annule le paiement.
  insert into public.marketplace_order_events
    (order_id, event_type, actor_type, actor_id, metadata)
  values (p_order_id, 'payment_initiated', 'buyer', p_merchant_id,
          jsonb_build_object('method', p_method));

  return jsonb_build_object('payment', to_jsonb(v_payment));
end;
$$;

-- ══ 3. Idempotence de création : 23505 concurrent → relecture ═══════════
-- Redéfinition verbatim de marketplace_create_order (20260923130000) avec un
-- handler unique_violation de NIVEAU FONCTION : deux POST concurrents avec
-- le même client_id obtiennent tous les deux la commande existante (l'un
-- created=true, l'autre created=false) au lieu d'un 23505 générique.
create or replace function public.marketplace_create_order(
  p_buyer_merchant_id text,
  p_items jsonb,
  p_client_id uuid default null,
  p_delivery_fee_cfa bigint default 0,
  p_discount_cfa bigint default 0,
  p_payment_method text default null,
  p_delivery_mode text default 'pickup',
  p_delivery_address text default null,
  p_delivery_zone text default null,
  p_buyer_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_listing public.marketplace_listings%rowtype;
  v_seller public.marketplace_seller_profiles%rowtype;
  v_product public.legacy_products%rowtype;
  v_balance public.merchant_stock_balances%rowtype;
  v_order public.marketplace_orders%rowtype;
  v_order_item public.marketplace_order_items%rowtype;
  v_qty numeric(14,3);
  v_reserved numeric(14,3);
  v_available numeric(14,3);
  v_subtotal bigint := 0;
  v_idx int := 0;
begin
  if not exists (select 1 from public.merchants where id = p_buyer_merchant_id) then
    raise exception using errcode='22023', message='BUYER_NOT_FOUND';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception using errcode='22023', message='ORDER_EMPTY';
  end if;
  if p_delivery_fee_cfa < 0 or p_discount_cfa < 0 then
    raise exception using errcode='22023', message='INVALID_TOTAL';
  end if;
  if p_client_id is null then
    raise exception using errcode='22023', message='CLIENT_ID_REQUIRED';
  end if;

  if p_client_id is not null then
    select * into v_order from public.marketplace_orders where client_id=p_client_id;
    if found then return jsonb_build_object('created',false,'order',to_jsonb(v_order)); end if;
  end if;

  -- Verrouille toutes les balances dans l'ordre product_id pour éviter les deadlocks.
  for v_item in
    select value from jsonb_array_elements(p_items)
    order by value->>'listingId'
  loop
    select * into v_listing
      from public.marketplace_listings
      where id=(v_item->>'listingId')::uuid
        and status='published'
      for update;
    if not found then
      raise exception using errcode='P0001', message='LISTING_UNAVAILABLE',
        detail=jsonb_build_object('listing_id',v_item->>'listingId')::text;
    end if;

    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0
       or v_qty < v_listing.min_order_quantity
       or (v_listing.max_order_quantity is not null and v_qty > v_listing.max_order_quantity) then
      raise exception using errcode='P0001', message='INVALID_QUANTITY',
        detail=jsonb_build_object('listing_id',v_listing.id,'requested',v_qty)::text;
    end if;

    select * into v_seller from public.marketplace_seller_profiles where id=v_listing.seller_id;
    if v_seller.status <> 'active' then
      raise exception using errcode='SELLER_UNAVAILABLE';
    end if;

    select * into v_product from public.legacy_products where id=v_listing.product_id for update;
    if not found or not v_product.is_active then
      raise exception using errcode='P0001', message='PRODUCT_UNAVAILABLE';
    end if;

    select * into v_balance from public.merchant_stock_balances
      where merchant_id=v_seller.merchant_id and product_id=v_listing.product_id
      for update;
    if not found or v_balance.stock_precision='UNKNOWN' then
      raise exception using errcode='P0001', message='STOCK_UNKNOWN',
        detail=jsonb_build_object('product',v_product.name)::text;
    end if;

    v_reserved := public.marketplace_reserved_quantity(v_seller.merchant_id,v_listing.product_id);
    v_available := v_balance.quantity_base - v_reserved;
    if v_qty > v_available then
      raise exception using errcode='P0001', message='INSUFFICIENT_MARKETPLACE_STOCK',
        detail=jsonb_build_object('available',v_available,'requested',v_qty,'product',v_product.name,'product_id',v_product.id)::text;
    end if;
    v_subtotal := v_subtotal + round(v_qty * v_listing.price_unit)::bigint;
  end loop;

  insert into public.marketplace_orders
    (client_id,buyer_merchant_id,subtotal_cfa,delivery_fee_cfa,discount_cfa,total_cfa,
     payment_method,delivery_status,delivery_address,delivery_zone,buyer_note)
  values
    (p_client_id,p_buyer_merchant_id,v_subtotal,p_delivery_fee_cfa,p_discount_cfa,
     greatest(0,v_subtotal+p_delivery_fee_cfa-p_discount_cfa),
     p_payment_method,case when p_delivery_mode='pickup' then 'pickup' else 'pending' end,
     p_delivery_address,p_delivery_zone,p_buyer_note)
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_listing from public.marketplace_listings where id=(v_item->>'listingId')::uuid;
    select * into v_seller from public.marketplace_seller_profiles where id=v_listing.seller_id;
    select * into v_product from public.legacy_products where id=v_listing.product_id;
    v_qty := (v_item->>'quantity')::numeric;

    insert into public.marketplace_order_items
      (order_id,listing_id,seller_id,product_id,product_name,quantity,unit_price_cfa,subtotal_cfa)
    values
      (v_order.id,v_listing.id,v_listing.seller_id,v_listing.product_id,v_product.name,v_qty,
       v_listing.price_unit,round(v_qty*v_listing.price_unit)::bigint)
    returning * into v_order_item;

    insert into public.marketplace_inventory_reservations
      (order_id,order_item_id,seller_merchant_id,product_id,quantity_base)
    values
      (v_order.id,v_order_item.id,v_seller.merchant_id,v_listing.product_id,v_qty);

    insert into public.marketplace_order_events
      (order_id,event_type,to_status,actor_type,actor_id)
    values (v_order.id,'order_created','pending','buyer',p_buyer_merchant_id);
  end loop;

  insert into public.marketplace_deliveries
    (order_id,mode,status,zone,address)
  values (v_order.id,p_delivery_mode,
          case when p_delivery_mode='pickup' then 'pending' else 'pending' end,
          p_delivery_zone,p_delivery_address);

  return jsonb_build_object('created',true,'order',to_jsonb(v_order));
exception
  -- AUDIT-012 P1-3 : course entre la relecture et l'insert sous concurrence.
  -- Le 23505 sur client_id relit la commande gagnante et renvoie la réponse
  -- idempotente (created=false) — jamais d'erreur générique au client.
  when unique_violation then
    if p_client_id is not null then
      select * into v_order from public.marketplace_orders where client_id=p_client_id;
      if found then
        return jsonb_build_object('created',false,'order',to_jsonb(v_order));
      end if;
    end if;
    raise;
end;
$$;

-- ══ 4. RBAC (ADR-001) : revoke public + grant service_role ══════════════
revoke all on function public.marketplace_seller_transition(uuid,text,text) from public, anon, authenticated;
grant execute on function public.marketplace_seller_transition(uuid,text,text) to service_role;
revoke all on function public.marketplace_pay_order(uuid,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.marketplace_pay_order(uuid,text,text,text,text,jsonb) to service_role;
-- marketplace_create_order : signature inchangée — les revokes existants de
-- 20260923130000 survivent au create or replace (privileges par Oid de
-- fonction préservés) ; on les réapplique par hygiène.
revoke all on function public.marketplace_create_order(text,jsonb,uuid,bigint,bigint,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.marketplace_create_order(text,jsonb,uuid,bigint,bigint,text,text,text,text,text) to service_role;
