-- Marketplace hardening: one creation event per order, not one per line item.
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
begin
  if not exists (select 1 from public.merchants where id=p_buyer_merchant_id) then
    raise exception using errcode='22023',message='BUYER_NOT_FOUND';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception using errcode='22023',message='ORDER_EMPTY';
  end if;
  if p_delivery_fee_cfa<0 or p_discount_cfa<0 then
    raise exception using errcode='22023',message='INVALID_TOTAL';
  end if;

  if p_client_id is not null then
    select * into v_order from public.marketplace_orders where client_id=p_client_id;
    if found then return jsonb_build_object('created',false,'order',to_jsonb(v_order)); end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) order by value->>'listingId' loop
    select * into v_listing from public.marketplace_listings
      where id=(v_item->>'listingId')::uuid and status='published' for update;
    if not found then
      raise exception using errcode='P0001',message='LISTING_UNAVAILABLE',
        detail=jsonb_build_object('listing_id',v_item->>'listingId')::text;
    end if;
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty<=0 or v_qty<v_listing.min_order_quantity
       or (v_listing.max_order_quantity is not null and v_qty>v_listing.max_order_quantity) then
      raise exception using errcode='P0001',message='INVALID_QUANTITY',
        detail=jsonb_build_object('listing_id',v_listing.id,'requested',v_qty)::text;
    end if;

    select * into v_seller from public.marketplace_seller_profiles where id=v_listing.seller_id for update;
    if v_seller.status<>'active' then raise exception using errcode='P0001',message='SELLER_UNAVAILABLE'; end if;

    select * into v_product from public.legacy_products where id=v_listing.product_id for update;
    if not found or not v_product.is_active then raise exception using errcode='P0001',message='PRODUCT_UNAVAILABLE'; end if;

    select * into v_balance from public.merchant_stock_balances
      where merchant_id=v_seller.merchant_id and product_id=v_listing.product_id for update;
    if not found or v_balance.stock_precision='UNKNOWN' then
      raise exception using errcode='P0001',message='STOCK_UNKNOWN',
        detail=jsonb_build_object('product',v_product.name)::text;
    end if;

    v_reserved := public.marketplace_reserved_quantity(v_seller.merchant_id,v_listing.product_id);
    v_available := v_balance.quantity_base-v_reserved;
    if v_qty>v_available then
      raise exception using errcode='P0001',message='INSUFFICIENT_MARKETPLACE_STOCK',
        detail=jsonb_build_object('available',v_available,'requested',v_qty,'product',v_product.name,'product_id',v_product.id)::text;
    end if;
    v_subtotal := v_subtotal + round(v_qty*v_listing.price_unit)::bigint;
  end loop;

  insert into public.marketplace_orders
    (client_id,buyer_merchant_id,subtotal_cfa,delivery_fee_cfa,discount_cfa,total_cfa,
     payment_method,delivery_status,delivery_address,delivery_zone,buyer_note)
  values
    (p_client_id,p_buyer_merchant_id,v_subtotal,p_delivery_fee_cfa,p_discount_cfa,
     greatest(0,v_subtotal+p_delivery_fee_cfa-p_discount_cfa),p_payment_method,
     'pending',p_delivery_address,p_delivery_zone,p_buyer_note)
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
    values (v_order.id,v_order_item.id,v_seller.merchant_id,v_listing.product_id,v_qty);
  end loop;

  insert into public.marketplace_order_events
    (order_id,event_type,to_status,actor_type,actor_id)
  values (v_order.id,'order_created','pending','buyer',p_buyer_merchant_id);

  insert into public.marketplace_deliveries
    (order_id,mode,status,zone,address)
  values (v_order.id,p_delivery_mode,'pending',p_delivery_zone,p_delivery_address);

  return jsonb_build_object('created',true,'order',to_jsonb(v_order));
end;
$$;

revoke all on function public.marketplace_create_order(text,jsonb,uuid,bigint,bigint,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_create_order(text,jsonb,uuid,bigint,bigint,text,text,text,text,text) to service_role;
