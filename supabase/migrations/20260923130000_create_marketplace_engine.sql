-- Jùlaba Marketplace Engine — domaine transactionnel dédié
-- Ne pas utiliser legacy_supplier_orders pour simuler des commandes marketplace.
-- Le stock reste piloté par merchant_stock_balances + merchant_record_sale.

create table if not exists public.marketplace_seller_profiles (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null unique references public.merchants(id) on delete restrict,
  display_name text,
  description text,
  zone text,
  phone text,
  status text not null default 'pending'
    check (status in ('pending','active','suspended','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.marketplace_seller_profiles(id) on delete restrict,
  product_id text not null references public.legacy_products(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 160),
  description text,
  category text not null default 'autre',
  price_unit bigint not null check (price_unit >= 0),
  currency text not null default 'XOF' check (currency = 'XOF'),
  status text not null default 'draft'
    check (status in ('draft','pending_review','published','suspended','archived')),
  min_order_quantity numeric(14,3) not null default 1 check (min_order_quantity > 0),
  max_order_quantity numeric(14,3),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, product_id),
  check (max_order_quantity is null or max_order_quantity >= min_order_quantity)
);

create table if not exists public.marketplace_listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  image_url text not null,
  position integer not null default 0 check (position >= 0),
  alt_text text,
  created_at timestamptz not null default now(),
  unique (listing_id, position)
);

