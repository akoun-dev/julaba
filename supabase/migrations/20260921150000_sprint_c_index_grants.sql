-- ─────────────────────────────────────────────────────────────────────────
-- MODE-942 — Sprint C de l'audit #003 (C-5 + C-6 SQL) : 2026-09-21
--
-- 1. PF-01/PF-02/PF-03 — index manquants sur les colonnes de policy et
--    de jointure (le catalogue d'index est borné à ce que l'audit cite ;
--    cooperative_transactions(membre_id) existe déjà depuis 20260921120000).
-- 2. S-07 — les RPC coopératives redeviennent service_role SEUL (le GRANT
--    authenticated était trompeur : deny-all RLS ⇒ 42501 garanti hors
--    route ; surface confuse = classe de régression SEC-813).
-- 3. I-06 — distribution→besoin ATOMIQUE : coop_distribuer_stock marque
--    le besoin 'livre' DANS la même transaction (fin du couple
--    RPC réussie + PATCH qui pouvait échouer → stock parti, besoin
--    re-distribuable). Garde BESOIN_DEJA_LIVRE (409 côté route) et
--    BESOIN_INCOHERENT (produit/unité qui ne matchent pas le besoin).
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Index (PF-01/PF-02/PF-03) ───────────────────────────────────────

-- devices.user_id : colonne de policy (devices_owner_read), aucun index.
create index if not exists idx_devices_user
  on public.devices(user_id);

-- sync_conflict_reports : aucun index du tout ; lecture par user+org.
create index if not exists idx_sync_conflict_reports_user_org
  on public.sync_conflict_reports(user_id, organization_id);

-- legacy_sales : GET /sales filtre par merchant + trie created_at desc.
create index if not exists idx_legacy_sales_merchant_created
  on public.legacy_sales(merchant_id, created_at desc);

-- legacy_sale_items.product_id : jointures/analytics, seq scan avant.
create index if not exists idx_legacy_sale_items_product
  on public.legacy_sale_items(product_id);

-- cooperative_stock_mouvements.besoin_id : FK sans index.
create index if not exists idx_cooperative_stock_mouvements_besoin
  on public.cooperative_stock_mouvements(besoin_id);

-- ── 2. S-07 — RPC coop : service_role seul ─────────────────────────────

revoke execute on function public.coop_apporter_stock(uuid, text, text, text, numeric, text, uuid)
  from authenticated;
revoke execute on function public.coop_distribuer_stock(uuid, text, text, numeric, text, jsonb, uuid, uuid)
  from authenticated;

-- ── 3. I-06 — distribution + besoin 'livre' dans UNE transaction ───────

create or replace function public.coop_distribuer_stock(
  p_cooperative_id uuid,
  p_membre_id      text,     -- distributeur (membre qui opère)
  p_produit        text,
  p_quantite       numeric,  -- quantité TOTALE distribuée (somme des parts)
  p_unite          text,
  p_destinataires  jsonb,    -- [{membreId, quantite}]
  p_besoin_id      uuid default null,
  p_client_id      uuid default null
)
returns json
language plpgsql
as $$
declare
  v_disponible numeric;
  v_demande numeric;
  v_ligne public.cooperative_stock;
  v_dest jsonb;
  v_destinataire text;
  v_part numeric;
  v_mouvement_id uuid;
  v_besoin public.cooperative_besoins;
begin
  if p_quantite is null or p_quantite <= 0 then
    raise exception 'QUANTITE_INVALIDE';
  end if;

  -- Idempotence du rejeu (même contrat que l'apport).
  if p_client_id is not null then
    select id into v_mouvement_id
    from public.cooperative_stock_mouvements
    where cooperative_id = p_cooperative_id
      and type = 'distribution'
      and produit = p_produit
      and membre_id = p_membre_id
      and note like 'client:' || p_client_id::text
    limit 1;
    if v_mouvement_id is not null then
      select * into v_ligne
      from public.cooperative_stock
      where cooperative_id = p_cooperative_id and produit = p_produit;
      return json_build_object('rejeu', true, 'stock', to_jsonb(v_ligne));
    end if;
  end if;

  -- MODE-942 (I-06) : quand la distribution porte un besoin, il est
  -- vérifié ET verrouillé ICI — la clôture 'livre' vit dans la MÊME
  -- transaction que le mouvement de stock (fin de la fenêtre « stock
  -- parti, besoin re-distribuable »).
  if p_besoin_id is not null then
    select * into v_besoin
    from public.cooperative_besoins
    where id = p_besoin_id and cooperative_id = p_cooperative_id
    for update;

    if v_besoin is null then
      raise exception 'BESOINTROUVABLE';
    end if;
    if v_besoin.statut = 'livre' then
      raise exception 'BESOIN_DEJA_LIVRE';
    end if;
    if lower(btrim(v_besoin.produit)) <> lower(btrim(p_produit))
       or lower(btrim(v_besoin.unite)) <> lower(btrim(p_unite)) then
      raise exception 'BESOIN_INCOHERENT';
    end if;
  end if;

  -- La somme des parts doit égaler la quantité annoncée (aucune part
  -- cachée, aucune part perdue).
  v_demande := 0;
  for v_dest in select * from jsonb_array_elements(p_destinataires) loop
    v_destinataire := v_dest->>'membreId';
    v_part := (v_dest->>'quantite')::numeric;
    if v_destinataire is null or v_destinataire = '' then
      raise exception 'DESTINATAIRE_MANQUANT';
    end if;
    if v_part is null or v_part <= 0 then
      raise exception 'PART_INVALIDE';
    end if;
    v_demande := v_demande + v_part;
  end loop;

  if v_demande <> p_quantite then
    raise exception 'PARTS_INCOHERENTES';
  end if;

  -- Verrou sur la ligne courante : deux distributions concurrentes se
  -- séquentialisent ici.
  select * into v_ligne
  from public.cooperative_stock
  where cooperative_id = p_cooperative_id and produit = p_produit
  for update;

  if v_ligne is null then
    raise exception 'PRODUIT_ABSENT';
  end if;

  v_disponible := v_ligne.quantite;
  if v_demande > v_disponible then
    raise exception 'STOCK_INSUFFISANT:disponible=%,demande=%', v_disponible, v_demande;
  end if;

  update public.cooperative_stock
  set quantite = v_disponible - v_demande
  where id = v_ligne.id
  returning * into v_ligne;

  -- UN mouvement par destinataire (append-only) — l'historique garde la
  -- trace nominative de chaque part distribuée.
  for v_dest in select * from jsonb_array_elements(p_destinataires) loop
    insert into public.cooperative_stock_mouvements
      (cooperative_id, produit, unite, type, quantite, membre_id, besoin_id, note)
    values
      (p_cooperative_id, p_produit, p_unite, 'distribution',
       (v_dest->>'quantite')::numeric, v_dest->>'membreId', p_besoin_id,
       case when p_client_id is not null then 'client:' || p_client_id::text else null end);
  end loop;

  -- MODE-942 (I-06) : clôture du besoin DANS la transaction — si un
  -- échec survient après coup, TOUT est annulé (mouvements compris).
  if p_besoin_id is not null then
    update public.cooperative_besoins
    set statut = 'livre'
    where id = p_besoin_id;
  end if;

  return json_build_object(
    'rejeu', false,
    'stock', to_jsonb(v_ligne),
    'distribue', v_demande
  );
end;
$$;
