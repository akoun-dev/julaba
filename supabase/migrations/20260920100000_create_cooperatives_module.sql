-- Migration: MODE-921 (§1-3) — module Coopérative.
--
-- Deux espaces vivent sur ces tables :
--   • le COOPÉRATEUR (président) : compte auth propre (téléphone + PIN/schéma,
--     miroir producers/merchants) qui possède UNE coopérative (responsable_id
--     UNIQUE — une coopérative par responsable, comme julaba-app) ;
--   • les MARCHANDS membres : adhésion (cooperative_membres), cotisation,
--     dépôt de besoin d'achat groupé, réception de distributions du pot commun.
--
-- L'argent (cooperative_transactions) suit le même principe que la
-- trésorerie de julaba-app : workflow en_attente → validee/annulee — le
-- solde ne compte QUE les entrées/sorties VALIDÉES. La cotisation d'un
-- membre est une entrée catégorie 'cotisation' posée directement 'validee'.
--
-- Le pot commun (cooperative_stock + cooperative_stock_mouvements) est
-- append-only : l'apport upsert la ligne courante + pose un mouvement
-- 'apport' ; la distribution refuse tout dépassement (jamais de stock
-- négatif, côté route) et pose UN mouvement par destinataire.
--
-- RLS activée sur toutes les tables : l'accès applicatif passe exclusivement
-- par les routes serveur (admin client + device session), comme pour
-- producers/merchants — aucune policy permissive n'est créée (deny-all).