create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid unique,
  order_number text not null unique default ('JLB-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  buyer_merchant_id text not null references public.merchants(id) on delete restrict,
  subtotal_cfa bigint not null default 0 check (subtotal_cfa >= 0),
  delivery_fee_cfa bigint not null default 0 check (delivery_fee_cfa >= 0),
  discount_cfa bigint not null default 0 check (discount_cfa >= 0),
  total_cfa bigint not null default 0 check (total_cfa >= 0),
  currency text not null default 'XOF' check (currency = 'XOF'),
  status text not null default 'pending'
    check (status in ('pending','confirmed','preparing','ready','shipped','delivered','cancelled','rejected')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending','authorized','paid','failed','refunded','cash_on_delivery')),
  payment_method text
    check (payment_method is null or payment_method in ('cash','mobile_money','card','wallet','credit','cash_on_delivery','other')),
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending','assigned','picked_up','in_transit','delivered','failed','cancelled','pickup')),
  delivery_address text,
  delivery_zone text,
  buyer_note text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  seller_id uuid not null references public.marketplace_seller_profiles(id) on delete restrict,
  product_id text not null references public.legacy_products(id) on delete restrict,
  product_name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price_cfa bigint not null check (unit_price_cfa >= 0),
  subtotal_cfa bigint not null check (subtotal_cfa >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  order_item_id uuid not null references public.marketplace_order_items(id) on delete cascade,
  seller_merchant_id text not null references public.merchants(id) on delete restrict,
  product_id text not null references public.legacy_products(id) on delete restrict,
  quantity_base numeric(14,3) not null check (quantity_base > 0),
  status text not null default 'reserved'
    check (status in ('reserved','released','consumed')),
  created_at timestamptz not null default now(),
  released_at timestamptz,
  unique (order_item_id)
);

create table if not exists public.marketplace_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  provider text,
  provider_reference text,
  amount_cfa bigint not null check (amount_cfa >= 0),
  currency text not null default 'XOF' check (currency = 'XOF'),
  status text not null default 'pending'
    check (status in ('pending','authorized','paid','failed','refunded')),
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create table if not exists public.marketplace_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.marketplace_orders(id) on delete cascade,
  mode text not null default 'pickup'
    check (mode in ('pickup','delivery','courier')),
  status text not null default 'pending'
    check (status in ('pending','assigned','picked_up','in_transit','delivered','failed','cancelled')),
  zone text,
  address text,
  recipient_name text,
  recipient_phone text,
  tracking_reference text,
  courier_name text,
  notes text,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  actor_type text not null default 'system',
  actor_id text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists marketplace_listings_status_idx
  on public.marketplace_listings(status, category, updated_at desc);
create index if not exists marketplace_listings_seller_idx
  on public.marketplace_listings(seller_id, status);
create index if not exists marketplace_orders_buyer_idx
  on public.marketplace_orders(buyer_merchant_id, created_at desc);
create index if not exists marketplace_orders_status_idx
  on public.marketplace_orders(status, created_at desc);
create index if not exists marketplace_order_items_order_idx
  on public.marketplace_order_items(order_id);
create index if not exists marketplace_reservations_stock_idx
  on public.marketplace_inventory_reservations(seller_merchant_id, product_id, status);
create index if not exists marketplace_events_order_idx
  on public.marketplace_order_events(order_id, created_at);

create or replace function public.marketplace_reserved_quantity(
  p_merchant_id text,
  p_product_id text
) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(quantity_base),0)
  from public.marketplace_inventory_reservations
  where seller_merchant_id = p_merchant_id
    and product_id = p_product_id
    and status = 'reserved';
$$;

-- Création transactionnelle : verrouille les balances, vérifie le stock disponible
-- après réservations existantes, crée la commande et ses réservations atomiquement.
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
end;
$$;

-- Annulation : libère les réservations, sans toucher au stock réel.
create or replace function public.marketplace_cancel_order(
  p_order_id uuid, p_actor_type text default 'system', p_actor_id text default null, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_order public.marketplace_orders%rowtype;
begin
  select * into v_order from public.marketplace_orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0001',message='ORDER_NOT_FOUND'; end if;
  if v_order.status in ('delivered','cancelled','rejected') then
    raise exception using errcode='P0001',message='ORDER_NOT_CANCELLABLE'; end if;

  update public.marketplace_inventory_reservations
    set status='released',released_at=now()
    where order_id=p_order_id and status='reserved';

  update public.marketplace_orders
    set status='cancelled',cancelled_at=now(),updated_at=now()
    where id=p_order_id;

  insert into public.marketplace_order_events
    (order_id,event_type,from_status,to_status,actor_type,actor_id,note)
  values (p_order_id,'order_cancelled',v_order.status,'cancelled',p_actor_type,p_actor_id,p_reason);

  return jsonb_build_object('cancelled',true,'order_id',p_order_id);
end;
$$;

-- Livraison/vente : consomme les réservations et exécute la vente stock atomique.
create or replace function public.marketplace_fulfill_order(
  p_order_id uuid, p_actor_type text default 'system', p_actor_id text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_order public.marketplace_orders%rowtype;
  v_item record;
  v_sale jsonb;
  v_items jsonb := '[]'::jsonb;
  v_op uuid;
begin
  select * into v_order from public.marketplace_orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0001',message='ORDER_NOT_FOUND'; end if;
  if v_order.status in ('cancelled','rejected','delivered') then
    raise exception using errcode='P0001',message='ORDER_NOT_FULFILLABLE'; end if;

  for v_item in
    select oi.*, sp.merchant_id seller_merchant_id
    from public.marketplace_order_items oi
    join public.marketplace_seller_profiles sp on sp.id=oi.seller_id
    where oi.order_id=p_order_id
    order by oi.product_id
  loop
    v_items := v_items || jsonb_build_object(
      'productId',v_item.product_id,
      'productName',v_item.product_name,
      'quantity',v_item.quantity,
      'quantityBase',v_item.quantity,
      'unitPrice',v_item.unit_price_cfa,
      'unitCode','unite'
    );
    -- Chaque vendeur est traité séparément pour préserver l'autorité merchant_record_sale.
    v_op := md5(p_order_id::text || ':' || v_item.seller_merchant_id)::uuid;
    select public.merchant_record_sale(
      v_item.seller_merchant_id,v_op,null,
      jsonb_build_array(jsonb_build_object(
        'productId',v_item.product_id,'productName',v_item.product_name,
        'quantity',v_item.quantity,'quantityBase',v_item.quantity,
        'unitPrice',v_item.unit_price,'unitCode','unite')),
      0,false,null,'Marketplace order '||v_order.order_number,null
    ) into v_sale;

    update public.marketplace_inventory_reservations
      set status='consumed',released_at=now()
      where order_item_id=v_item.id and status='reserved';
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

-- RBAC : tables marketplace accessibles uniquement au backend service_role.
alter table public.marketplace_seller_profiles enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_listing_images enable row level security;
alter table public.marketplace_orders enable row level security;
alter table public.marketplace_order_items enable row level security;
alter table public.marketplace_inventory_reservations enable row level security;
alter table public.marketplace_payments enable row level security;
alter table public.marketplace_deliveries enable row level security;
alter table public.marketplace_order_events enable row level security;

revoke all on function public.marketplace_reserved_quantity(text,text) from public, anon, authenticated;
grant execute on function public.marketplace_reserved_quantity(text,text) to service_role;
revoke all on function public.marketplace_create_order(text,jsonb,uuid,bigint,bigint,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.marketplace_create_order(text,jsonb,uuid,bigint,bigint,text,text,text,text,text) to service_role;
revoke all on function public.marketplace_cancel_order(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.marketplace_cancel_order(uuid,text,text,text) to service_role;
revoke all on function public.marketplace_fulfill_order(uuid,text,text) from public, anon, authenticated;
grant execute on function public.marketplace_fulfill_order(uuid,text,text) to service_role;

-- Transition progressive des données existantes : les produits actifs deviennent
-- des listings publiables et les marchands des profils, sans supprimer le legacy.
insert into public.marketplace_seller_profiles (merchant_id,display_name,phone,status)
select m.id,trim(concat_ws(' ',m.first_name,m.last_name)),m.phone,'active'
from public.merchants m
on conflict (merchant_id) do update set
  display_name=excluded.display_name,phone=excluded.phone,updated_at=now();

insert into public.marketplace_listings
  (seller_id,product_id,title,category,price_unit,status)
select sp.id,p.id,p.name,p.category,p.price_unit,
       case when p.is_active then 'published' else 'draft' end
from public.legacy_products p
join public.marketplace_seller_profiles sp on sp.merchant_id=p.merchant_id
on conflict (seller_id,product_id) do update set
  title=excluded.title,category=excluded.category,price_unit=excluded.price_unit,
  updated_at=now();

drop trigger if exists marketplace_seller_profiles_updated_at on public.marketplace_seller_profiles;
create trigger marketplace_seller_profiles_updated_at before update on public.marketplace_seller_profiles
for each row execute function public.set_updated_at_legacy();

drop trigger if exists marketplace_listings_updated_at on public.marketplace_listings;
create trigger marketplace_listings_updated_at before update on public.marketplace_listings
for each row execute function public.set_updated_at_legacy();

drop trigger if exists marketplace_orders_updated_at on public.marketplace_orders;
create trigger marketplace_orders_updated_at before update on public.marketplace_orders
for each row execute function public.set_updated_at_legacy();

drop trigger if exists marketplace_payments_updated_at on public.marketplace_payments;
create trigger marketplace_payments_updated_at before update on public.marketplace_payments
for each row execute function public.set_updated_at_legacy();

drop trigger if exists marketplace_deliveries_updated_at on public.marketplace_deliveries;
create trigger marketplace_deliveries_updated_at before update on public.marketplace_deliveries
for each row execute function public.set_updated_at_legacy();
