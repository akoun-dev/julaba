-- Fix marketplace fulfillment: group order items by seller so one
-- merchant_record_sale call atomically processes all items of that seller.
create or replace function public.marketplace_fulfill_order(
  p_order_id uuid, p_actor_type text default 'system', p_actor_id text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_order public.marketplace_orders%rowtype;
  v_seller record;
  v_item record;
  v_items jsonb;
  v_sale jsonb;
  v_op uuid;
begin
  select * into v_order from public.marketplace_orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0001',message='ORDER_NOT_FOUND'; end if;
  if v_order.status in ('cancelled','rejected','delivered') then
    raise exception using errcode='P0001',message='ORDER_NOT_FULFILLABLE'; end if;

  for v_seller in
    select distinct sp.merchant_id
    from public.marketplace_order_items oi
    join public.marketplace_seller_profiles sp on sp.id=oi.seller_id
    where oi.order_id=p_order_id
    order by sp.merchant_id
  loop
    v_items := '[]'::jsonb;
    for v_item in
      select oi.*
      from public.marketplace_order_items oi
      join public.marketplace_seller_profiles sp on sp.id=oi.seller_id
      where oi.order_id=p_order_id and sp.merchant_id=v_seller.merchant_id
      order by oi.product_id
    loop
      v_items := v_items || jsonb_build_object(
        'productId',v_item.product_id,'productName',v_item.product_name,
        'quantity',v_item.quantity,'quantityBase',v_item.quantity,
        'unitPrice',v_item.unit_price_cfa,'unitCode','unite'
      );
    end loop;

    v_op := md5(p_order_id::text || ':' || v_seller.merchant_id)::uuid;
    select public.merchant_record_sale(
      v_seller.merchant_id,v_op,null,v_items,0,false,null,
      'Marketplace order '||v_order.order_number,null
    ) into v_sale;

    update public.marketplace_inventory_reservations r
      set status='consumed',released_at=now()
      from public.marketplace_order_items oi
      where r.order_item_id=oi.id
        and oi.order_id=p_order_id
        and r.status='reserved'
        and r.seller_merchant_id=v_seller.merchant_id;
  end loop;

  update public.marketplace_orders
    set status='delivered',delivered_at=now(),updated_at=now()
    where id=p_order_id;

  update public.marketplace_deliveries
    set status='delivered',delivered_at=now(),updated_at=now()
    where order_id=p_order_id;

  insert into public.marketplace_order_events
    (order_id,event_type,from_status,to_status,actor_type,actor_id)
  values (p_order_id,'order_delivered',v_order.status,'delivered',p_actor_type,p_actor_id);

  return jsonb_build_object('fulfilled',true,'order_id',p_order_id);
end;
$$;

revoke all on function public.marketplace_fulfill_order(uuid,text,text) from public, anon, authenticated;
grant execute on function public.marketplace_fulfill_order(uuid,text,text) to service_role;