-- ── 1. Comptes coopérateurs (auth) ─────────────────────────────────────
create table if not exists public.cooperateurs (
  id           text primary key default gen_random_uuid()::text,
  first_name   text not null,
  phone        text not null unique,
  auth_method  text not null default 'pin',
  pin_hash     text,
  pattern_hash text,
  sexe         text check (sexe is null or sexe in ('masculin', 'feminin', 'autre')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists set_cooperateurs_updated_at on public.cooperateurs;
create trigger set_cooperateurs_updated_at
  before update on public.cooperateurs
  for each row execute function public.set_updated_at_legacy();
alter table public.cooperateurs enable row level security;

-- ── 2. Coopératives ────────────────────────────────────────────────────
create table if not exists public.cooperatives (
  id             uuid primary key default gen_random_uuid(),
  nom            text not null check (length(trim(nom)) between 2 and 120),
  responsable_id text not null unique references public.cooperateurs(id) on delete cascade,
  commune        text,
  actif          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_cooperatives_responsable
  on public.cooperatives(responsable_id);
create index if not exists idx_cooperatives_actif
  on public.cooperatives(actif);

drop trigger if exists set_cooperatives_updated_at on public.cooperatives;
create trigger set_cooperatives_updated_at
  before update on public.cooperatives
  for each row execute function public.set_updated_at_legacy();
alter table public.cooperatives enable row level security;

-- ── 3. Membres (marchands adhérents) ───────────────────────────────────
create table if not exists public.cooperative_membres (
  id               uuid primary key default gen_random_uuid(),
  cooperative_id   uuid not null references public.cooperatives(id) on delete cascade,
  membre_id        text not null references public.merchants(id) on delete cascade,
  -- actif : adhésion acceptée / suspendu : sanction temporaire / en_attente :
  -- demande en cours / exclu : sanction définitive.
  statut           text not null default 'en_attente'
                   check (statut in ('actif', 'suspendu', 'en_attente', 'exclu')),
  -- president = chef de groupe (promotion possible par le responsable) —
  -- le RESPONSABLE de la coopérative est cooperatives.responsable_id, pas ici.
  role             text not null default 'membre' check (role in ('membre', 'president')),
  date_adhesion    date,
  cotisation_payee boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (cooperative_id, membre_id)
);

create index if not exists idx_cooperative_membres_coop
  on public.cooperative_membres(cooperative_id, statut);
create index if not exists idx_cooperative_membres_membre
  on public.cooperative_membres(membre_id, statut);

drop trigger if exists set_cooperative_membres_updated_at on public.cooperative_membres;
create trigger set_cooperative_membres_updated_at
  before update on public.cooperative_membres
  for each row execute function public.set_updated_at_legacy();
alter table public.cooperative_membres enable row level security;

-- ── 4. Trésorerie (registre interne à double validation) ──────────────
create table if not exists public.cooperative_transactions (
  id             uuid primary key default gen_random_uuid(),
  cooperative_id uuid not null references public.cooperatives(id) on delete cascade,
  type           text not null check (type in ('entree', 'sortie')),
  -- cotisation | vente_groupee | achat_groupe | commission | frais |
  -- subvention | autre — liberté laissée à la route (default 'autre').
  categorie      text not null default 'autre',
  montant        numeric(15, 2) not null check (montant > 0),
  membre_id      text references public.merchants(id) on delete set null,
  description    text,
  -- Le solde ne compte que 'validee' : une écriture créée par le président
  -- démarre 'en_attente' (validation/annulation = même président).
  statut         text not null default 'en_attente'
                 check (statut in ('en_attente', 'validee', 'annulee')),
  created_by     text references public.cooperateurs(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_cooperative_transactions_coop_date
  on public.cooperative_transactions(cooperative_id, created_at desc);

drop trigger if exists set_cooperative_transactions_updated_at on public.cooperative_transactions;
create trigger set_cooperative_transactions_updated_at
  before update on public.cooperative_transactions
  for each row execute function public.set_updated_at_legacy();
alter table public.cooperative_transactions enable row level security;

-- ── 5. Pot commun (stock) — ligne courante + journal append-only ──────
create table if not exists public.cooperative_stock (
  id             uuid primary key default gen_random_uuid(),
  cooperative_id uuid not null references public.cooperatives(id) on delete cascade,
  produit        text not null,
  categorie      text,
  quantite       numeric(15, 2) not null default 0 check (quantite >= 0),
  unite          text not null default 'kg',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (cooperative_id, produit)
);

create index if not exists idx_cooperative_stock_coop
  on public.cooperative_stock(cooperative_id, produit);

drop trigger if exists set_cooperative_stock_updated_at on public.cooperative_stock;
create trigger set_cooperative_stock_updated_at
  before update on public.cooperative_stock
  for each row execute function public.set_updated_at_legacy();
alter table public.cooperative_stock enable row level security;

create table if not exists public.cooperative_stock_mouvements (
  id             uuid primary key default gen_random_uuid(),
  cooperative_id uuid not null references public.cooperatives(id) on delete cascade,
  produit        text not null,
  unite          text not null default 'kg',
  type           text not null check (type in ('apport', 'distribution')),
  quantite       numeric(15, 2) not null check (quantite > 0),
  -- Apporteur (type apport) ou destinataire (type distribution).
  membre_id      text references public.merchants(id) on delete set null,
  besoin_id      uuid,
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_cooperative_stock_mouvements_coop
  on public.cooperative_stock_mouvements(cooperative_id, produit, created_at desc);
create index if not exists idx_cooperative_stock_mouvements_membre
  on public.cooperative_stock_mouvements(membre_id, type, created_at desc);

alter table public.cooperative_stock_mouvements enable row level security;

-- ── 6. Besoins des membres (achats groupés) ───────────────────────────
create table if not exists public.cooperative_besoins (
  id                 uuid primary key default gen_random_uuid(),
  cooperative_id     uuid not null references public.cooperatives(id) on delete cascade,
  marchand_id        text not null references public.merchants(id) on delete cascade,
  produit            text not null,
  categorie          text,
  quantite           numeric(15, 2) not null check (quantite > 0),
  unite              text not null default 'kg',
  prix_max           numeric(15, 2),
  priorite           text not null default 'normale' check (priorite in ('normale', 'urgente')),
  -- en_attente (déposé) → consolide (groupé) → en_cours → approuve → livre.
  statut             text not null default 'en_attente'
                     check (statut in ('en_attente', 'consolide', 'en_cours', 'approuve', 'livre')),
  notes              text,
  date_besoin        date,
  -- Dispatch (rempli par le président lors du traitement) :
  quantite_attribuee numeric(15, 2),
  prix_achat         numeric(15, 2),
  prix_dispatch      numeric(15, 2),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_cooperative_besoins_coop_statut
  on public.cooperative_besoins(cooperative_id, statut, created_at desc);
create index if not exists idx_cooperative_besoins_marchand
  on public.cooperative_besoins(marchand_id, created_at desc);

drop trigger if exists set_cooperative_besoins_updated_at on public.cooperative_besoins;
create trigger set_cooperative_besoins_updated_at
  before update on public.cooperative_besoins
  for each row execute function public.set_updated_at_legacy();
alter table public.cooperative_besoins enable row level security;
