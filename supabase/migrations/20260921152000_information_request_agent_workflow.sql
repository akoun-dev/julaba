-- Workflow agent pour les demandes d'information issues des dossiers d'enrôlement.
-- La demande reste liée au dossier legacy afin de préserver les parcours existants.
alter table public.legacy_bo_enrolments
  add column if not exists info_workflow_status text
    check (info_workflow_status is null or info_workflow_status in ('a_traiter', 'en_cours', 'repondue', 'traitee')),
  add column if not exists info_requested_at timestamptz,
  add column if not exists info_assigned_to text,
  add column if not exists info_assigned_at timestamptz,
  add column if not exists info_response text,
  add column if not exists info_responded_by text,
  add column if not exists info_responded_at timestamptz,
  add column if not exists info_closed_by text,
  add column if not exists info_closed_at timestamptz;

create index if not exists idx_legacy_bo_enrolments_info_workflow
  on public.legacy_bo_enrolments(info_workflow_status, info_requested_at desc)
  where status = 'info_demandee';

comment on column public.legacy_bo_enrolments.info_workflow_status is
  'Cycle agent : a_traiter, en_cours, repondue, traitee. Ne remplace pas le status métier info_demandee.';
