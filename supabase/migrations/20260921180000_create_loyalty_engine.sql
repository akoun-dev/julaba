-- Jùlaba Loyalty Engine — multi-profils, sans challenges ni parrainage.
-- Tous les montants de points sont des entiers. Le solde est dérivé du ledger
-- et maintenu dans loyalty_accounts uniquement comme cache transactionnel.

create table if not exists public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.loyalty_levels (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  threshold_points integer not null default 0 check (threshold_points >= 0),
  sort_order integer not null default 0,
  benefits jsonb not null default '[]'::jsonb check (jsonb_typeof(benefits) = 'array'),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, code),
  unique (program_id, threshold_points)
);

create table if not exists public.loyalty_rules (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  name text not null,
  description text,
  action_type text not null check (action_type in ('sale', 'purchase', 'order_completed', 'harvest', 'cooperative_activity', 'payment', 'activity', 'manual_bonus')),
  target_roles text[] not null default array['all']::text[],
  condition jsonb not null default '{}'::jsonb check (jsonb_typeof(condition) = 'object'),
  points integer not null check (points > 0),
  points_per integer check (points_per is null or points_per > 0),
  limit_count integer check (limit_count is null or limit_count > 0),
  period text not null default 'transaction' check (period in ('transaction', 'day', 'week', 'month', 'program')),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.loyalty_programs(id) on delete restrict,
  subject_id text not null,
  subject_role text not null check (subject_role in ('marchand', 'producteur', 'grossiste', 'semi_grossiste', 'cooperateur', 'cooperative')),
  points_balance integer not null default 0 check (points_balance >= 0),
  points_earned integer not null default 0 check (points_earned >= 0),
  points_redeemed integer not null default 0 check (points_redeemed >= 0),
  points_expired integer not null default 0 check (points_expired >= 0),
  current_level_id uuid references public.loyalty_levels(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, subject_id)
);

create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.loyalty_accounts(id) on delete restrict,
  operation_id text not null,
  kind text not null check (kind in ('EARN', 'REDEEM', 'REVERSAL', 'EXPIRATION', 'ADJUSTMENT', 'BONUS')),
  points integer not null check (points <> 0),
  source text not null,
  source_id text,
  rule_id uuid references public.loyalty_rules(id) on delete set null,
  original_transaction_id uuid references public.loyalty_transactions(id) on delete restrict,
  description text not null,
  expires_at timestamptz,
  status text not null default 'posted' check (status in ('posted', 'voided')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  device_id text,
  created_at timestamptz not null default now(),
  unique (account_id, operation_id),
  check ((kind in ('EARN', 'BONUS') and points > 0) or (kind in ('REDEEM', 'REVERSAL', 'EXPIRATION', 'ADJUSTMENT')))
);

create table if not exists public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  reward_type text not null check (reward_type in ('COUPON', 'DISCOUNT', 'CASHBACK', 'ADVANTAGE', 'PROMOTION')),
  cost_points integer not null check (cost_points > 0),
  value_cfa integer check (value_cfa is null or value_cfa >= 0),
  target_roles text[] not null default array['all']::text[],
  stock_available integer check (stock_available is null or stock_available >= 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, code),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.loyalty_accounts(id) on delete restrict,
  reward_id uuid not null references public.loyalty_rewards(id) on delete restrict,
  operation_id text not null,
  transaction_id uuid references public.loyalty_transactions(id) on delete restrict,
  points_spent integer not null check (points_spent > 0),
  status text not null default 'issued' check (status in ('issued', 'used', 'cancelled', 'expired')),
  issued_at timestamptz not null default now(),
  used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (account_id, operation_id)
);

create table if not exists public.loyalty_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id text,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists loyalty_accounts_subject_idx on public.loyalty_accounts(subject_id, subject_role);
create index if not exists loyalty_transactions_account_created_idx on public.loyalty_transactions(account_id, created_at desc);
create index if not exists loyalty_transactions_source_idx on public.loyalty_transactions(source, source_id);
create index if not exists loyalty_rules_active_idx on public.loyalty_rules(program_id, status, action_type);
create index if not exists loyalty_rewards_active_idx on public.loyalty_rewards(program_id, status);

create trigger loyalty_programs_updated_at before update on public.loyalty_programs for each row execute function public.set_updated_at();
create trigger loyalty_levels_updated_at before update on public.loyalty_levels for each row execute function public.set_updated_at();
create trigger loyalty_rules_updated_at before update on public.loyalty_rules for each row execute function public.set_updated_at();
create trigger loyalty_accounts_updated_at before update on public.loyalty_accounts for each row execute function public.set_updated_at();
create trigger loyalty_rewards_updated_at before update on public.loyalty_rewards for each row execute function public.set_updated_at();

