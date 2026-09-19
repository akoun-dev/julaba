-- Migration: MODE-906 — grand livre de crédit clients (§21-22/§27-28).
--
-- `merchant_credit_ops` est une entité PROPRE, append-only : chaque ligne est
-- une opération de crédit ('credit' = le client prend à crédit, sa dette
-- augmente) ou de remboursement ('repayment', sa dette diminue). La vente
-- reste ce qu'elle est (autorité stock, legacy_sales) ; une vente à crédit
-- est une vente existante + une op de crédit liée par sale_client_id.
-- JAMAIS de DELETE/UPDATE d'une vente ou d'une op.
--
-- Solde : business_partners.balance_cfa (signé) — > 0 le client doit au
-- marchand, < 0 le marchand doit au client. Un remboursement ne peut JAMAIS
-- faire passer le solde sous 0 : refus REPAYMENT_EXCEEDS_DEBT.
--
-- Idempotence (§31-32) : UNIQUE (merchant_id, operation_id) — le rejeu
-- offline rejoue le MÊME operation_id, la RPC reconnaît et retourne l'état
-- courant sans retoucher le solde.
--
-- NB : partner_id est text, comme business_partners.id (clé primaire text
-- de la table existante) — une FK uuid vers une clé text n'est pas
-- implémentable en PostgreSQL.

create table if not exists public.merchant_credit_ops (
  id             uuid primary key default gen_random_uuid(),
  merchant_id    text not null,
  operation_id   uuid not null,
  kind           text not null check (kind in ('credit', 'repayment')),
  partner_id     text not null references public.business_partners(id),
  sale_client_id text,
  amount_cfa     bigint not null check (amount_cfa > 0),
  note           text,
  created_at     timestamptz not null default now(),
  unique (merchant_id, operation_id)
);

create index if not exists idx_merchant_credit_ops_partner
  on public.merchant_credit_ops(merchant_id, partner_id, created_at desc);

alter table public.merchant_credit_ops enable row level security;

-- RPC d'enregistrement d'une op de crédit (§22/§28) :
--  - verrou partenaire FOR UPDATE (jamais deux soldes concurrents) ;
--  - idempotence : (merchant_id, operation_id) déjà présent → état courant
--    retourné SANS toucher le solde (created = false) ;
--  - credit → balance_cfa + amount ;
--  - repayment → balance_cfa - amount, SI nouveau solde < 0 → RAISE
--    'REPAYMENT_EXCEEDS_DEBT' (détail = solde courant) ;
--  - retour { operation_id, balance_cfa, created }.
create or replace function public.merchant_record_credit_op(
  p_merchant_id    text,
  p_operation_id   uuid,
  p_kind           text,
  p_partner_id     text,
  p_sale_client_id text default null,
  p_amount_cfa     bigint default null,
  p_note           text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_partner   public.business_partners%rowtype;
  v_existing  public.merchant_credit_ops%rowtype;
  v_new_balance bigint;
begin
  if p_merchant_id is null or not exists
    (select 1 from public.merchants where id = p_merchant_id) then
    raise exception using errcode = '22023', message = 'Marchand introuvable';
  end if;
  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'operation_id obligatoire';
  end if;
  if p_kind not in ('credit', 'repayment') then
    raise exception using errcode = '22023', message = 'Type d''opération de crédit invalide';
  end if;
  if p_amount_cfa is null or p_amount_cfa <= 0 then
    raise exception using errcode = '22023', message = 'Montant invalide';
  end if;

  -- Verrou du partenaire : toutes les lectures/écritures de solde passent
  -- ici, jamais deux ops concurrentes ne lisent le même solde.
  select * into v_partner from public.business_partners
    where id = p_partner_id and merchant_id = p_merchant_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Client introuvable';
  end if;

  -- Idempotence (re-vérifiée sous verrou) : rejeu offline → l'op existante,
  -- le solde courant, SANS rien refaire (§31-32).
  select * into v_existing from public.merchant_credit_ops
    where merchant_id = p_merchant_id and operation_id = p_operation_id;
  if found then
    return jsonb_build_object(
      'operation_id', v_existing.operation_id,
      'balance_cfa', v_partner.balance_cfa,
      'created', false);
  end if;

  if p_kind = 'credit' then
    v_new_balance := v_partner.balance_cfa + p_amount_cfa;
  else
    v_new_balance := v_partner.balance_cfa - p_amount_cfa;
    if v_new_balance < 0 then
      raise exception using errcode = 'P0001',
        message = 'REPAYMENT_EXCEEDS_DEBT',
        detail = jsonb_build_object('balance_cfa', v_partner.balance_cfa)::text;
    end if;
  end if;

  insert into public.merchant_credit_ops
    (merchant_id, operation_id, kind, partner_id, sale_client_id, amount_cfa, note)
  values
    (p_merchant_id, p_operation_id, p_kind, p_partner_id, p_sale_client_id,
     p_amount_cfa, p_note);

  update public.business_partners
    set balance_cfa = v_new_balance
    where id = p_partner_id;

  return jsonb_build_object(
    'operation_id', p_operation_id,
    'balance_cfa', v_new_balance,
    'created', true);
end;
$$;

revoke all on function public.merchant_record_credit_op(text, uuid, text, text, text, bigint, text) from public;
grant execute on function public.merchant_record_credit_op(text, uuid, text, text, text, bigint, text) to service_role;
