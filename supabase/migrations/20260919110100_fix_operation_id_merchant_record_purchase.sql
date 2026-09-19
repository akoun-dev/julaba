-- STK-809 — Fix merchant_record_purchase : mêmes deux corrections que
-- merchant_record_sale (alias `item` manquant sur jsonb_array_elements +
-- operation_id dérivé par produit md5(op||':'||product_id) pour respecter
-- UNIQUE (merchant_id, operation_id) sur les achats MULTI-ARTICLES).
--
-- Contenu = définition EXACTE appliquée en production (dump pg_proc).

CREATE OR REPLACE FUNCTION public.merchant_record_purchase(p_merchant_id text, p_operation_id uuid, p_device_id text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb, p_supplier_id text DEFAULT NULL::text, p_amount_paid bigint DEFAULT NULL::bigint, p_note text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_create_expense boolean DEFAULT false, p_expense_category text DEFAULT 'aliment'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_purchase   public.merchant_purchases%rowtype;
  v_product    public.legacy_products%rowtype;
  v_balance    public.merchant_stock_balances%rowtype;
  v_item       jsonb;
  v_product_id text;
  v_name       text;
  v_quantity   numeric(14, 3);
  v_q_base     numeric(14, 3);
  v_unit_cost  numeric(14, 2);
  v_line_cost  bigint;
  v_unit_cost_base numeric(14, 2);
  v_new_cost   numeric(14, 2);
  v_total      bigint := 0;
  v_items      jsonb := '[]'::jsonb;
  v_idx        int := 0;
  v_expense_id text;
begin
  if p_merchant_id is null or not exists
    (select 1 from public.merchants where id = p_merchant_id) then
    raise exception using errcode = '22023', message = 'Marchand introuvable';
  end if;
  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'operation_id obligatoire';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'Un achat doit contenir au moins un article';
  end if;
  if p_amount_paid is not null and p_amount_paid < 0 then
    raise exception using errcode = '22023', message = 'Montant payé invalide';
  end if;
  if p_supplier_id is not null and not exists
    (select 1 from public.business_partners
      where id = p_supplier_id and merchant_id = p_merchant_id) then
    raise exception using errcode = '22023', message = 'Fournisseur invalide';
  end if;

  -- Idempotence : rejeu offline → l'achat existant, sans rien refaire.
  select * into v_purchase from public.merchant_purchases
    where merchant_id = p_merchant_id and client_id = p_operation_id::text;
  if found then
    return jsonb_build_object('created', false, 'purchase', to_jsonb(v_purchase),
      'items',
        coalesce((select jsonb_agg(to_jsonb(i)) from public.merchant_purchase_items i
                  where i.purchase_id = v_purchase.id), '[]'::jsonb));
  end if;

  insert into public.merchant_purchases
    (merchant_id, client_id, supplier_id, session_id, total_amount,
     amount_paid, note)
  values
    (p_merchant_id, p_operation_id::text, p_supplier_id, p_session_id, 0,
     coalesce(p_amount_paid, 0), p_note)
  returning * into v_purchase;

  -- ALIAS `item` OBLIGATOIRE (bug latent 20260919091200, cf. fix vente
  -- 20260919110000 : sans alias, « column item does not exist »).
  for v_item in
    select * from jsonb_array_elements(p_items) as item
    order by (item ->> 'productId') nulls last, (item ->> 'productId')
  loop
    v_idx := v_idx + 1;
    v_product_id := nullif(trim(v_item ->> 'productId'), '');
    v_name := nullif(trim(v_item ->> 'productName'), '');
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_q_base := coalesce(nullif(v_item ->> 'quantityBase', '')::numeric, v_quantity);
    v_unit_cost := (v_item ->> 'unitCostCfa')::numeric;

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
    if v_unit_cost is null or v_unit_cost < 0 then
      raise exception using errcode = 'P0001',
        message = 'INVALID_QUANTITY',
        detail = jsonb_build_object('index', v_idx, 'field', 'unitCostCfa')::text;
    end if;
    v_line_cost := round(v_quantity * v_unit_cost)::bigint;
    v_unit_cost_base := v_line_cost / v_q_base;

    if v_product_id is not null then
      select * into v_product from public.legacy_products
        where id = v_product_id for update;
      if not found then
        raise exception using errcode = 'P0001',
          message = 'PRODUCT_NOT_FOUND',
          detail = jsonb_build_object('product_id', v_product_id)::text;
      end if;

      -- Un premier achat MET UN PRODUIT SOUS SUIVI (balance créée EXACT).
      insert into public.merchant_stock_balances
        (merchant_id, product_id, quantity_base, stock_precision)
      values (p_merchant_id, v_product_id, 0, 'EXACT')
        on conflict (merchant_id, product_id) do nothing;
      select * into v_balance from public.merchant_stock_balances
        where merchant_id = p_merchant_id and product_id = v_product_id
        for update;

      -- Coût moyen pondéré (§30).
      v_new_cost := round(
        (v_balance.quantity_base * coalesce(v_balance.weighted_avg_cost, 0)
         + v_q_base * v_unit_cost_base)
        / (v_balance.quantity_base + v_q_base), 2);

      insert into public.merchant_stock_movements
        (merchant_id, product_id, movement_type, quantity_base,
         quantity_commercial, unit_code, reference_type, reference_id,
         operation_id, device_id, created_by)
      values
        (p_merchant_id, v_product_id, 'PURCHASE', v_q_base,
         v_quantity, v_item ->> 'unitCode', 'purchase', v_purchase.id,
         -- operation_id DÉRIVÉ PAR PRODUIT (fix STK-809, voir en-tête).
         md5(p_operation_id::text || ':' || v_product_id)::uuid,
         p_device_id, p_merchant_id);

      update public.merchant_stock_balances
        set quantity_base = quantity_base + v_q_base,
            weighted_avg_cost = v_new_cost,
            last_movement_at = now()
        where merchant_id = p_merchant_id and product_id = v_product_id;

      -- Double écriture D3.
      update public.legacy_products
        set stock_qty = stock_qty + round(v_q_base)::int
        where id = v_product_id;
    end if;

    insert into public.merchant_purchase_items
      (purchase_id, product_id, product_name, quantity, unit_code,
       quantity_base, unit_cost_cfa, line_cost_cfa)
    values
      (v_purchase.id, v_product_id, v_name, v_quantity, v_item ->> 'unitCode',
       v_q_base, round(v_unit_cost)::bigint, v_line_cost);
    v_items := v_items || to_jsonb(v_item) || jsonb_build_object('lineCostCfa', v_line_cost);
    v_total := v_total + v_line_cost;
  end loop;

  update public.merchant_purchases set total_amount = v_total
    where id = v_purchase.id returning * into v_purchase;

  -- Écriture comptable liée, uniquement si demandée (D6).
  if p_create_expense and v_total > 0 then
    insert into public.legacy_expenses
      (merchant_id, client_id, amount, category, description)
    values
      (p_merchant_id, 'exp-' || p_operation_id::text, v_total,
       coalesce(nullif(trim(p_expense_category), ''), 'aliment'),
       coalesce(p_note, 'Achat de marchandises'))
    on conflict (client_id) do nothing
    returning id into v_expense_id;
  end if;

  return jsonb_build_object('created', true, 'purchase', to_jsonb(v_purchase),
    'items', v_items, 'expense_id', v_expense_id);
end;
$function$

-- Durcissement SEC-813 (défense en profondeur) : réservées au service_role.
revoke execute on function public.merchant_record_purchase from anon, authenticated;

