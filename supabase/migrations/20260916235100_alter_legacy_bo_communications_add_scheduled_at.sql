-- Migration: legacy_bo_communications — colonne scheduled_at (envoi planifié)
-- L'écran Communication proposait « Planifié » avec une date, mais la date
-- n'était jamais transmise à l'API : la communication restait un brouillon
-- anonyme et n'était jamais envoyée. Cette colonne porte la date d'envoi
-- cible ; le listage backoffice déclenche l'envoi (statut envoyee + sent_at,
-- livraison simulée faute de passerelle SMS/email) de toute communication
-- dont scheduled_at est échue, et l'envoi manuel la réinitialise.

alter table public.legacy_bo_communications
  add column if not exists scheduled_at timestamptz;

create index if not exists idx_legacy_bo_communications_scheduled_at
  on public.legacy_bo_communications(scheduled_at)
  where status = 'brouillon' and scheduled_at is not null;
