-- Migration: MODE-909 (§28) — RPC d'annulation de vente (opération inverse).
--
-- Style merchant_record_credit_op (MODE-906) : SECURITY DEFINER, verrou
-- explicite, idempotence sans refaire, retour jsonb état courant.
--
-- Contrat :
--   1. validations (marchand, operation_id, sale_client_id, raison 3-200) ;
--   2. idempotence (merchant_id, operation_id) déjà présent → état courant
--      SANS rien refaire (created = false) ;
--   3. VERROU sur la vente (legacy_sales FOR UPDATE) : toutes les
--      annulations d'une même vente se sérialisent ici — la contrainte
--      UNIQUE (merchant_id, sale_client_id) est le filet définitif ;
--      vente introuvable → RAISE 22023 'Vente introuvable' ;
--   4. déjà annulée (re-vérifié sous verrou) → état courant, sans refaire ;
--   5. SINON : pour CHAQUE article de la vente (legacy_sale_items) SUIVI de
--      stock, un mouvement d'entrée CUSTOMER_RETURN (quantité rendue) via
--      la RPC existante merchant_record_movement (une couche, zéro
--      duplication). L'operation_id de chaque mouvement est DÉRIVÉ de
--      façon DÉTERMINISTE (md5(operation_id || ':reversal:' || product_id)
--      — même technique que la vente multi-articles, fix STK-809) : rejeu →
--      mêmes uuid → jamais de doublon dans le journal append-only des
--      mouvements. Ligne sans product_id ou produit non suivi (balance
--      absente/UNKNOWN, §23 D7) → item ignoré SANS erreur (la vente
--      n'avait rien décrémenté de compté).
--   6. INSERT dans merchant_sale_reversals (append-only) ;
--   7. retour { operation_id, sale_client_id, items_returned, created }.
--
-- NB : la quantité rendue est la quantité VENDUE (legacy_sale_items.quantity,
-- entière) — même valeur que le mouvement SALE qui l'avait sortie. Le
-- remboursement cash en caisse est hors périmètre v1 (documenté SPEC-909).
--
-- Sécurité : security definer, exécution réservée au service_role (le
-- backend authentifie le marchand via requireDeviceOwner avant l'appel).

create or replace function public.merchant_reverse_sale(
  p_merchant_id    text,
  p_operation_id   uuid,
  p_sale_client_id text,
  p_reason         text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_reversal       public.merchant_sale_reversals%rowtype;
  v_sale           public.legacy_sales%rowtype;
  v_item           public.legacy_sale_items%rowtype;
  v_balance        public.merchant_stock_balances%rowtype;
  v_tracked        boolean;
  v_items_returned int := 0;
begin
  if p_merchant_id is null or not exists
    (select 1 from public.merchants where id = p_merchant_id) then
    raise exception using errcode = '22023', message = 'Marchand introuvable';
  end if;
  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'operation_id obligatoire';
  end if;
  if p_sale_client_id is null or trim(p_sale_client_id) = '' then
    raise exception using errcode = '22023', message = 'sale_client_id obligatoire';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 or length(trim(p_reason)) > 200 then
    raise exception using errcode = '22023',
      message = 'La raison de l''annulation doit contenir entre 3 et 200 caractères';
  end if;

  -- 2. Idempotence (rejeu offline) : le MÊME operation_id → état courant,
  -- sans rien refaire (§31-32).
  select * into v_reversal from public.merchant_sale_reversals
    where merchant_id = p_merchant_id and operation_id = p_operation_id;
  if found then
    return jsonb_build_object(
      'operation_id', v_reversal.operation_id,
      'sale_client_id', v_reversal.sale_client_id,
      'items_returned',
        (select count(*) from public.merchant_stock_movements m
          where m.merchant_id = p_merchant_id
            and m.reference_type = 'sale_reversal'
            and m.reference_id = v_reversal.sale_client_id),
      'created', false);
  end if;

  -- 3. Verrou de la vente : les annulations concurrentes d'une même vente
  -- se sérialisent ici ; la contrainte UNIQUE (merchant_id, sale_client_id)
  -- reste le filet définitif.
  select * into v_sale from public.legacy_sales
    where merchant_id = p_merchant_id and client_id = p_sale_client_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Vente introuvable';
  end if;

  -- 4. Déjà annulée (re-vérifié sous verrou) : état courant, SANS refaire —
  -- une vente ne s'annule qu'UNE fois (§28).
  select * into v_reversal from public.merchant_sale_reversals
    where merchant_id = p_merchant_id and sale_client_id = p_sale_client_id
    for update;
  if found then
    return jsonb_build_object(
      'operation_id', v_reversal.operation_id,
      'sale_client_id', v_reversal.sale_client_id,
      'items_returned',
        (select count(*) from public.merchant_stock_movements m
          where m.merchant_id = p_merchant_id
            and m.reference_type = 'sale_reversal'
            and m.reference_id = v_reversal.sale_client_id),
      'created', false);
  end if;

  -- 5. Retour du stock : un mouvement CUSTOMER_RETURN par article suivi.
  -- Tri par product_id (anti-deadlock, même discipline que la vente).
  for v_item in
    select * from public.legacy_sale_items
    where sale_id = v_sale.id
    order by product_id nulls last, id
  loop
    if v_item.product_id is null then
      continue; -- ligne libre sans produit : aucun suivi, ignorée sans erreur
    end if;
    if not exists
      (select 1 from public.legacy_products where id = v_item.product_id) then
      continue; -- produit disparu du catalogue : ignoré sans erreur
    end if;

    -- Produit NON suivi (§23 D7) : la vente n'avait rien décrémenté de
    -- compté (balance absente ou UNKNOWN) → rien à rendre, item ignoré.
    select * into v_balance from public.merchant_stock_balances
      where merchant_id = p_merchant_id and product_id = v_item.product_id;
    v_tracked := found and v_balance.stock_precision <> 'UNKNOWN';
    if not v_tracked then
      continue;
    end if;

    -- Mouvement d'entrée via la RPC existante (une couche, zéro duplication) :
    -- CUSTOMER_RETURN, quantité rendue = quantité vendue, reference trace
    -- l'annulation. operation_id dérivé par produit (fix STK-809).
    perform public.merchant_record_movement(
      p_merchant_id,
      md5(p_operation_id::text || ':reversal:' || v_item.product_id)::uuid,
      null,
      v_item.product_id,
      'CUSTOMER_RETURN',
      v_item.quantity,
      v_item.quantity,
      null,
      'Annulation de vente',
      nullif(trim(p_reason), ''),
      'sale_reversal',
      p_sale_client_id
    );
    v_items_returned := v_items_returned + 1;
  end loop;

  -- 6. L'annulation elle-même : append-only, JAMAIS de retouche de la vente.
  insert into public.merchant_sale_reversals
    (merchant_id, operation_id, sale_client_id, reason)
  values
    (p_merchant_id, p_operation_id, p_sale_client_id, trim(p_reason));

  -- 7. État courant.
  return jsonb_build_object(
    'operation_id', p_operation_id,
    'sale_client_id', p_sale_client_id,
    'items_returned', v_items_returned,
    'created', true);
end;
$$;

revoke all on function public.merchant_reverse_sale(text, uuid, text, text) from public;
grant execute on function public.merchant_reverse_sale(text, uuid, text, text) to service_role;
