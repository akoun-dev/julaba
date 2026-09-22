-- Migration: MODE-986 (DET-COOP-003) — la cotisation rejoint le réel.
--
-- AVANT : la cotisation d'un marchand (POST /api/cooperatives/cotisation)
-- naissait 'validee' dans cooperative_transactions SANS aucun mouvement
-- d'argent réel — l'écart livre/compte documenté dans DEBT_REPORT
-- (DET-COOP-003 : « cotisation et clôtures enregistrées sans mouvement
-- Keiwa/Bpay » ; les clôtures de commande coop n'existent pas encore dans
-- julaba, le volet cotisation est le seul qui s'applique aujourd'hui).
--
-- APRÈS :
--   1. Chaque écriture de trésorerie porte un CANAL : 'especes' (déclaration
--      honnête, aucun mouvement wallet — valeur par défaut de TOUTES les
--      écritures existantes et nouvelles) ou 'keiwa' (le portefeuille du
--      marchand a été DÉBITÉ dans la même transaction SQL).
--   2. RPC cooperative_cotiser_keiwa : paie de cotisation ATOMIQUE —
--      verrou de ligne du portefeuille (même grammaire que
--      legacy_keiwa_apply_operation, migration 20260916000300 : pas de
--      double-débit, pas de solde perdu), vérification du solde AVANT toute
--      écriture (SOLDE_INSUFFISANT → l'API traduit en 400 et RIEN n'est
--      enregistré), règle annuelle re-vérifiée DANS la transaction
--      (COTISATION_DEJA_PAYEE — ferme la course que le garde HTTP ne peut
--      pas fermer : leçon I-07 TOCTOU, MODE-935), adhésion verrouillée pour
--      sérialiser deux cotisations concurrentes du même membre, idempotence
--      sur client_id (rejeu offline : le replay ne re-débite JAMAIS).
--
-- Pourquoi un RPC et pas deux appels API (keiwa puis trésorerie) :
-- deux appels séparés peuvent réussir l'un et échouer l'autre — le
-- marchand serait débité sans cotisation enregistrée (ou l'inverse), et
-- aucune compensation n'est fiable hors transaction. Leçon d'architecture
-- du dépôt : « les mutations financières passent par une fonction SQL
-- transactionnelle ».

-- ── 1. Canal de l'écriture ──────────────────────────────────────────────
alter table public.cooperative_transactions
  add column if not exists canal text not null default 'especes'
  check (canal in ('especes', 'keiwa'));

-- ── 2. RPC de cotisation Keiwa atomique ────────────────────────────────
-- p_marchand_id est un text (merchants.id et legacy_keiwa_wallets.merchant_id
-- sont des text — cohérence des deux schémas legacy/coop).
create or replace function public.cooperative_cotiser_keiwa(
  p_cooperative_id uuid,
  p_marchand_id text,
  p_montant integer,
  p_description text,
  p_client_id text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membre_row_id uuid;
  v_wallet public.legacy_keiwa_wallets;
  v_balance_after integer;
  v_transaction public.cooperative_transactions;
  v_deja jsonb;
begin
  -- ── Idempotence d'abord : un rejeu (crash après commit, file offline
  -- rejouée) rend l'écriture d'origine SANS re-débit ni re-comptage.
  if p_client_id is not null then
    select to_jsonb(t) into v_deja
    from public.cooperative_transactions t
    where t.cooperative_id = p_cooperative_id
      and t.client_id = p_client_id
    limit 1;
    if v_deja is not null then
      return json_build_object('rejeu', true, 'transaction', v_deja);
    end if;
  end if;

  -- ── Adhésion verrouillée : sérialise deux cotisations concurrentes du
  -- même membre (la vérification annuelle ci-dessous doit voir l'écriture
  -- de l'autre requête une fois le verrou libéré) + re-vérifie l'état
  -- réel DANS la transaction (le garde HTTP a pu vieillir — I-07).
  select m.id into v_membre_row_id
  from public.cooperative_membres m
  where m.cooperative_id = p_cooperative_id
    and m.membre_id = p_marchand_id
    and m.statut = 'actif'
  for update;
  if v_membre_row_id is null then
    raise exception 'PAS_MEMBRE_ACTIF';
  end if;

  -- ── Règle annuelle re-vérifiée sous verrou : une cotisation 'validee'
  -- de cette année civile pour ce membre dans cette coopérative bloque la
  -- seconde (le garde HTTP seul laisse passer deux requêtes concurrentes
  -- passées toutes deux avant le commit de l'autre).
  if exists (
    select 1 from public.cooperative_transactions t
    where t.cooperative_id = p_cooperative_id
      and t.membre_id = p_marchand_id
      and t.categorie = 'cotisation'
      and t.statut = 'validee'
      and t.created_at >= date_trunc('year', now())
  ) then
    raise exception 'COTISATION_DEJA_PAYEE';
  end if;

  -- ── Portefeuille : get-or-create puis VERROU de ligne (for update) —
  -- même grammaire que legacy_keiwa_apply_operation. Aucune écriture
  -- n'a encore eu lieu : un refus ici ne laisse AUCUNE trace.
  insert into public.legacy_keiwa_wallets (merchant_id)
  values (p_marchand_id)
  on conflict (merchant_id) do nothing;

  select * into v_wallet
  from public.legacy_keiwa_wallets
  where merchant_id = p_marchand_id
  for update;

  if v_wallet.balance < p_montant then
    raise exception 'SOLDE_INSUFFISANT';
  end if;

  -- ── Débit + ligne de ledger Keiwa (type 'retrait' : le wallet UI
  -- existant affiche le mouvement, note = description de la cotisation —
  -- le marchand comprend son historique sans nouveau concept).
  v_balance_after := v_wallet.balance - p_montant;

  update public.legacy_keiwa_wallets
  set balance = v_balance_after, updated_at = now()
  where id = v_wallet.id
  returning * into v_wallet;

  insert into public.legacy_keiwa_transactions
    (wallet_id, merchant_id, type, amount, balance_after, note, client_id)
  values
    (v_wallet.id, p_marchand_id, 'retrait', p_montant, v_balance_after,
     p_description, p_client_id);

  -- ── Écriture de trésorerie : nait 'validee' (convention cotisation,
  -- MODE-921) avec canal 'keiwa' — le livre dit VRAI sur l'argent réel.
  -- Un 23505 (course de rejeus perdue sur l'index unique client_id,
  -- migration 20260921120000) jette : TOUT roule arrière y compris le
  -- débit — l'API retentera la lecture du gagnant.
  insert into public.cooperative_transactions
    (cooperative_id, type, categorie, montant, membre_id, description,
     statut, canal, created_by, client_id)
  values
    (p_cooperative_id, 'entree', 'cotisation', p_montant, p_marchand_id,
     p_description, 'validee', 'keiwa', null, p_client_id)
  returning * into v_transaction;

  -- ── Flag d'adhésion (même effet que la voie espèces).
  update public.cooperative_membres
  set cotisation_payee = true
  where id = v_membre_row_id;

  return json_build_object(
    'rejeu', false,
    'transaction', to_jsonb(v_transaction),
    'soldeKeiwa', v_balance_after
  );
end;
$$;
