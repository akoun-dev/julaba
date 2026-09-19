-- Migration: MODE-908 (§18) — points de vente multiples du marchand.
-- Un point de vente = un endroit où le marchand vend (boutique, marché
-- Treichville, marché Adjamé, autre emplacement). L'entité est créée par
-- l'appareil (offline-first) puis synchronisée : `client_id` unique porte
-- l'idempotence (rejeu offline = même payload, upsert par client_id —
-- jamais de doublon). Le point actif est une préférence APPAREIL
-- (activePointClientId du store) : aucune colonne is_active ici.
-- Tier service_role : RLS activé sans policy (accès uniquement via le backend).

create table if not exists public.merchant_selling_points (
  id          uuid primary key default gen_random_uuid(),
  merchant_id text not null,
  -- client_id d'idempotence généré par l'appareil (UUID) — unique.
  client_id   text not null unique,
  name        text not null,
  -- Vocabulaire fermé : jamais de valeur inventée côté client.
  kind        text not null default 'autre' check (kind in ('boutique', 'marche', 'autre')),
  -- Archivage (jamais de suppression) : null = point en activité.
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Liste de l'écran « Mes points de vente » : les plus récents d'abord,
-- scoppée au marchand.
create index if not exists idx_merchant_selling_points_merchant_created
  on public.merchant_selling_points(merchant_id, created_at desc);

alter table public.merchant_selling_points enable row level security;
