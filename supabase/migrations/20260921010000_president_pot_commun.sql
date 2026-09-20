-- MODE-931 — Correctif P0 : le PRÉSIDENT (coopérateur) ne peut ni apporter,
-- ni distribuer, ni livrer un besoin du pot commun.
--
-- Cause racine (audit 97-C2) : les routes POST /api/cooperatives/stock et
-- /api/cooperatives/distribution exigent une session MARCHAND
-- (requireMembreActif → requireDeviceOwner('merchant', …)) alors que le
-- président est authentifié avec le sujet de session `cooperateur:<id>` —
-- 403 systématique sur les écrans cœur de l'espace coopérative
-- (apport, distribution, distribution liée à un besoin).
--
-- Côté base, deux obstacles pour signer les mouvements du président :
--   1. cooperative_stock_mouvements.membre_id porte une FK vers
--      merchants(id) — un coopérateur n'a PAS de ligne merchants ;
--   2. l'idempotence des RPC teste `membre_id = p_membre_id`, qui est
--      NULL (jamais vrai) quand le président opère → un rejeu offline
--      du président compterait ses apports en DOUBLE.
--
-- Correctif MINIMAL (corps des RPC recopié VERBATIM depuis la migration
-- 20260920100100, seul le prédicat d'idempotence change) : le mouvement
-- est signé par un « opérateur » (marchand membre OU coopérateur
-- président) ; `is not distinct from` rend l'idempotence correcte même
-- quand p_membre_id est NULL.

-- 1) La signature du mouvement ne doit plus être bornée aux marchands.
alter table public.cooperative_stock_mouvements
  drop constraint if exists cooperative_stock_mouvements_membre_id_fkey;

comment on column public.cooperative_stock_mouvements.membre_id is
  'Opérateur du mouvement : id du marchand membre (apporteur ou destinataire) OU id du coopérateur président (apport/distribution effectués depuis l''espace coopérative — MODE-931). NULL possible (mouvement ancien) — l''idempotence des RPC utilise IS NOT DISTINCT FROM depuis MODE-931.';

-- 2) coop_apporter_stock — idempotence insensible à NULL (président).
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
  -- MODE-931 : IS NOT DISTINCT FROM — p_membre_id peut être NULL
  -- (président coopérateur) sans casser la reconnaissance du rejeu.
  if p_client_id is not null then
    select id into v_mouvement_id
    from public.cooperative_stock_mouvements
    where cooperative_id = p_cooperative_id
      and type = 'apport'
      and produit = p_produit
      and membre_id is not distinct from p_membre_id
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

-- 3) coop_distribuer_stock — même correctif d'idempotence (le
-- distributeur peut être le président), corps sinon identique.
create or replace function public.coop_distribuer_stock(
  p_cooperative_id uuid,
  p_membre_id      text,     -- distributeur (membre qui opère ou président — MODE-931)
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
  -- MODE-931 : IS NOT DISTINCT FROM — p_membre_id peut être NULL
  -- (président coopérateur) sans casser la reconnaissance du rejeu.
  if p_client_id is not null then
    select id into v_mouvement_id
    from public.cooperative_stock_mouvements
    where cooperative_id = p_cooperative_id
      and type = 'distribution'
      and produit = p_produit
      and membre_id is not distinct from p_membre_id
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
