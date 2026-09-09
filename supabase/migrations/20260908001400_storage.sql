insert into storage.buckets (id, name, public)
values
  ('actor-photos', 'actor-photos', false),
  ('harvest-photos', 'harvest-photos', false),
  ('voice-exports', 'voice-exports', false)
on conflict (id) do nothing;

create policy storage_read_member
on storage.objects for select to authenticated
using (
  bucket_id in ('actor-photos', 'harvest-photos', 'voice-exports')
  and public.is_org_member((storage.foldername(name))[1]::uuid)
);

create policy storage_insert_member
on storage.objects for insert to authenticated
with check (
  bucket_id in ('actor-photos', 'harvest-photos', 'voice-exports')
  and public.is_org_member((storage.foldername(name))[1]::uuid)
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
