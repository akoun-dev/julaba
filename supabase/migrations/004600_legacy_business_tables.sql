-- Migration: Create legacy business tables for Prisma→Supabase migration
-- These tables match the Prisma schema exactly (text IDs, no organization_id)
-- They allow the old API routes to work with Supabase queries

-- ============================================================
-- 1. legacy_products
-- ============================================================
create table if not exists public.legacy_products (
  id          text primary key default gen_random_uuid()::text,
  merchant_id text not null,
  client_id   text unique,
  name        text not null,
  category    text not null default 'autre',
  price_unit  integer not null default 0,
  stock_qty   integer not null default 0,
  image_url   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_legacy_products_merchant_id on public.legacy_products(merchant_id);

-- ============================================================
-- 2. legacy_sales
-- ============================================================
create table if not exists public.legacy_sales (
  id               text primary key default gen_random_uuid()::text,
  merchant_id      text not null,
  session_id       text,
  client_id        text unique,
  total_amount     integer not null default 0,
  change_amount    integer not null default 0,
  amount_received  integer not null default 0,
  is_voice_sale    boolean not null default false,
  voice_transcript text,
  note             text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_legacy_sales_merchant_id on public.legacy_sales(merchant_id);

-- ============================================================
-- 3. legacy_sale_items
-- ============================================================
create table if not exists public.legacy_sale_items (
  id           text primary key default gen_random_uuid()::text,
  sale_id      text not null references public.legacy_sales(id) on delete cascade,
  product_id   text,
  product_name text not null,
  quantity     integer not null,
  unit_price   integer not null,
  subtotal     integer not null
);

create index if not exists idx_legacy_sale_items_sale_id on public.legacy_sale_items(sale_id);

-- ============================================================
-- 4. legacy_expenses
-- ============================================================
create table if not exists public.legacy_expenses (
  id               text primary key default gen_random_uuid()::text,
  merchant_id      text not null,
  client_id        text unique,
  amount           integer not null,
  category         text not null,
  description      text,
  is_voice         boolean not null default false,
  voice_transcript text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_legacy_expenses_merchant_id on public.legacy_expenses(merchant_id);

-- ============================================================
-- 5. legacy_caisse_sessions
-- ============================================================
create table if not exists public.legacy_caisse_sessions (
  id             text primary key default gen_random_uuid()::text,
  merchant_id    text not null,
  fond_de_caisse integer not null default 0,
  total_ventes   integer not null default 0,
  total_depenses integer not null default 0,
  total_final    integer not null default 0,
  is_open        boolean not null default true,
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz
);

create index if not exists idx_legacy_caisse_sessions_merchant_id on public.legacy_caisse_sessions(merchant_id);

-- ============================================================
-- 6. legacy_tontines
-- ============================================================
create table if not exists public.legacy_tontines (
  id           text primary key default gen_random_uuid()::text,
  name         text not null,
  amount       integer not null default 0,
  frequency    text not null default 'mensuel',
  member_count integer not null default 0,
  next_due_date timestamptz,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- 7. legacy_tontine_members
-- ============================================================
create table if not exists public.legacy_tontine_members (
  id          text primary key default gen_random_uuid()::text,
  tontine_id  text not null references public.legacy_tontines(id) on delete cascade,
  merchant_id text not null,
  joined_at   timestamptz not null default now()
);

create index if not exists idx_legacy_tontine_members_tontine_id on public.legacy_tontine_members(tontine_id);
create index if not exists idx_legacy_tontine_members_merchant_id on public.legacy_tontine_members(merchant_id);

-- ============================================================
-- 8. legacy_tontine_contributions
-- ============================================================
create table if not exists public.legacy_tontine_contributions (
  id          text primary key default gen_random_uuid()::text,
  tontine_id  text not null,
  merchant_id text not null,
  amount      integer not null,
  client_id   text unique,
  created_at  timestamptz not null default now()
);

create index if not exists idx_legacy_tontine_contributions_tontine_id on public.legacy_tontine_contributions(tontine_id);
create index if not exists idx_legacy_tontine_contributions_merchant_id on public.legacy_tontine_contributions(merchant_id);

-- ============================================================
-- 9. legacy_voice_logs
-- ============================================================
create table if not exists public.legacy_voice_logs (
  id            text primary key default gen_random_uuid()::text,
  merchant_id   text not null,
  transcript    text not null,
  intent        text,
  confidence    real,
  response_text text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_legacy_voice_logs_merchant_id on public.legacy_voice_logs(merchant_id);

-- ============================================================
-- 10. legacy_bo_actors
-- ============================================================
create table if not exists public.legacy_bo_actors (
  id                  text primary key default gen_random_uuid()::text,
  actor_id            text not null unique,
  first_name          text not null,
  last_name           text,
  type                text not null default 'marchand',
  phone               text not null,
  zone                text not null,
  status              text not null default 'actif',
  photo_url           text,
  gps_lat             real,
  gps_lng             real,
  identificateur_name text,
  identificateur_id   text,
  validated_by        text,
  validated_at        timestamptz,
  notes               text,
  merchant_id         text unique,
  producteur_id       text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_legacy_bo_actors_zone on public.legacy_bo_actors(zone);
create index if not exists idx_legacy_bo_actors_status on public.legacy_bo_actors(status);
create index if not exists idx_legacy_bo_actors_type on public.legacy_bo_actors(type);
create index if not exists idx_legacy_bo_actors_identificateur_id on public.legacy_bo_actors(identificateur_id);

-- ============================================================
-- 11. legacy_bo_zones
-- ============================================================
create table if not exists public.legacy_bo_zones (
  id                    text primary key default gen_random_uuid()::text,
  name                  text not null unique,
  region                text not null,
  identificateur_count  integer not null default 0,
  actor_count           integer not null default 0,
  target                integer not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ============================================================
-- 12. legacy_bo_missions
-- ============================================================
create table if not exists public.legacy_bo_missions (
  id            text primary key default gen_random_uuid()::text,
  title         text not null,
  description   text,
  zone          text not null,
  assignee_id   text,
  assignee_name text,
  status        text not null default 'en_cours',
  target_count  integer not null default 0,
  current_count integer not null default 0,
  start_date    timestamptz not null,
  end_date      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_legacy_bo_missions_zone on public.legacy_bo_missions(zone);
create index if not exists idx_legacy_bo_missions_status on public.legacy_bo_missions(status);
create index if not exists idx_legacy_bo_missions_assignee_id on public.legacy_bo_missions(assignee_id);

-- ============================================================
-- 13. legacy_bo_enrolments
-- ============================================================
create table if not exists public.legacy_bo_enrolments (
  id                   text primary key default gen_random_uuid()::text,
  dossier_id           text not null unique,
  actor_name           text not null,
  actor_type           text not null default 'marchand',
  zone                 text not null,
  identificateur_id    text,
  identificateur_name  text not null,
  status               text not null default 'en_attente',
  has_photo            boolean not null default false,
  has_gps              boolean not null default false,
  phone                text not null,
  submitted_at         timestamptz not null default now(),
  validated_by         text,
  validated_at         timestamptz,
  reject_reason        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_legacy_bo_enrolments_zone on public.legacy_bo_enrolments(zone);
create index if not exists idx_legacy_bo_enrolments_status on public.legacy_bo_enrolments(status);
create index if not exists idx_legacy_bo_enrolments_identificateur_id on public.legacy_bo_enrolments(identificateur_id);

-- ============================================================
-- 14. legacy_bo_alerts
-- ============================================================
create table if not exists public.legacy_bo_alerts (
  id            text primary key default gen_random_uuid()::text,
  severity      text not null default 'moyenne',
  title         text not null,
  message       text not null,
  module        text not null,
  acknowledged  boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists idx_legacy_bo_alerts_module on public.legacy_bo_alerts(module);
create index if not exists idx_legacy_bo_alerts_acknowledged on public.legacy_bo_alerts(acknowledged);

-- ============================================================
-- 15. legacy_bo_institutions
-- ============================================================
create table if not exists public.legacy_bo_institutions (
  id             text primary key default gen_random_uuid()::text,
  name           text not null,
  type           text not null,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  address        text,
  linked_actors  integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ============================================================
-- 16. legacy_bo_mutations
-- ============================================================
create table if not exists public.legacy_bo_mutations (
  id            text primary key default gen_random_uuid()::text,
  actor_id      text not null,
  actor_name    text not null,
  from_zone     text not null,
  to_zone       text not null,
  reason        text,
  status        text not null default 'en_attente',
  requested_by  text,
  requested_at  timestamptz not null default now(),
  processed_by  text,
  processed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_legacy_bo_mutations_actor_id on public.legacy_bo_mutations(actor_id);
create index if not exists idx_legacy_bo_mutations_status on public.legacy_bo_mutations(status);

-- ============================================================
-- 17. legacy_bo_moderation_reports
-- ============================================================
create table if not exists public.legacy_bo_moderation_reports (
  id           text primary key default gen_random_uuid()::text,
  target_type  text not null,
  target_id    text,
  target_name  text,
  reason       text not null,
  severity     text not null default 'moyenne',
  status       text not null default 'en_attente',
  reported_by  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_legacy_bo_moderation_reports_status on public.legacy_bo_moderation_reports(status);
create index if not exists idx_legacy_bo_moderation_reports_target on public.legacy_bo_moderation_reports(target_type, target_id);

-- ============================================================
-- 18. legacy_bo_contents
-- ============================================================
create table if not exists public.legacy_bo_contents (
  id           text primary key default gen_random_uuid()::text,
  title        text not null,
  type         text not null,
  category     text,
  content      text not null,
  excerpt      text,
  author       text,
  status       text not null default 'publie',
  difficulty   text default 'debutant',
  duration     text,
  target_role  text,
  media_url    text,
  sort_order   integer not null default 0,
  view_count   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_legacy_bo_contents_status on public.legacy_bo_contents(status);
create index if not exists idx_legacy_bo_contents_type on public.legacy_bo_contents(type);

-- ============================================================
-- 19. legacy_bo_communications
-- ============================================================
create table if not exists public.legacy_bo_communications (
  id            text primary key default gen_random_uuid()::text,
  title         text not null,
  type          text not null,
  content       text not null,
  target_group  text not null,
  target_zone   text,
  status        text not null default 'envoyee',
  sent_count    integer not null default 0,
  delivery_rate real,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_legacy_bo_communications_status on public.legacy_bo_communications(status);

-- ============================================================
-- 20. legacy_bo_api_keys
-- ============================================================
create table if not exists public.legacy_bo_api_keys (
  id            text primary key default gen_random_uuid()::text,
  name          text not null,
  description   text,
  key           text not null unique,
  secret_hash   text not null,
  permissions   text not null default 'read',
  request_count integer not null default 0,
  last_used_at  timestamptz,
  expires_at    timestamptz,
  is_active     boolean not null default true,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_legacy_bo_api_keys_is_active on public.legacy_bo_api_keys(is_active);

-- ============================================================
-- 21. legacy_bo_deliveries
-- ============================================================
create table if not exists public.legacy_bo_deliveries (
  id               text primary key default gen_random_uuid()::text,
  order_id         text,
  sender_name      text not null,
  sender_phone     text not null,
  recipient_name   text not null,
  recipient_phone  text not null,
  address          text not null,
  zone             text not null,
  status           text not null default 'en_attente',
  courier_name     text,
  pickup_at        timestamptz,
  delivered_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_legacy_bo_deliveries_zone on public.legacy_bo_deliveries(zone);
create index if not exists idx_legacy_bo_deliveries_status on public.legacy_bo_deliveries(status);

-- ============================================================
-- 22. legacy_bo_cron_jobs
-- ============================================================
create table if not exists public.legacy_bo_cron_jobs (
  id              text primary key default gen_random_uuid()::text,
  name            text not null,
  schedule        text not null,
  command         text,
  status          text not null default 'actif',
  last_run_at     timestamptz,
  next_run_at     timestamptz,
  duration_ms     integer,
  run_count       integer not null default 0,
  avg_duration_ms integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_legacy_bo_cron_jobs_status on public.legacy_bo_cron_jobs(status);

-- ============================================================
-- 23. legacy_bo_credit_scores
-- ============================================================
create table if not exists public.legacy_bo_credit_scores (
  id                 text primary key default gen_random_uuid()::text,
  actor_id           text not null,
  actor_name         text not null,
  zone               text not null,
  score              integer not null,
  risk_level         text not null,
  credit_limit       integer,
  last_calculated_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_legacy_bo_credit_scores_actor_id on public.legacy_bo_credit_scores(actor_id);
create index if not exists idx_legacy_bo_credit_scores_zone on public.legacy_bo_credit_scores(zone);
create index if not exists idx_legacy_bo_credit_scores_risk_level on public.legacy_bo_credit_scores(risk_level);

-- ============================================================
-- 24. legacy_bo_keiwa_accounts
-- ============================================================
create table if not exists public.legacy_bo_keiwa_accounts (
  id                text primary key default gen_random_uuid()::text,
  holder_name       text not null,
  holder_phone      text not null,
  zone              text,
  balance           integer not null default 0,
  transaction_count integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_legacy_bo_keiwa_accounts_zone on public.legacy_bo_keiwa_accounts(zone);

-- ============================================================
-- 25. legacy_bo_keiwa_transactions
-- ============================================================
create table if not exists public.legacy_bo_keiwa_transactions (
  id               text primary key default gen_random_uuid()::text,
  type             text not null,
  amount           integer not null,
  sender_name      text,
  sender_phone     text,
  recipient_name   text,
  recipient_phone  text,
  account_id       text references public.legacy_bo_keiwa_accounts(id),
  status           text not null default 'termine',
  created_at       timestamptz not null default now()
);

-- ============================================================
-- 26. legacy_bo_platform_configs
-- ============================================================
create table if not exists public.legacy_bo_platform_configs (
  id         text primary key default gen_random_uuid()::text,
  category   text not null unique,
  config     text not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 27. legacy_bo_system_events
-- ============================================================
create table if not exists public.legacy_bo_system_events (
  id         text primary key default gen_random_uuid()::text,
  level      text not null default 'INFO',
  source     text not null,
  message    text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_legacy_bo_system_events_level on public.legacy_bo_system_events(level);
create index if not exists idx_legacy_bo_system_events_created on public.legacy_bo_system_events(created_at);

-- ============================================================
-- 28. legacy_producteur_recoltes
-- ============================================================
create table if not exists public.legacy_producteur_recoltes (
  id                    text primary key default gen_random_uuid()::text,
  producteur_id         text not null,
  produit               text not null,
  quantite_kg           real not null,
  qualite               text not null,
  date_recolte          timestamptz not null,
  parcelle              text not null default '',
  prix_souhaite_par_kg  integer not null default 0,
  photos                text not null default '[]',
  statut                text not null default 'brouillon',
  acheteur              text,
  montant_vente         integer,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_legacy_producteur_recoltes_producteur_id on public.legacy_producteur_recoltes(producteur_id);
create index if not exists idx_legacy_producteur_recoltes_statut on public.legacy_producteur_recoltes(statut);

-- ============================================================
-- 29. legacy_producteur_commandes
-- ============================================================
create table if not exists public.legacy_producteur_commandes (
  id                         text primary key default gen_random_uuid()::text,
  producteur_id              text not null,
  reference                  text not null unique,
  acheteur_nom               text not null,
  produit                    text not null,
  quantite_kg                real not null default 0,
  montant                    integer not null default 0,
  date_livraison_souhaitee   timestamptz not null default now(),
  statut                     text not null default 'a_traiter',
  urgent                     boolean not null default false,
  transporteur               text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists idx_legacy_producteur_commandes_producteur_id on public.legacy_producteur_commandes(producteur_id);
create index if not exists idx_legacy_producteur_commandes_statut on public.legacy_producteur_commandes(statut);

-- ============================================================
-- 30. legacy_producteur_journals
-- ============================================================
create table if not exists public.legacy_producteur_journals (
  id            text primary key default gen_random_uuid()::text,
  producteur_id text not null,
  cycle_id      text not null,
  date          timestamptz not null,
  texte         text not null,
  photo_url     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_legacy_producteur_journals_cycle_id on public.legacy_producteur_journals(cycle_id);
create index if not exists idx_legacy_producteur_journals_producteur_id on public.legacy_producteur_journals(producteur_id);

-- ============================================================
-- RLS disabled for all legacy tables (server-side auth handled by app)
-- ============================================================
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'legacy_products', 'legacy_sales', 'legacy_sale_items', 'legacy_expenses',
      'legacy_caisse_sessions', 'legacy_tontines', 'legacy_tontine_members',
      'legacy_tontine_contributions', 'legacy_voice_logs',
      'legacy_bo_actors', 'legacy_bo_zones', 'legacy_bo_missions',
      'legacy_bo_enrolments', 'legacy_bo_alerts', 'legacy_bo_institutions',
      'legacy_bo_mutations', 'legacy_bo_moderation_reports', 'legacy_bo_contents',
      'legacy_bo_communications', 'legacy_bo_api_keys', 'legacy_bo_deliveries',
      'legacy_bo_cron_jobs', 'legacy_bo_credit_scores',
      'legacy_bo_keiwa_accounts', 'legacy_bo_keiwa_transactions',
      'legacy_bo_platform_configs', 'legacy_bo_system_events',
      'legacy_producteur_recoltes', 'legacy_producteur_commandes', 'legacy_producteur_journals'
    ])
  loop
    execute format('alter table public.%I disable row level security', t);
  end loop;
end $$;

-- updated_at triggers for tables that have it
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'legacy_products', 'legacy_bo_actors', 'legacy_bo_zones',
      'legacy_bo_missions', 'legacy_bo_enrolments', 'legacy_bo_institutions',
      'legacy_bo_mutations', 'legacy_bo_moderation_reports', 'legacy_bo_contents',
      'legacy_bo_communications', 'legacy_bo_api_keys', 'legacy_bo_deliveries',
      'legacy_bo_cron_jobs', 'legacy_bo_credit_scores',
      'legacy_bo_keiwa_accounts', 'legacy_bo_platform_configs',
      'legacy_producteur_recoltes', 'legacy_producteur_commandes', 'legacy_producteur_journals'
    ])
  loop
    execute format(
      'create trigger set_%s_updated_at before update on public.%I for each row execute function public.set_updated_at_legacy()',
      t, t
    );
  end loop;
end $$;
