-- Harden loyalty enforcement at the database boundary.
-- Client/API filtering is not sufficient for rewards and usage limits.

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
  v_rule public.loyalty_rules%rowtype;
  v_rule_count integer;
  v_period_start timestamptz;
begin
  if p_subject_id is null or length(trim(p_subject_id)) < 1 then
    raise exception using errcode = '22023', message = 'subject_id obligatoire';
  end if;
  if p_operation_id is null or length(trim(p_operation_id)) < 1 then
    raise exception using errcode = '22023', message = 'operation_id obligatoire';
  end if;
  if p_points = 0 then
    raise exception using errcode = '22023', message = 'points non nuls';
  end if;
  if p_kind in ('EARN', 'BONUS') and p_points < 0 then
    raise exception using errcode = '22023', message = 'points positifs requis';
  end if;
  if p_kind in ('REDEEM', 'EXPIRATION') and p_points > 0 then
    raise exception using errcode = '22023', message = 'points négatifs requis';
  end if;

  select id into v_program
  from public.loyalty_programs
  where code = p_program_code and status = 'active'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now());
  if v_program is null then
    raise exception using errcode = 'P0002', message = 'Programme fidélité indisponible';
  end if;

  insert into public.loyalty_accounts(program_id, subject_id, subject_role)
  values (v_program, p_subject_id, p_subject_role)
  on conflict (program_id, subject_id) do nothing;

  select * into v_account
  from public.loyalty_accounts
  where program_id = v_program and subject_id = p_subject_id
  for update;

  if v_account.subject_role <> p_subject_role then
    raise exception using errcode = '42501', message = 'Profil fidélité incohérent';
  end if;
  if v_account.status <> 'active' then
    raise exception using errcode = 'P0005', message = 'Compte fidélité inactif';
  end if;

  select * into v_tx
  from public.loyalty_transactions
  where account_id = v_account.id and operation_id = p_operation_id;
  if v_tx.id is not null then
    return jsonb_build_object('idempotent', true, 'transactionId', v_tx.id, 'balance', v_account.points_balance);
  end if;

  if p_points < 0 and v_account.points_balance + p_points < 0 then
    raise exception using errcode = 'P0001', message = 'Solde de points insuffisant';
  end if;

  if p_rule_id is not null then
    select * into v_rule from public.loyalty_rules where id = p_rule_id and program_id = v_program;
    if v_rule.id is not null and v_rule.limit_count is not null then
      v_period_start := case v_rule.period
        when 'day' then date_trunc('day', now())
        when 'week' then date_trunc('week', now())
        when 'month' then date_trunc('month', now())
        else null
      end;
      select count(*)::integer into v_rule_count
      from public.loyalty_transactions
      where account_id = v_account.id and rule_id = p_rule_id and status = 'posted'
        and (v_period_start is null or created_at >= v_period_start);
      if v_rule_count >= v_rule.limit_count then
        raise exception using errcode = 'P0007', message = 'Limite de règle atteinte';
      end if;
    end if;
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
  v_usage_count integer;
begin
  select id into v_program
  from public.loyalty_programs
  where code = p_program_code and status = 'active'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now());
  if v_program is null then
    raise exception using errcode = 'P0002', message = 'Programme fidélité indisponible';
  end if;

  select * into v_reward
  from public.loyalty_rewards
  where id = p_reward_id and program_id = v_program
  for update;
  if v_reward.id is null or v_reward.status <> 'active'
    or (v_reward.starts_at is not null and v_reward.starts_at > now())
    or (v_reward.ends_at is not null and v_reward.ends_at <= now())
    or (not ('all' = any(v_reward.target_roles)) and not (p_subject_role = any(v_reward.target_roles))) then
    raise exception using errcode = 'P0003', message = 'Récompense indisponible';
  end if;

  insert into public.loyalty_accounts(program_id, subject_id, subject_role)
  values (v_program, p_subject_id, p_subject_role)
  on conflict (program_id, subject_id) do nothing;
  select * into v_account from public.loyalty_accounts
  where program_id = v_program and subject_id = p_subject_id for update;
  if v_account.subject_role <> p_subject_role then
    raise exception using errcode = '42501', message = 'Profil fidélité incohérent';
  end if;
  if v_account.status <> 'active' then
    raise exception using errcode = 'P0005', message = 'Compte fidélité inactif';
  end if;

  select * into v_redemption from public.loyalty_redemptions
  where account_id = v_account.id and operation_id = p_operation_id;
  if v_redemption.id is not null then
    return jsonb_build_object('idempotent', true, 'redemptionId', v_redemption.id, 'balance', v_account.points_balance);
  end if;

  select count(*)::integer into v_usage_count
  from public.loyalty_redemptions
  where reward_id = v_reward.id and account_id = v_account.id
    and status in ('issued', 'used');
  if v_reward.usage_limit is not null and v_usage_count >= v_reward.usage_limit then
    raise exception using errcode = 'P0006', message = 'Limite d’utilisation atteinte';
  end if;
  if v_account.points_balance < v_reward.cost_points then
    raise exception using errcode = 'P0001', message = 'Solde de points insuffisant';
  end if;
  if v_reward.stock_available is not null and v_reward.stock_available <= 0 then
    raise exception using errcode = 'P0004', message = 'Récompense épuisée';
  end if;

  v_tx := public.loyalty_post_transaction(p_subject_id, p_subject_role, p_program_code, 'redeem:' || p_operation_id, 'REDEEM', -v_reward.cost_points, 'reward', p_reward_id::text, 'Utilisation de la récompense ' || v_reward.name, null, null, p_device_id, p_metadata);
  v_tx_id := (v_tx->>'transactionId')::uuid;
  insert into public.loyalty_redemptions(account_id, reward_id, operation_id, transaction_id, points_spent, metadata)
  values (v_account.id, v_reward.id, p_operation_id, v_tx_id, v_reward.cost_points, coalesce(p_metadata, '{}'::jsonb))
  returning * into v_redemption;
  if v_reward.stock_available is not null then
    update public.loyalty_rewards set stock_available = stock_available - 1 where id = v_reward.id;
  end if;
  return jsonb_build_object('idempotent', false, 'redemptionId', v_redemption.id, 'transactionId', v_tx_id, 'balance', (v_tx->>'balance')::integer);
end;
$$;

revoke all on function public.loyalty_post_transaction(text,text,text,text,text,integer,text,text,text,uuid,timestamptz,text,jsonb) from public, anon, authenticated;
revoke all on function public.loyalty_redeem_reward(text,text,text,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.loyalty_post_transaction(text,text,text,text,text,integer,text,text,text,uuid,timestamptz,text,jsonb) to service_role;
grant execute on function public.loyalty_redeem_reward(text,text,text,uuid,text,text,jsonb) to service_role;