alter table public.loyalty_programs enable row level security;
alter table public.loyalty_levels enable row level security;
alter table public.loyalty_rules enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.loyalty_redemptions enable row level security;
alter table public.loyalty_audit_logs enable row level security;

-- Le frontend passe par les routes serveur et ne reçoit aucun droit d'écriture
-- direct. Les policies de lecture self sont limitées aux entités personnelles;
-- le service_role utilisé par les routes contourne RLS après vérification.
create policy loyalty_accounts_self_read on public.loyalty_accounts for select to authenticated
using (subject_id = (select auth.uid())::text);
create policy loyalty_transactions_self_read on public.loyalty_transactions for select to authenticated
using (account_id in (select id from public.loyalty_accounts where subject_id = (select auth.uid())::text));
create policy loyalty_redemptions_self_read on public.loyalty_redemptions for select to authenticated
using (account_id in (select id from public.loyalty_accounts where subject_id = (select auth.uid())::text));
create policy loyalty_rewards_active_read on public.loyalty_rewards for select to authenticated
using (status = 'active' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));

insert into public.loyalty_programs (code, name, description, status)
values ('julaba-default', 'Avantages Jùlaba', 'Programme de fidélité multi-profils Jùlaba', 'active')
on conflict (code) do nothing;

insert into public.loyalty_levels (program_id, code, name, description, threshold_points, sort_order)
select id, v.code, v.name, v.description, v.threshold_points, v.sort_order
from public.loyalty_programs p
cross join (values
  ('nouveau', 'Nouveau', 'Compte fidélité nouvellement ouvert', 0, 0),
  ('actif', 'Actif', 'Activité régulière sur Jùlaba', 500, 1),
  ('regulier', 'Régulier', 'Participation régulière aux activités', 1500, 2),
  ('partenaire', 'Partenaire', 'Partenaire actif de l’écosystème Jùlaba', 5000, 3)
) as v(code, name, description, threshold_points, sort_order)
where p.code = 'julaba-default'
on conflict (program_id, code) do nothing;

