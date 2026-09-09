-- Migration: Create legacy auth tables for Prisma→Supabase migration
-- These tables support the existing device-session and backoffice-auth systems

-- ============================================================
-- 1. merchants — credential store for PIN/pattern/visual auth
-- ============================================================
create table if not exists public.merchants (
  id           text primary key default gen_random_uuid()::text,
  first_name   text not null,
  last_name    text,
  phone        text not null unique,
  auth_method  text not null default 'pin',
  pin_hash        text,
  pattern_hash    text,
  visual_code_hash text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- 2. producers — credential store for PIN/pattern auth
-- ============================================================
create table if not exists public.producers (
  id           text primary key default gen_random_uuid()::text,
  first_name   text not null,
  phone        text not null unique,
  auth_method  text not null default 'pin',
  pin_hash     text,
  pattern_hash text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- 3. bo_users — backoffice user accounts with email/password
-- ============================================================
create table if not exists public.bo_users (
  id                     text primary key default gen_random_uuid()::text,
  email                  text not null unique,
  password_hash          text not null,
  name                   text not null,
  role                   text not null default 'operateur_terrain',
  zone                   text,
  is_active              boolean not null default true,
  last_login             timestamptz,
  mfa_secret             text,
  force_password_change  boolean not null default false,
  failed_login_attempts  integer not null default 0,
  locked_until           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_bo_users_zone on public.bo_users(zone);
create index if not exists idx_bo_users_role on public.bo_users(role);

-- ============================================================
-- 4. bo_sessions — server-side backoffice sessions
-- ============================================================
create table if not exists public.bo_sessions (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null references public.bo_users(id) on delete cascade,
  token_hash  text not null unique,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  last_used_at timestamptz not null default now(),
  revoked_at  timestamptz
);

create index if not exists idx_bo_sessions_user_id on public.bo_sessions(user_id);

-- ============================================================
-- 5. bo_mfa_challenges — short-lived MFA challenges
-- ============================================================
create table if not exists public.bo_mfa_challenges (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null references public.bo_users(id) on delete cascade,
  code_hash   text not null,
  attempts    integer not null default 0,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_bo_mfa_challenges_user_id on public.bo_mfa_challenges(user_id);

-- ============================================================
-- 6. device_sessions — device binding (first-claim-wins)
-- ============================================================
create table if not exists public.device_sessions (
  id          text primary key default gen_random_uuid()::text,
  subject     text not null unique,
  token_hash  text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists idx_device_sessions_expires_at on public.device_sessions(expires_at);

-- ============================================================
-- 7. legacy_notifications — subject-based notifications (old format)
-- ============================================================
create table if not exists public.legacy_notifications (
  id          text primary key default gen_random_uuid()::text,
  subject     text not null,
  type        text not null,
  title       text not null,
  body        text not null,
  data        text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_legacy_notifications_subject_read on public.legacy_notifications(subject, read);
create index if not exists idx_legacy_notifications_subject_created on public.legacy_notifications(subject, created_at);

-- ============================================================
-- 8. legacy_sync_conflict_reports — subject-based sync conflicts
-- ============================================================
create table if not exists public.legacy_sync_conflict_reports (
  id                 text primary key default gen_random_uuid()::text,
  subject            text not null,
  entity             text not null,
  payload            text not null default '{}',
  message            text not null,
  client_created_at  timestamptz not null,
  reported_at        timestamptz not null default now()
);

create index if not exists idx_legacy_sync_conflict_reports_subject on public.legacy_sync_conflict_reports(subject);
create index if not exists idx_legacy_sync_conflict_reports_reported on public.legacy_sync_conflict_reports(reported_at);

-- ============================================================
-- 9. legacy_audit_logs — old-format audit trail
-- ============================================================
create table if not exists public.legacy_audit_logs (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null,
  user_name   text not null,
  user_email  text not null,
  action      text not null,
  module      text not null,
  details     text,
  ip_address  text,
  user_agent  text,
  signature   text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_legacy_audit_logs_module on public.legacy_audit_logs(module);
create index if not exists idx_legacy_audit_logs_action on public.legacy_audit_logs(action);
create index if not exists idx_legacy_audit_logs_created on public.legacy_audit_logs(created_at);

-- ============================================================
-- 10. RLS — disabled for legacy tables (server-side only, auth handled by app)
-- ============================================================
alter table public.merchants disable row level security;
alter table public.producers disable row level security;
alter table public.bo_users disable row level security;
alter table public.bo_sessions disable row level security;
alter table public.bo_mfa_challenges disable row level security;
alter table public.device_sessions disable row level security;
alter table public.legacy_notifications disable row level security;
alter table public.legacy_sync_conflict_reports disable row level security;
alter table public.legacy_audit_logs disable row level security;

-- ============================================================
-- 11. updated_at triggers for merchants and producers
-- ============================================================
create or replace function public.set_updated_at_legacy()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_merchants_updated_at
  before update on public.merchants
  for each row execute function public.set_updated_at_legacy();

create trigger set_producers_updated_at
  before update on public.producers
  for each row execute function public.set_updated_at_legacy();

create trigger set_bo_users_updated_at
  before update on public.bo_users
  for each row execute function public.set_updated_at_legacy();
