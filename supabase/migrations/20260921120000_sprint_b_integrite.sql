-- MODE-935 — Sprint B de l'audit #003 (AUDIT-003, 2026-09-21) :
-- intégrité producteur / coopérative.
--
-- Contenu :
--   1. I-12 : CHECKs d'union sur legacy_producteur_recoltes.statut et
--      legacy_producteur_commandes.statut — seuls les statuts connus de
--      l'UI sont posables, y compris via un PATCH direct à la route.
--   2. I-08 : client_id + index unique partiel sur cooperative_transactions
--      et cooperative_besoins — l'idempotence du rejeu offline (crash entre
--      le commit serveur et le dequeue) est garantie PAR LA BASE, même
--      contrat que l'apport du pot commun (client_id → operation reconnue).
--   3. I-11 / PF-02 : index cooperative_transactions(membre_id) — le test
--      d'unicité annuelle de la cotisation et les agrégats par membre ne
--      scannent plus toute la table.
--   4. I-05 / I-07 : réécriture des deux RPC du pot commun —
--        • le test d'idempotence se fait APRÈS l'acquisition du verrou
--          FOR UPDATE : deux rejeus concurrents se séquentialisent et le
--          second reconnaît le mouvement du premier (fin du TOCTOU qui
--          comptait en double) ;
--        • l'apport d'une unité DIFFÉRENTE de la ligne existante est
--          refusé (exception lisible UNITE_DIFFERENTE → 409 côté route)
--          au lieu d'écraser l'unité en additionnant les quantités
--          (5 kg + 3 sacs ne valent pas « 8 sacs »).

-- ── 1. I-12 : unions de statuts verrouillées en base ────────────────────

alter table public.legacy_producteur_recoltes
  drop constraint if exists legacy_producteur_recoltes_statut_check;
alter table public.legacy_producteur_recoltes
  add constraint legacy_producteur_recoltes_statut_check
  check (statut in ('brouillon', 'publiee', 'disponible', 'vendue'));

alter table public.legacy_producteur_commandes
  drop constraint if exists legacy_producteur_commandes_statut_check;
alter table public.legacy_producteur_commandes
  add constraint legacy_producteur_commandes_statut_check
  check (statut in ('a_traiter', 'en_attente', 'confirmee', 'en_cours', 'livree', 'refusee'));

-- ── 2. I-08 : idempotence serveur du rejeu trésorerie / besoins ────────

alter table public.cooperative_transactions
  add column if not exists client_id text;

create unique index if not exists uniq_coop_transactions_client
  on public.cooperative_transactions(cooperative_id, client_id)
  where client_id is not null;

alter table public.cooperative_besoins
  add column if not exists client_id text;

create unique index if not exists uniq_coop_besoins_client
  on public.cooperative_besoins(cooperative_id, client_id)
  where client_id is not null;

comment on column public.cooperative_transactions.client_id is
  'Idempotence du rejeu offline : UUID généré par l''appareil (même contrat
que l''apport du pot commun). NULL = écriture ancienne ou serveur. Deux
inserts concurrents avec le même (cooperative_id, client_id) violent
uniq_coop_transactions_client — le premier commit gagne, le second est
reconnu comme rejeu par la route (200, rien re-compté).';

comment on column public.cooperative_besoins.client_id is
  'Idempotence du rejeu offline : UUID généré par l''appareil. Voir le
commentaire de cooperative_transactions.client_id (MODE-935).';

-- ── 3. I-11 / PF-02 : index membre_id ───────────────────────────────────

create index if not exists idx_cooperative_transactions_membre
  on public.cooperative_transactions(membre_id);

-- ── 4. I-05 / I-07 : RPC du pot commun (verrou AVANT idempotence,
--      unité verrouillée) — corps repris VERBATIM de 20260921010000
--      (idempotence IS NOT DISTINCT FROM du président conservée), seul
--      l'ORDRE des étapes et la garde d'unité changent. ─────────────────

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

  -- Verrou AVANT le test d'idempotence (I-07) : la ligne est créée si
  -- absente puis verrouillée FOR UPDATE. Deux rejeus concurrents du même
  -- client_id se séquentialisent ICI — le second voit le mouvement déjà
  -- posé par le premier et sort en « rejeu » sans re-compter.
  insert into public.cooperative_stock (cooperative_id, produit, categorie, quantite, unite)
  values (p_cooperative_id, p_produit, p_categorie, 0, p_unite)
  on conflict (cooperative_id, produit) do nothing;

  select * into v_ligne
  from public.cooperative_stock
  where cooperative_id = p_cooperative_id and produit = p_produit
  for update;

  -- Idempotence du rejeu (après verrou). MODE-931 : IS NOT DISTINCT FROM
  -- — p_membre_id peut être NULL (président coopérateur).
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

  -- I-05 : l'unité d'une ligne existante est VERROUILLÉE. Un apport en
  -- une autre unité est refusé lisiblement (409 côté route) — jamais
  -- d'écrasement ni d'addition inter-unités.
  if v_ligne.unite is not null and v_ligne.unite <> p_unite then
    raise exception 'UNITE_DIFFERENTE:unite=%', v_ligne.unite;
  end if;

  update public.cooperative_stock
  set quantite = v_ligne.quantite + p_quantite,
      categorie = coalesce(p_categorie, v_ligne.categorie)
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

create or replace function public.coop_distribuer_stock(
  p_cooperative_id uuid,
  p_membre_id      text,     -- distributeur (membre qui opère ou président)
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

  -- Verrou AVANT le test d'idempotence (I-07, même ordre que l'apport).
  select * into v_ligne
  from public.cooperative_stock
  where cooperative_id = p_cooperative_id and produit = p_produit
  for update;

  if v_ligne is null then
    raise exception 'PRODUIT_ABSENT';
  end if;

  -- Idempotence du rejeu (après verrou). MODE-931 : IS NOT DISTINCT FROM.
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

  -- I-05 : cohérence d'unité — on ne distribue pas des sacs depuis une
  -- ligne comptée en kg (garde symétrique de l'apport).
  if v_ligne.unite is not null and v_ligne.unite <> p_unite then
    raise exception 'UNITE_DIFFERENTE:unite=%', v_ligne.unite;
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
