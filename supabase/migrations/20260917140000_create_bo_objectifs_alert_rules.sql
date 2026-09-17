-- Migration: objectifs mensuels + alertes & seuils configurables
--
-- 1) legacy_bo_objectifs — objectif mensuel de dossiers, défini depuis le
--    back-office, par identificateur OU par zone entière. C'est la source
--    de vérité de la « mission mensuelle » affichée sur l'app
--    identificateur (boucle complète BO -> terrain) : l'app lit son
--    objectif via GET /api/identificateur/mission (identificateur,
--    sinon zone, sinon repli local).
--
-- 2) legacy_bo_alert_rules — seuils paramétrables du moteur d'alertes BO :
--    dossiers en attente (heures), identificateur inactif (jours), chute
--    de ventes (%), objectif en retard (% de retard vs rythme attendu).
--    Le moteur (POST /api/backoffice/alertes/evaluer) transforme les
--    seuils franchis en lignes legacy_bo_alerts — le BO devient proactif.
--
-- 3) legacy_bo_alerts est étendue d'une clé de déduplication
--    (type + référence + jour) pour qu'une ré-évaluation multiple le même
--    jour ne produise pas des alertes en double.

create table if not exists public.legacy_bo_objectifs (
  id          text primary key default gen_random_uuid()::text,
  scope       text not null check (scope in ('identificateur', 'zone')),
  cible_id    text not null,
  cible_label text not null,
  month       int  not null check (month between 0 and 11),
  year        int  not null,
  target      int  not null check (target > 0),
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (scope, cible_id, month, year)
);

create index if not exists idx_legacy_bo_objectifs_period
  on public.legacy_bo_objectifs(year, month);
create index if not exists idx_legacy_bo_objectifs_cible
  on public.legacy_bo_objectifs(scope, cible_id);

drop trigger if exists set_legacy_bo_objectifs_updated_at on public.legacy_bo_objectifs;
create trigger set_legacy_bo_objectifs_updated_at
  before update on public.legacy_bo_objectifs
  for each row execute function public.set_updated_at();

create table if not exists public.legacy_bo_alert_rules (
  id         text primary key default gen_random_uuid()::text,
  rule_type  text not null unique check (rule_type in (
    'dossiers_en_attente', 'identificateur_inactif', 'chute_ventes', 'objectif_en_retard')),
  threshold  numeric not null check (threshold >= 0),
  enabled    boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_legacy_bo_alert_rules_updated_at on public.legacy_bo_alert_rules;
create trigger set_legacy_bo_alert_rules_updated_at
  before update on public.legacy_bo_alert_rules
  for each row execute function public.set_updated_at();

-- Clé de déduplication des alertes générées par le moteur (jamais posée
-- par les alertes manuelles du seed) : « <type>:<reference>:<AAAA-MM-JJ> ».
-- UNIQUE pour permettre l'upsert PostgREST (onConflict: dedup_key) ; les
-- NULL restent multiples, donc les alertes manuelles cohabitent sans souci.
alter table public.legacy_bo_alerts
  add column if not exists dedup_key text;
create unique index if not exists idx_legacy_bo_alerts_dedup
  on public.legacy_bo_alerts(dedup_key);

-- RLS activée, aucune policy : tables legacy accédées uniquement côté
-- serveur (admin client / device session), cf. migrations legacy 004500.
alter table public.legacy_bo_objectifs enable row level security;
alter table public.legacy_bo_alert_rules enable row level security;
