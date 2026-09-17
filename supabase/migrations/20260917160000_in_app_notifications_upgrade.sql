-- Migration: système de notifications in-app enrichi (Task 28)
-- Étend legacy_notifications avec : sévérité, catégorie métier, priorité,
-- clé de déduplication, expiration, archivage, action de navigation,
-- métadonnées et origine (serveur ou appareil). Rétrocompatible : toutes
-- les colonnes ajoutées ont des défauts, l'union de types existante
-- (bienvenue, sync_conflict, …) reste intacte.

alter table public.legacy_notifications
  add column if not exists category         text not null default 'systeme',
  add column if not exists severity         text not null default 'info',
  add column if not exists priority         text not null default 'normal',
  add column if not exists deduplication_key text,
  add column if not exists read_at          timestamptz,
  add column if not exists archived_at      timestamptz,
  add column if not exists expires_at       timestamptz,
  add column if not exists action_label     text,
  add column if not exists action_route     text,
  add column if not exists action_data      jsonb,
  add column if not exists metadata         jsonb,
  add column if not exists origin           text not null default 'server';

-- Backfill : sévérité et catégorie dérivées des 11 types existants, pour
-- que les notifications créées avant cette migration s'affichent comme les
-- nouvelles.
update public.legacy_notifications set
  severity = case
    when type in ('sync_conflict', 'dossier_rejete') then 'error'
    when type in ('dossier_valide', 'tontine_cotisation', 'tontine_creation', 'commande_recue') then 'success'
    when type in ('supplier_order', 'keiwa_transaction') then 'info'
    else 'info'
  end,
  category = case
    when type in ('sync_conflict', 'annonce') then 'synchronisation'
    when type in ('tontine_cotisation', 'tontine_creation') then 'tontine'
    when type = 'commande_recue' then 'commande'
    when type = 'supplier_order' then 'commande'
    when type = 'keiwa_transaction' then 'keiwa'
    when type in ('dossier_valide', 'dossier_rejete', 'dossier_info_demandee') then 'systeme'
    when type = 'bienvenue' then 'securite'
    else 'systeme'
  end
where category = 'systeme' and severity = 'info';

-- Priorités : conflits de synchronisation et rejets de dossier méritent
-- plus qu'un « normal » (ils demandent une action de l'utilisateur).
update public.legacy_notifications set priority = 'high'
where type in ('sync_conflict', 'dossier_rejete') and priority = 'normal';

-- Déduplication : une clé (subject, deduplication_key) identifiée ne peut
-- exister qu'une fois — les retries réseau, re-sync offline et événements
-- reçus plusieurs fois ne créent plus de doublons (ON CONFLICT DO NOTHING
-- côté code applicatif).
create unique index if not exists uq_legacy_notifications_subject_dedup
  on public.legacy_notifications (subject, deduplication_key)
  where deduplication_key is not null;

-- Index de lecture du centre : filtres par catégorie et compteur non-lus.
create index if not exists idx_legacy_notifications_subject_created_desc
  on public.legacy_notifications (subject, created_at desc);
create index if not exists idx_legacy_notifications_subject_category
  on public.legacy_notifications (subject, category);
create index if not exists idx_legacy_notifications_subject_expires
  on public.legacy_notifications (subject, expires_at)
  where expires_at is not null;

-- Purge : les notifications temporaires expirées et les archivées anciennes
-- sont supprimables sans perte (l'historique utile reste). Conçue pour un
-- passage périodique (bo-cron / pg_cron), idempotente et best-effort.
create or replace function public.purge_expired_notifications(
  p_archived_retention_days integer default 30
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.legacy_notifications
  where (expires_at is not null and expires_at < now())
     or (archived_at is not null and archived_at < now() - make_interval(days => p_archived_retention_days));
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Realtime : le canal utilisé par l'app est un broadcast émis par le
-- serveur (signal {id} sans contenu — voir src/lib/notifications/server
-- et la limite documentée), donc postgres_changes n'est PAS activé sur
-- cette table : avec une RLS sans policy (modèle device-session, pas
-- auth.users), un canal postgres_changes serait soit muet, soit — avec une
-- policy permissive — lisible par n'importe quel client anon.
comment on table public.legacy_notifications is
  'Notifications in-app des acteurs (device-session). Colonnes Task 28 : severity, category, priority, deduplication_key, expiry, archivage, action de navigation, origin. Realtime = broadcast signal-only côté serveur.';
