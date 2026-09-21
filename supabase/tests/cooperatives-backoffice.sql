-- MODE-943 — contrat structurel et sécurité de la gouvernance coopérative.
begin;
select plan(8);

select has_table('public', 'cooperative_roles', 'cooperative_roles existe');
select has_table('public', 'cooperative_invitations', 'cooperative_invitations existe');
select has_table('public', 'cooperative_documents', 'cooperative_documents existe');
select has_table('public', 'cooperative_audit_logs', 'cooperative_audit_logs existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.cooperative_audit_logs'::regclass),
  true, 'le journal coopérative est protégé par RLS');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.cooperative_documents'::regclass),
  true, 'les documents coopérative sont protégés par RLS');
select has_index('public', 'cooperative_member_one_primary_role', 'un seul rôle principal actif par membre');
select has_index('public', 'cooperatives_numero_enregistrement_unique', 'numéro d’enregistrement unique lorsqu’il existe');

select * from finish();
rollback;
