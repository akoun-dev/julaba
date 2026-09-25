-- MODE-1004 / AUDIT-012 — RECONSTRUCTION de la migration
-- 20260924130000_marketplace_atomic_mutations : appliquée sur la base
-- hébergée par le porteur le 24/09 mais JAMAIS committée (drift détecté par
-- comparaison supabase_migrations.schema_migrations <-> dépôt — « inconnue
-- n°1 » de l'audit externe). Définitions extraites de la production via
-- pg_get_functiondef() : ce fichier reproduit EXACTEMENT l'état déployé.
-- Contenu : transitions vendeur + initiation de paiement ATOMIQUES (verrou
-- FOR UPDATE, événement dans la même transaction, idempotence paiement par
-- client_id + empreinte de payload).

-- == 1. Transition vendeur atomique (déployée en prod 24/09) ==
CREATE OR REPLACE FUNCTION public.marketplace_seller_transition(p_order_id uuid, p_merchant_id text, p_target_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_order public.marketplace_orders%rowtype;
  v_seller_count integer;
  v_seller_owned boolean;
begin
  select * into v_order
  from public.marketplace_orders
  where id = p_order_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND'; end if;

  select count(distinct oi.seller_id)::integer, bool_or(sp.merchant_id = p_merchant_id)
    into v_seller_count, v_seller_owned
  from public.marketplace_order_items oi
  join public.marketplace_seller_profiles sp on sp.id = oi.seller_id
  where oi.order_id = p_order_id;
  if v_seller_count = 0 or not coalesce(v_seller_owned, false) then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_OWNED';
  end if;
  if v_seller_count > 1 then
    raise exception using errcode = 'P0001', message = 'MULTI_SELLER_ORDER';
  end if;

  if not (
    (v_order.status = 'pending' and p_target_status in ('confirmed','cancelled','rejected')) or
    (v_order.status = 'confirmed' and p_target_status in ('preparing','cancelled')) or
    (v_order.status = 'preparing' and p_target_status in ('ready','cancelled')) or
    (v_order.status = 'ready' and p_target_status = 'shipped') or
    (v_order.status = 'shipped' and p_target_status = 'delivered')
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_ORDER_TRANSITION',
      detail = jsonb_build_object('from', v_order.status, 'to', p_target_status)::text;
  end if;

  update public.marketplace_orders
    set status = p_target_status,
        confirmed_at = case when p_target_status = 'confirmed' then now() else confirmed_at end,
        delivered_at = case when p_target_status = 'delivered' then now() else delivered_at end,
        updated_at = now()
    where id = p_order_id;

  insert into public.marketplace_order_events
    (order_id, event_type, from_status, to_status, actor_type, actor_id)
  values (p_order_id, 'status_changed', v_order.status, p_target_status, 'seller', p_merchant_id);

  select * into v_order from public.marketplace_orders where id = p_order_id;
  return jsonb_build_object('order', to_jsonb(v_order));
end;
$$


-- == 2. Initiation de paiement atomique + idempotente (prod 24/09) ==
CREATE OR REPLACE FUNCTION public.marketplace_initiate_payment(p_order_id uuid, p_buyer_merchant_id text, p_client_id uuid, p_method text, p_provider text DEFAULT NULL::text, p_provider_reference text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_order public.marketplace_orders%rowtype;
  v_payment public.marketplace_payments%rowtype;
  v_fingerprint text;
begin
  if p_client_id is null then raise exception using errcode = '22023', message = 'PAYMENT_CLIENT_ID_REQUIRED'; end if;
  v_fingerprint := md5(concat_ws('|', p_order_id, p_method, p_provider,
    p_provider_reference, coalesce(p_metadata, '{}'::jsonb)::text));
  select * into v_order from public.marketplace_orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND'; end if;
  if v_order.buyer_merchant_id <> p_buyer_merchant_id then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_OWNED';
  end if;

  select * into v_payment from public.marketplace_payments
  where order_id = p_order_id and client_id = p_client_id;
  if found then
    if v_payment.client_payload_fingerprint is not null
       and v_payment.client_payload_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_PAYLOAD_MISMATCH';
    end if;
    return jsonb_build_object('payment', to_jsonb(v_payment), 'created', false);
  end if;

  if exists (
    select 1 from public.marketplace_payments
    where order_id = p_order_id and status in ('pending','authorized')
  ) then
    raise exception using errcode = 'P0001', message = 'PAYMENT_ALREADY_PENDING';
  end if;

  insert into public.marketplace_payments
    (order_id, client_id, client_payload_fingerprint, provider, provider_reference, amount_cfa, currency, status, metadata)
  values (p_order_id, p_client_id, v_fingerprint, p_provider, p_provider_reference, v_order.total_cfa, 'XOF', 'pending', coalesce(p_metadata, '{}'::jsonb))
  returning * into v_payment;

  update public.marketplace_orders
    set payment_method = p_method, updated_at = now()
    where id = p_order_id;
  insert into public.marketplace_order_events
    (order_id, event_type, actor_type, actor_id, metadata)
  values (p_order_id, 'payment_initiated', 'buyer', p_buyer_merchant_id, jsonb_build_object('method', p_method));

  return jsonb_build_object('payment', to_jsonb(v_payment), 'created', true);
end;
$$


-- == 3. RBAC ADR-001 ==
revoke all on function public.marketplace_seller_transition(uuid,text,text) from public, anon, authenticated;
grant execute on function public.marketplace_seller_transition(uuid,text,text) to service_role;
revoke all on function public.marketplace_initiate_payment(uuid,text,uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.marketplace_initiate_payment(uuid,text,uuid,text,text,text,jsonb) to service_role;
