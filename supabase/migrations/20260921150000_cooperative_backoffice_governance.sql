-- MODE-943 — gouvernance Back-office des coopératives.
-- Étend le module opérationnel MODE-921 sans créer un deuxième annuaire :
-- cooperative_membres reste la source de vérité des adhésions marchands.

alter table public.cooperatives
  add column if not exists nom_usuel text,
  add column if not exists sigle text,
  add column if not exists numero_enregistrement text,
  add column if not exists type_cooperative text,
  add column if not exists filieres text[] not null default '{}',
  add column if not exists description text,
  add column if not exists telephone text,
  add column if not exists email text,
  add column if not exists adresse text,
  add column if not exists region text,
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists statut text not null default 'active',
  add column if not exists date_adhesion_julaba date,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid,
  add column if not exists informations_complementaires jsonb not null default '{}'::jsonb;

-- Les anciennes coopératives inactives deviennent suspendues, pas supprimées.
update public.cooperatives set statut = case when actif then 'active' else 'suspendue' end
where statut is null or statut = 'active';

alter table public.cooperatives
  drop constraint if exists cooperatives_statut_check,
  add constraint cooperatives_statut_check check (statut in ('brouillon','en_attente_validation','active','suspendue','archivee')),
  add constraint cooperatives_gps_pair_check check ((latitude is null) = (longitude is null));
create unique index if not exists cooperatives_numero_enregistrement_unique
  on public.cooperatives(numero_enregistrement) where numero_enregistrement is not null;
create index if not exists cooperatives_statut_region_idx on public.cooperatives(statut, region);

create table if not exists public.cooperative_roles (
  id uuid primary key default gen_random_uuid(),
  cooperative_id uuid references public.cooperatives(id) on delete cascade,
  code text not null,
  libelle text not null,
  est_systeme boolean not null default false,
  created_at timestamptz not null default now(),
  unique(cooperative_id, code)
);

create table if not exists public.cooperative_permissions (
  code text primary key,
  libelle text not null,
  module text not null
);

create table if not exists public.cooperative_role_permissions (
  role_id uuid not null references public.cooperative_roles(id) on delete cascade,
  permission_code text not null references public.cooperative_permissions(code) on delete restrict,
  primary key(role_id, permission_code)
);

create table if not exists public.cooperative_member_roles (
  id uuid primary key default gen_random_uuid(),
  cooperative_membre_id uuid not null references public.cooperative_membres(id) on delete restrict,
  role_id uuid not null references public.cooperative_roles(id) on delete restrict,
  est_principal boolean not null default false,
  assigned_by uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique(cooperative_membre_id, role_id, started_at)
);
create unique index if not exists cooperative_member_one_primary_role
  on public.cooperative_member_roles(cooperative_membre_id) where est_principal and ended_at is null;

create table if not exists public.cooperative_invitations (
  id uuid primary key default gen_random_uuid(),
  cooperative_id uuid not null references public.cooperatives(id) on delete restrict,
  canal text not null check (canal in ('telephone','email')),
  destination text not null,
  merchant_id text references public.merchants(id) on delete set null,
  statut text not null default 'envoyee' check (statut in ('envoyee','acceptee','refusee','annulee','expiree')),
  expires_at timestamptz not null,
  sent_by uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cooperative_documents (
  id uuid primary key default gen_random_uuid(),
  cooperative_id uuid not null references public.cooperatives(id) on delete restrict,
  type text not null,
  nom text not null,
  storage_path text not null,
  version integer not null default 1 check (version > 0),
  statut text not null default 'valide' check (statut in ('brouillon','valide','expire','remplace')),
  expires_at date,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.cooperative_audit_logs (
  id uuid primary key default gen_random_uuid(),
  cooperative_id uuid not null references public.cooperatives(id) on delete restrict,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cooperative_audit_logs_coop_created_idx on public.cooperative_audit_logs(cooperative_id, created_at desc);

-- Le client n'accède jamais directement aux données de gouvernance.
alter table public.cooperative_roles enable row level security;
alter table public.cooperative_permissions enable row level security;
alter table public.cooperative_role_permissions enable row level security;
alter table public.cooperative_member_roles enable row level security;
alter table public.cooperative_invitations enable row level security;
alter table public.cooperative_documents enable row level security;
alter table public.cooperative_audit_logs enable row level security;

-- Catalogue initial. Les rôles par coopérative peuvent être ajoutés ensuite.
insert into public.cooperative_permissions(code, libelle, module) values
 ('coop.view','Consulter la coopérative','coop'), ('coop.edit','Modifier la coopérative','coop'),
 ('coop.manage_members','Gérer les membres','coop'), ('coop.manage_roles','Gérer les rôles','coop'),
 ('coop.manage_permissions','Gérer les permissions','coop'), ('production.view','Consulter les productions','production'),
 ('production.create','Créer une production','production'), ('production.edit','Modifier une production','production'),
 ('harvest.view','Consulter les récoltes','harvest'), ('harvest.create','Créer une récolte','harvest'),
 ('harvest.edit','Modifier une récolte','harvest'), ('stock.view','Consulter le stock','stock'),
 ('stock.create','Créer un stock','stock'), ('stock.adjust','Ajuster le stock','stock'),
 ('stock.transfer','Transférer le stock','stock'), ('sales.view','Consulter les ventes','sales'),
 ('sales.create','Créer une vente','sales'), ('sales.cancel','Annuler une vente','sales'),
 ('orders.view','Consulter les commandes','orders'), ('orders.create','Créer une commande','orders'),
 ('orders.manage','Gérer les commandes','orders'), ('finance.view','Consulter la finance','finance'),
 ('finance.manage','Gérer la finance','finance'), ('reports.view','Consulter les rapports','reports')
on conflict (code) do nothing;

-- Une adhésion garde son identité et son historique ; jamais de DELETE côté client.
create or replace function public.prevent_cooperative_audit_mutation()
returns trigger language plpgsql as $$ begin raise exception 'cooperative_audit_logs is append-only'; end $$;
drop trigger if exists cooperative_audit_logs_immutable on public.cooperative_audit_logs;
create trigger cooperative_audit_logs_immutable before update or delete on public.cooperative_audit_logs
for each row execute function public.prevent_cooperative_audit_mutation();
