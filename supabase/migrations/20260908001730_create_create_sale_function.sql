-- Migration: fonction create_sale — vente transactionnelle avec session de caisse
-- (scission de 20260908001700_cash_session_functions.sql, 1 objet = 1 fichier).

-- Extension de create_sale : rattachement optionnel de la vente à une
-- session de caisse ouverte du même marchand. L'ancienne signature est
-- supprimée : un paramètre ajouté via create or replace créerait une
-- surcharge ambiguë pour PostgREST.
drop function if exists public.create_sale(uuid, uuid, bigint, text, jsonb);

create or replace function public.create_sale(
  p_organization_id uuid,
  p_client_id uuid,
  p_amount_received bigint,
  p_note text,
  p_items jsonb,
  p_cash_session_id uuid default null
)
returns public.sales
language plpgsql security invoker set search_path = public as $$
declare
  sale_row public.sales;
  item jsonb;
  product_row public.products;
  session_row public.cash_sessions;
  item_quantity numeric;
  item_subtotal bigint;
  computed_total bigint := 0;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'Organisation inaccessible';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'Une vente doit contenir au moins un article';
  end if;
  if p_amount_received < 0 then
    raise exception using errcode = '22023', message = 'Montant reçu invalide';
  end if;
  if p_cash_session_id is not null then
    select * into session_row from public.cash_sessions
    where id = p_cash_session_id and organization_id = p_organization_id
    for update;
    if not found or session_row.merchant_user_id <> (select auth.uid()) then
      raise exception using errcode = '22023', message = 'Session de caisse invalide';
    end if;
    if not session_row.is_open then
      raise exception using errcode = '22023', message = 'Session de caisse déjà clôturée';
    end if;
  end if;

  insert into public.sales (organization_id, merchant_user_id, client_id, total_amount, amount_received, note, cash_session_id)
  values (p_organization_id, auth.uid(), p_client_id, 0, p_amount_received, p_note, p_cash_session_id)
  on conflict (organization_id, client_id) do update set client_id = excluded.client_id
  returning * into sale_row;

  if sale_row.total_amount <> 0 then return sale_row; end if;

  for item in select * from jsonb_array_elements(p_items) loop
    select * into product_row from public.products
    where id = (item ->> 'product_id')::uuid
      and organization_id = p_organization_id
      and merchant_user_id = auth.uid()
      and is_active
    for update;
    if not found then raise exception using errcode = '22023', message = 'Produit invalide'; end if;
    item_quantity := (item ->> 'quantity')::numeric;
    if item_quantity <= 0 or product_row.stock_qty < item_quantity then
      raise exception using errcode = '22023', message = 'Stock insuffisant';
    end if;
    item_subtotal := (product_row.price_unit * item_quantity)::bigint;
    computed_total := computed_total + item_subtotal;
    insert into public.sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal)
    values (sale_row.id, product_row.id, product_row.name, item_quantity, product_row.price_unit, item_subtotal);
    update public.products set stock_qty = stock_qty - item_quantity where id = product_row.id;
    insert into public.stock_movements (organization_id, product_id, user_id, movement_type, quantity, reason)
    values (p_organization_id, product_row.id, auth.uid(), 'vente', -item_quantity, sale_row.id::text);
  end loop;
  if p_amount_received < computed_total then
    raise exception using errcode = '22023', message = 'Montant reçu insuffisant';
  end if;
  update public.sales set total_amount = computed_total, change_amount = p_amount_received - computed_total
  where id = sale_row.id returning * into sale_row;
  return sale_row;
end;
$$;

revoke all on function public.create_sale(uuid, uuid, bigint, text, jsonb, uuid) from public;
grant execute on function public.create_sale(uuid, uuid, bigint, text, jsonb, uuid) to authenticated;
