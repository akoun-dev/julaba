-- Keep the conflict ledger correlated with the canonical mutation contract.
alter table public.legacy_sync_conflict_reports
  add column if not exists operation_id text;

create index if not exists idx_legacy_sync_conflicts_operation
  on public.legacy_sync_conflict_reports(operation_id)
  where operation_id is not null;
