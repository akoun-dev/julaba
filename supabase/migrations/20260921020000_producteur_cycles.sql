-- Task 98-B (audit producteur 97-B1 #2) — le carnet de champ et les cycles
-- culturaux du producteur étaient des écrans MORTS : aucun endpoint, aucune
-- table, store jamais écrit (cycleEnCours/cyclesTermines restés à null/[]),
-- et POST /api/producteur/journal (exigeant cycleId) injoignable depuis
-- addJournalEntry. Le seed de démo référait même un « cycle-mais-2026 »
-- sans table correspondante.
--
-- Cette migration crée la table des cycles, alignée sur les tables legacy
-- producteur existantes (id text, producteur_id text, RLS enabled sans
-- policy = accès service_role serveur uniquement, trigger updated_at).

create table if not exists public.legacy_producteur_cycles (
  id                   text primary key default gen_random_uuid()::text,
  producteur_id        text not null,
  produit              text not null,
  parcelle             text not null default '',
  date_semis           timestamptz not null,
  date_recolte_prevue  timestamptz not null,
  -- en_cours : le cycle est semé et suivi ; termine : récolte clôturée.
  statut               text not null default 'en_cours'
                       check (statut in ('en_cours', 'termine')),
  quantite_recoltee_kg real,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_legacy_producteur_cycles_producteur
  on public.legacy_producteur_cycles(producteur_id, statut);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_producteur_cycles enable row level security;

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_producteur_cycles_updated_at on public.legacy_producteur_cycles;
create trigger set_legacy_producteur_cycles_updated_at
  before update on public.legacy_producteur_cycles
  for each row execute function public.set_updated_at_legacy();
