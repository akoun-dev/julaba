-- Marketplace hardening: explicit buyer receipt + payment authorization.
alter table public.marketplace_orders
  add column if not exists buyer_received_at timestamptz;

create index if not exists marketplace_orders_buyer_received_idx
  on public.marketplace_orders(buyer_merchant_id, buyer_received_at);

create or replace function public.marketplace_confirm_receipt(
  p_order_id uuid,
  p_buyer_merchant_id text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_order public.marketplace_orders%rowtype;
begin
  select * into v_order
  from public.marketplace_orders
  where id=p_order_id
    and buyer_merchant_id=p_buyer_merchant_id
  for update;

  if not found then
    raise exception using errcode='P0001', message='ORDER_NOT_FOUND';
  end if;

  if v_order.status <> 'delivered' then
    raise exception using errcode='P0001', message='ORDER_NOT_DELIVERED';
  end if;

  if v_order.buyer_received_at is not null then
    return jsonb_build_object('confirmed',false,'order',to_jsonb(v_order));
  end if;

  update public.marketplace_orders
  set buyer_received_at=now(), updated_at=now()
  where id=p_order_id
  returning * into v_order;

  insert into public.marketplace_order_events
    (order_id,event_type,actor_type,actor_id,note)
  values
    (p_order_id,'buyer_received','buyer',p_buyer_merchant_id,'Réception confirmée par le marchand');

  return jsonb_build_object('confirmed',true,'order',to_jsonb(v_order));
end;
$$;

revoke all on function public.marketplace_confirm_receipt(uuid,text) from public, anon, authenticated;
grant execute on function public.marketplace_confirm_receipt(uuid,text) to service_role;
