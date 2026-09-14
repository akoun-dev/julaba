-- The "Modération" backoffice screen has always let an admin add a
-- resolution note and a reporter role when closing a report, and shows a
-- free-text description of the incident, but legacy_bo_moderation_reports
-- had no columns for any of them.
alter table public.legacy_bo_moderation_reports
  add column if not exists reporter_role text,
  add column if not exists description text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution_note text;