create or replace function public.loyalty_refresh_level(p_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level uuid;
  v_program uuid;
  v_balance integer;
begin
  select program_id, points_balance into v_program, v_balance
  from public.loyalty_accounts where id = p_account_id for update;
  select id into v_level
  from public.loyalty_levels
  where program_id = v_program and status = 'active' and threshold_points <= v_balance
  order by threshold_points desc, sort_order desc
  limit 1;
  update public.loyalty_accounts set current_level_id = v_level where id = p_account_id;
  return v_level;
end;
$$;

create or replace function public.loyalty_post_transaction(
  p_subject_id text,
  p_subject_role text,
  p_program_code text,
  p_operation_id text,
  p_kind text,
  p_points integer,
  p_source text,
  p_source_id text default null,
  p_description text default '',
  p_rule_id uuid default null,
  p_expires_at timestamptz default null,
  p_device_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program uuid;
  v_account public.loyalty_accounts%rowtype;
  v_tx public.loyalty_transactions%rowtype;
  v_level uuid;
begin
  if p_subject_id is null or length(trim(p_subject_id)) < 1 then raise exception using errcode = '22023', message = 'subject_id obligatoire'; end if;
  if p_operation_id is null or length(trim(p_operation_id)) < 1 then raise exception using errcode = '22023', message = 'operation_id obligatoire'; end if;
  if p_points = 0 then raise exception using errcode = '22023', message = 'points non nuls'; end if;
  select id into v_program from public.loyalty_programs where code = p_program_code and status = 'active'
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now());
  if v_program is null then raise exception using errcode = 'P0002', message = 'Programme fidélité indisponible'; end if;
  insert into public.loyalty_accounts(program_id, subject_id, subject_role)
  values (v_program, p_subject_id, p_subject_role)
  on conflict (program_id, subject_id) do nothing;
  select * into v_account from public.loyalty_accounts where program_id = v_program and subject_id = p_subject_id for update;
  select * into v_tx from public.loyalty_transactions where account_id = v_account.id and operation_id = p_operation_id;
  if v_tx.id is not null then
    return jsonb_build_object('idempotent', true, 'transactionId', v_tx.id, 'balance', v_account.points_balance);
  end if;
  if p_points < 0 and v_account.points_balance + p_points < 0 then
    raise exception using errcode = 'P0001', message = 'Solde de points insuffisant';
  end if;
  insert into public.loyalty_transactions(account_id, operation_id, kind, points, source, source_id, rule_id, description, expires_at, device_id, metadata)
  values (v_account.id, p_operation_id, p_kind, p_points, p_source, p_source_id, p_rule_id, coalesce(nullif(trim(p_description), ''), p_source), p_expires_at, p_device_id, coalesce(p_metadata, '{}'::jsonb))
  returning * into v_tx;
  update public.loyalty_accounts
  set points_balance = points_balance + p_points,
      points_earned = points_earned + case when p_points > 0 then p_points else 0 end,
      points_redeemed = points_redeemed + case when p_kind = 'REDEEM' then abs(p_points) else 0 end,
      points_expired = points_expired + case when p_kind = 'EXPIRATION' then abs(p_points) else 0 end
  where id = v_account.id
  returning * into v_account;
  v_level := public.loyalty_refresh_level(v_account.id);
  return jsonb_build_object('idempotent', false, 'transactionId', v_tx.id, 'accountId', v_account.id, 'balance', v_account.points_balance, 'levelId', v_level);
end;
$$;

create or replace function public.loyalty_redeem_reward(
  p_subject_id text,
  p_subject_role text,
  p_program_code text,
  p_reward_id uuid,
  p_operation_id text,
  p_device_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program uuid;
  v_account public.loyalty_accounts%rowtype;
  v_reward public.loyalty_rewards%rowtype;
  v_redemption public.loyalty_redemptions%rowtype;
  v_tx jsonb;
  v_tx_id uuid;
begin
  select id into v_program from public.loyalty_programs where code = p_program_code and status = 'active';
  if v_program is null then raise exception using errcode = 'P0002', message = 'Programme fidélité indisponible'; end if;
  select * into v_reward from public.loyalty_rewards where id = p_reward_id and program_id = v_program for update;
  if v_reward.id is null or v_reward.status <> 'active' or (v_reward.starts_at is not null and v_reward.starts_at > now()) or (v_reward.ends_at is not null and v_reward.ends_at <= now()) then
    raise exception using errcode = 'P0003', message = 'Récompense indisponible';
  end if;
  insert into public.loyalty_accounts(program_id, subject_id, subject_role) values (v_program, p_subject_id, p_subject_role) on conflict (program_id, subject_id) do nothing;
  select * into v_account from public.loyalty_accounts where program_id = v_program and subject_id = p_subject_id for update;
  select * into v_redemption from public.loyalty_redemptions where account_id = v_account.id and operation_id = p_operation_id;
  if v_redemption.id is not null then return jsonb_build_object('idempotent', true, 'redemptionId', v_redemption.id, 'balance', v_account.points_balance); end if;
  if v_account.points_balance < v_reward.cost_points then raise exception using errcode = 'P0001', message = 'Solde de points insuffisant'; end if;
  if v_reward.stock_available is not null and v_reward.stock_available <= 0 then raise exception using errcode = 'P0004', message = 'Récompense épuisée'; end if;
  v_tx := public.loyalty_post_transaction(p_subject_id, p_subject_role, p_program_code, 'redeem:' || p_operation_id, 'REDEEM', -v_reward.cost_points, 'reward', p_reward_id::text, 'Utilisation de la récompense ' || v_reward.name, null, null, p_device_id, p_metadata);
  v_tx_id := (v_tx->>'transactionId')::uuid;
  insert into public.loyalty_redemptions(account_id, reward_id, operation_id, transaction_id, points_spent, metadata)
  values (v_account.id, v_reward.id, p_operation_id, v_tx_id, v_reward.cost_points, coalesce(p_metadata, '{}'::jsonb)) returning * into v_redemption;
  if v_reward.stock_available is not null then update public.loyalty_rewards set stock_available = stock_available - 1 where id = v_reward.id; end if;
  return jsonb_build_object('idempotent', false, 'redemptionId', v_redemption.id, 'transactionId', v_tx_id, 'balance', (v_tx->>'balance')::integer);
end;
$$;

revoke all on function public.loyalty_post_transaction(text,text,text,text,text,integer,text,text,text,uuid,timestamptz,text,jsonb) from public, anon, authenticated;
revoke all on function public.loyalty_redeem_reward(text,text,text,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.loyalty_post_transaction(text,text,text,text,text,integer,text,text,text,uuid,timestamptz,text,jsonb) to service_role;
grant execute on function public.loyalty_redeem_reward(text,text,text,uuid,text,text,jsonb) to service_role;
