-- Migration: MODE-921 (§3.4) — fonctions transactionnelles du pot commun.
--
-- Le principe d'argent de julaba-app (« l'argent et le hors-ligne sont
-- sacrés ») s'applique au stock commun : apport ET distribution doivent
-- être atomiques. Deux écritures (ligne courante + journal append-only)
-- ne peuvent JAMAIS se produire l'une sans l'autre : chaque opération est
-- une FUNCTION PL/pgSQL unique exécutée dans une transaction, avec verrou
-- sur la ligne concernée (FOR UPDATE) pour que deux apports/distributions
-- concurrents se séquentialisent au lieu de s'écraser.
--
-- Invariant central (testé côté julaba-app par stock-commun-cooperative) :
-- la distribution REFUSE INTÉGRALEMENT tout dépassement — jamais de stock
-- négatif, jamais de distribution partielle silencieuse.
--
-- Rejeu offline : ces fonctions sont appelées par les routes
-- /api/cooperatives/stock et /api/cooperatives/distribution, qui passent
-- par la file offline standard (FIFO + rejeu verbatim). L'apport est un
-- upsert additif : rejouer le MÊME apport doublerait la quantité. Pour
-- rendre le rejeu sûr, la fonction accepte p_client_id (UUID généré par
-- l'appareil, même contrat que merchant_sale_reversals.operation_id) :
-- un mouvement déjà présent avec ce client_id → l'opération est
-- reconnue et RIEN n'est re-compté (idempotence).

-- ── 1. Apport au pot commun ────────────────────────────────────────────
create or replace function public.coop_apporter_stock(
  p_cooperative_id uuid,
  p_membre_id      text,
  p_produit        text,
  p_categorie      text,
  p_quantite       numeric,
  p_unite          text,
  p_client_id      uuid default null
)
returns json
language plpgsql
as $$
declare
  v_ligne public.cooperative_stock;
  v_mouvement_id uuid;
begin
  if p_quantite is null or p_quantite <= 0 then
    raise exception 'QUANTITE_INVALIDE';
  end if;

  -- Idempotence du rejeu : le client_id a déjà produit ce mouvement ?
  if p_client_id is not null then
    select id into v_mouvement_id
    from public.cooperative_stock_mouvements
    where cooperative_id = p_cooperative_id
      and type = 'apport'
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

  -- Verrou : la ligne courante du produit (créée si absente).
  insert into public.cooperative_stock (cooperative_id, produit, categorie, quantite, unite)
  values (p_cooperative_id, p_produit, p_categorie, 0, p_unite)
  on conflict (cooperative_id, produit) do nothing;

  select * into v_ligne
  from public.cooperative_stock
  where cooperative_id = p_cooperative_id and produit = p_produit
  for update;

  update public.cooperative_stock
  set quantite = v_ligne.quantite + p_quantite,
      categorie = coalesce(p_categorie, v_ligne.categorie),
      unite = p_unite
  where id = v_ligne.id
  returning * into v_ligne;

  insert into public.cooperative_stock_mouvements
    (cooperative_id, produit, unite, type, quantite, membre_id, note)
  values
    (p_cooperative_id, p_produit, p_unite, 'apport', p_quantite, p_membre_id,
     case when p_client_id is not null then 'client:' || p_client_id::text else null end)
  returning id into v_mouvement_id;

  return json_build_object(
    'rejeu', false,
    'mouvement_id', v_mouvement_id,
    'stock', to_jsonb(v_ligne)
  );
end;
$$;

-- ── 2. Distribution multi-destinataires ────────────────────────────────
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

  return json_build_object(
    'rejeu', false,
    'stock', to_jsonb(v_ligne),
    'distribue', v_demande
  );
end;
$$;

-- ── 3. Privilèges ──────────────────────────────────────────────────────
-- Les routes serveur passent par le client admin (service_role) : les
-- fonctions sont exécutables par tout rôle authentifié côté base, mais
-- l'accès applicatif reste gardé par requireMembreActif/requirePresident.
grant execute on function public.coop_apporter_stock(uuid, text, text, text, numeric, text, uuid) to authenticated, service_role;
grant execute on function public.coop_distribuer_stock(uuid, text, text, numeric, text, jsonb, uuid, uuid) to authenticated, service_role;
