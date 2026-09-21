begin;

select plan(174);

select has_table('public', 'organizations', 'organizations existe');
select has_table('public', 'products', 'products existe');
select has_table('public', 'cash_sessions', 'sessions de caisse existent');
select has_table('public', 'tontines', 'tontines existent');
select has_table('public', 'tontine_members', 'membres de tontine existent');
select has_table('public', 'tontine_contributions', 'cotisations de tontine existent');
select has_table('public', 'harvests', 'récoltes existent');
select has_table('public', 'producer_orders', 'commandes producteur existent');
select has_table('public', 'producer_journals', 'journal producteur existe');
select has_table('public', 'actors', 'acteurs existent');
select has_table('public', 'enrolments', 'dossiers d''enrôlement existent');
select has_table('public', 'missions', 'missions existent');
select has_table('public', 'mutations', 'mutations de zone existent');
select has_function('public', 'submit_enrolment', ARRAY['uuid', 'text', 'text', 'text', 'uuid', 'text', 'boolean', 'boolean', 'double precision', 'double precision'], 'RPC soumission enrôlement existe');
select has_function('public', 'validate_enrolment', ARRAY['uuid', 'text'], 'RPC validation enrôlement existe');
select has_function('public', 'write_audit_event', ARRAY['uuid', 'text', 'text', 'text', 'jsonb'], 'helper audit existe');
select has_function('public', 'write_system_notification', ARRAY['uuid', 'uuid', 'text', 'text', 'text', 'jsonb'], 'helper notification existe');
select has_table('public', 'roles', 'catalogue rôles existe');
select has_table('public', 'permissions', 'catalogue permissions existe');
select has_table('public', 'role_permissions', 'catalogue rôle/permission existe');
select has_table('public', 'alerts', 'alertes existent');
select has_table('public', 'institutions', 'institutions existent');
select has_table('public', 'moderation_reports', 'rapports de modération existent');
select has_table('public', 'training_contents', 'contenus de formation existent');
select has_table('public', 'communications', 'communications existent');
select has_table('public', 'api_keys', 'clés API existent');
select has_table('public', 'deliveries', 'livraisons existent');
select has_table('public', 'cron_jobs', 'jobs cron existent');
select has_table('public', 'credit_scores', 'scores de crédit existent');
select has_table('public', 'keiwa_accounts', 'comptes Keiwa existent');
select has_table('public', 'keiwa_transactions', 'transactions Keiwa existent');
select has_table('public', 'platform_configs', 'configurations plateforme existent');
select has_table('public', 'system_events', 'événements système existent');
select has_table('public', 'voice_logs', 'journaux vocaux existent');
select has_function('public', 'write_system_event', ARRAY['uuid', 'text', 'text', 'text', 'jsonb'], 'helper événement système existe');
select has_function('public', 'record_tontine_contribution', ARRAY['uuid', 'uuid', 'bigint', 'uuid'], 'RPC cotisation existe');
select has_function('public', 'is_org_member', ARRAY['uuid'], 'fonction de périmètre existe');
select has_function('public', 'create_sale', ARRAY['uuid', 'uuid', 'bigint', 'text', 'jsonb', 'uuid'], 'RPC de vente existe');
select has_function('public', 'open_cash_session', ARRAY['uuid', 'bigint', 'uuid'], 'RPC ouverture caisse existe');
select has_function('public', 'close_cash_session', ARRAY['uuid', 'uuid'], 'RPC clôture caisse existe');
select policies_are('public', 'organizations', ARRAY[
  'organizations_member_read'
], 'policies organizations présentes');
select policies_are('public', 'profiles', ARRAY[
  'profiles_self_read', 'profiles_self_update'
], 'policies profiles présentes');
select policies_are('public', 'zones', ARRAY[
  'zones_member_read'
], 'policies zones présentes');
select policies_are('public', 'organization_members', ARRAY[
  'members_self_read'
], 'policies membres présentes');
select policies_are('public', 'devices', ARRAY[
  'devices_owner_read'
], 'policies appareils présentes');
select policies_are('public', 'products', ARRAY[
  'products_read_scope', 'products_insert_owner', 'products_update_owner'
], 'policies products présentes');
select policies_are('public', 'sales', ARRAY[
  'sales_read_scope', 'sales_insert_owner', 'sales_update_owner'
], 'policies ventes présentes');
select policies_are('public', 'sale_items', ARRAY[
  'sale_items_read_scope', 'sale_items_insert_owner'
], 'policies lignes de vente présentes');
select policies_are('public', 'stock_movements', ARRAY[
  'stock_read_scope', 'stock_insert_owner'
], 'policies stock présentes');
select policies_are('public', 'expenses', ARRAY[
  'expenses_owner_scope'
], 'policies dépenses présentes');
select policies_are('public', 'notifications', ARRAY[
  'notifications_owner_scope', 'notifications_owner_update'
], 'policies notifications présentes');
select policies_are('public', 'sync_conflict_reports', ARRAY[
  'conflicts_owner_insert', 'conflicts_owner_read'
], 'policies conflits présentes');
select policies_are('public', 'audit_events', ARRAY[
  'audit_admin_read'
], 'policies audit présentes');
select policies_are('storage', 'objects', ARRAY[
  'storage_read_member', 'storage_insert_member'
], 'policies Storage présentes');
select policies_are('public', 'cash_sessions', ARRAY[
  'cash_sessions_read_scope', 'cash_sessions_insert_owner', 'cash_sessions_update_owner'
], 'policies caisse présentes');
select has_index('public', 'products', 'products_scope_idx', 'index produits présent');
select has_index('public', 'cash_sessions', 'cash_sessions_one_open_idx', 'index session ouverte unique présent');
select policies_are('public', 'tontines', ARRAY[
  'tontines_read_scope', 'tontines_admin_insert', 'tontines_admin_update'
], 'policies tontines présentes');
select policies_are('public', 'tontine_members', ARRAY[
  'tontine_members_read_scope', 'tontine_members_admin_insert', 'tontine_members_admin_delete'
], 'policies membres de tontine présentes');
select policies_are('public', 'tontine_contributions', ARRAY[
  'tontine_contributions_read_scope', 'tontine_contributions_insert'
], 'policies cotisations présentes');
select policies_are('public', 'harvests', ARRAY[
  'harvests_read_scope', 'harvests_insert_owner', 'harvests_update_owner'
], 'policies récoltes présentes');
select policies_are('public', 'producer_orders', ARRAY[
  'producer_orders_read_scope', 'producer_orders_insert_owner', 'producer_orders_update_owner'
], 'policies commandes producteur présentes');
select policies_are('public', 'producer_journals', ARRAY[
  'producer_journals_read_scope', 'producer_journals_insert_owner', 'producer_journals_update_owner'
], 'policies journal producteur présentes');
select policies_are('public', 'actors', ARRAY[
  'actors_read_scope', 'actors_admin_insert', 'actors_admin_update'
], 'policies acteurs présentes');
select policies_are('public', 'enrolments', ARRAY[
  'enrolments_read_scope', 'enrolments_insert', 'enrolments_admin_update'
], 'policies enrôlements présentes');
select policies_are('public', 'missions', ARRAY[
  'missions_read_scope', 'missions_admin_insert', 'missions_admin_update'
], 'policies missions présentes');
select policies_are('public', 'mutations', ARRAY[
  'mutations_read_scope', 'mutations_admin_insert', 'mutations_admin_update'
], 'policies mutations présentes');
select policies_are('public', 'roles', ARRAY['roles_read_all'], 'policies rôles présentes');
select policies_are('public', 'permissions', ARRAY['permissions_read_all'], 'policies permissions présentes');
select policies_are('public', 'role_permissions', ARRAY['role_permissions_read_all'], 'policies rôle/permission présentes');
select policies_are('public', 'alerts', ARRAY[
  'alerts_admin_read', 'alerts_admin_insert', 'alerts_admin_update'
], 'policies alertes présentes');
select policies_are('public', 'institutions', ARRAY[
  'institutions_admin_read', 'institutions_admin_insert', 'institutions_admin_update', 'institutions_admin_delete'
], 'policies institutions présentes');
select policies_are('public', 'moderation_reports', ARRAY[
  'moderation_read_scope', 'moderation_insert_scope', 'moderation_update_scope'
], 'policies modération présentes');
select policies_are('public', 'training_contents', ARRAY[
  'training_read_scope', 'training_admin_insert', 'training_admin_update', 'training_admin_delete'
], 'policies contenus présentes');
select policies_are('public', 'communications', ARRAY[
  'communications_admin_read', 'communications_admin_insert', 'communications_admin_update'
], 'policies communications présentes');
select policies_are('public', 'api_keys', ARRAY[
  'api_keys_super_read', 'api_keys_super_insert', 'api_keys_super_update', 'api_keys_super_delete'
], 'policies clés API présentes');
select policies_are('public', 'deliveries', ARRAY[
  'deliveries_admin_read', 'deliveries_admin_insert', 'deliveries_admin_update'
], 'policies livraisons présentes');
select policies_are('public', 'cron_jobs', ARRAY[
  'cron_super_read', 'cron_super_write', 'cron_super_update'
], 'policies cron présentes');
select policies_are('public', 'credit_scores', ARRAY[
  'credit_scores_admin_read', 'credit_scores_admin_insert', 'credit_scores_admin_update'
], 'policies scores présentes');
select policies_are('public', 'keiwa_accounts', ARRAY[
  'keiwa_accounts_admin_read', 'keiwa_accounts_admin_insert', 'keiwa_accounts_admin_update'
], 'policies comptes Keiwa présentes');
select policies_are('public', 'keiwa_transactions', ARRAY[
  'keiwa_transactions_admin_read', 'keiwa_transactions_admin_insert'
], 'policies transactions Keiwa présentes');
select policies_are('public', 'platform_configs', ARRAY[
  'platform_configs_super_read', 'platform_configs_super_write', 'platform_configs_super_update'
], 'policies configurations présentes');
select policies_are('public', 'system_events', ARRAY[
  'system_events_super_read'
], 'policies événements système présentes');
select policies_are('public', 'voice_logs', ARRAY[
  'voice_logs_read_scope', 'voice_logs_insert_owner'
], 'policies journaux vocaux présentes');
select is((select count(*) from public.roles), 8::bigint, 'catalogue : 8 rôles seedés');
select is((select count(*) from public.role_permissions), 75::bigint, 'catalogue : 75 droits seedés');


-- Verrouillage service_role : 45 tables legacy/auth/PII passées sous RLS
-- (migrations 2026091622xxxx_create_enable_rls_*) : aucune policy publique,
-- accès uniquement via le client service_role qui contourne le RLS.

select has_table('public', 'bo_users', 'table bo_users existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.bo_users'::regclass),
  true, 'RLS activé sur bo_users');

select has_table('public', 'bo_sessions', 'table bo_sessions existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.bo_sessions'::regclass),
  true, 'RLS activé sur bo_sessions');

-- AUDIT-005 : bo_mfa_challenges SUPPRIMÉE (migration 20260922100000) —
-- MODE-961 a retiré le MFA du back-office ; table morte retirée du schéma
-- et de ce plan de tests (176 → 174 assertions).

select has_table('public', 'device_sessions', 'table device_sessions existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.device_sessions'::regclass),
  true, 'RLS activé sur device_sessions');

select has_table('public', 'legacy_bo_api_keys', 'table legacy_bo_api_keys existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_api_keys'::regclass),
  true, 'RLS activé sur legacy_bo_api_keys');

select has_table('public', 'merchants', 'table merchants existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.merchants'::regclass),
  true, 'RLS activé sur merchants');

select has_table('public', 'producers', 'table producers existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.producers'::regclass),
  true, 'RLS activé sur producers');

select has_table('public', 'legacy_bo_actors', 'table legacy_bo_actors existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_actors'::regclass),
  true, 'RLS activé sur legacy_bo_actors');

select has_table('public', 'legacy_bo_enrolments', 'table legacy_bo_enrolments existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_enrolments'::regclass),
  true, 'RLS activé sur legacy_bo_enrolments');

select has_table('public', 'legacy_bo_identificateurs', 'table legacy_bo_identificateurs existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_identificateurs'::regclass),
  true, 'RLS activé sur legacy_bo_identificateurs');

select has_table('public', 'legacy_keiwa_wallets', 'table legacy_keiwa_wallets existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_keiwa_wallets'::regclass),
  true, 'RLS activé sur legacy_keiwa_wallets');

select has_table('public', 'legacy_keiwa_transactions', 'table legacy_keiwa_transactions existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_keiwa_transactions'::regclass),
  true, 'RLS activé sur legacy_keiwa_transactions');

select has_table('public', 'legacy_bo_keiwa_accounts', 'table legacy_bo_keiwa_accounts existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_keiwa_accounts'::regclass),
  true, 'RLS activé sur legacy_bo_keiwa_accounts');

select has_table('public', 'legacy_bo_keiwa_transactions', 'table legacy_bo_keiwa_transactions existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_keiwa_transactions'::regclass),
  true, 'RLS activé sur legacy_bo_keiwa_transactions');

select has_table('public', 'legacy_caisse_sessions', 'table legacy_caisse_sessions existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_caisse_sessions'::regclass),
  true, 'RLS activé sur legacy_caisse_sessions');

select has_table('public', 'legacy_products', 'table legacy_products existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_products'::regclass),
  true, 'RLS activé sur legacy_products');

select has_table('public', 'legacy_sales', 'table legacy_sales existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_sales'::regclass),
  true, 'RLS activé sur legacy_sales');

select has_table('public', 'legacy_sale_items', 'table legacy_sale_items existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_sale_items'::regclass),
  true, 'RLS activé sur legacy_sale_items');

select has_table('public', 'legacy_expenses', 'table legacy_expenses existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_expenses'::regclass),
  true, 'RLS activé sur legacy_expenses');

select has_table('public', 'legacy_supplier_orders', 'table legacy_supplier_orders existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_supplier_orders'::regclass),
  true, 'RLS activé sur legacy_supplier_orders');

select has_table('public', 'legacy_tontines', 'table legacy_tontines existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_tontines'::regclass),
  true, 'RLS activé sur legacy_tontines');

select has_table('public', 'legacy_tontine_members', 'table legacy_tontine_members existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_tontine_members'::regclass),
  true, 'RLS activé sur legacy_tontine_members');

select has_table('public', 'legacy_tontine_contributions', 'table legacy_tontine_contributions existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_tontine_contributions'::regclass),
  true, 'RLS activé sur legacy_tontine_contributions');

select has_table('public', 'legacy_producteur_recoltes', 'table legacy_producteur_recoltes existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_producteur_recoltes'::regclass),
  true, 'RLS activé sur legacy_producteur_recoltes');

select has_table('public', 'legacy_producteur_journals', 'table legacy_producteur_journals existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_producteur_journals'::regclass),
  true, 'RLS activé sur legacy_producteur_journals');

select has_table('public', 'legacy_producteur_commandes', 'table legacy_producteur_commandes existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_producteur_commandes'::regclass),
  true, 'RLS activé sur legacy_producteur_commandes');

select has_table('public', 'legacy_audit_logs', 'table legacy_audit_logs existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_audit_logs'::regclass),
  true, 'RLS activé sur legacy_audit_logs');

select has_table('public', 'legacy_voice_logs', 'table legacy_voice_logs existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_voice_logs'::regclass),
  true, 'RLS activé sur legacy_voice_logs');

select has_table('public', 'legacy_sync_conflict_reports', 'table legacy_sync_conflict_reports existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_sync_conflict_reports'::regclass),
  true, 'RLS activé sur legacy_sync_conflict_reports');

select has_table('public', 'legacy_notifications', 'table legacy_notifications existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_notifications'::regclass),
  true, 'RLS activé sur legacy_notifications');

select has_table('public', 'legacy_bo_system_events', 'table legacy_bo_system_events existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_system_events'::regclass),
  true, 'RLS activé sur legacy_bo_system_events');

select has_table('public', 'legacy_bo_contents', 'table legacy_bo_contents existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_contents'::regclass),
  true, 'RLS activé sur legacy_bo_contents');

select has_table('public', 'legacy_bo_alerts', 'table legacy_bo_alerts existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_alerts'::regclass),
  true, 'RLS activé sur legacy_bo_alerts');

select has_table('public', 'legacy_bo_communications', 'table legacy_bo_communications existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_communications'::regclass),
  true, 'RLS activé sur legacy_bo_communications');

select has_table('public', 'legacy_bo_credit_scores', 'table legacy_bo_credit_scores existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_credit_scores'::regclass),
  true, 'RLS activé sur legacy_bo_credit_scores');

select has_table('public', 'legacy_bo_cron_jobs', 'table legacy_bo_cron_jobs existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_cron_jobs'::regclass),
  true, 'RLS activé sur legacy_bo_cron_jobs');

select has_table('public', 'legacy_bo_deliveries', 'table legacy_bo_deliveries existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_deliveries'::regclass),
  true, 'RLS activé sur legacy_bo_deliveries');

select has_table('public', 'legacy_bo_institutions', 'table legacy_bo_institutions existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_institutions'::regclass),
  true, 'RLS activé sur legacy_bo_institutions');

select has_table('public', 'legacy_bo_mission_assignees', 'table legacy_bo_mission_assignees existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_mission_assignees'::regclass),
  true, 'RLS activé sur legacy_bo_mission_assignees');

select has_table('public', 'legacy_bo_missions', 'table legacy_bo_missions existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_missions'::regclass),
  true, 'RLS activé sur legacy_bo_missions');

select has_table('public', 'legacy_bo_moderation_reports', 'table legacy_bo_moderation_reports existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_moderation_reports'::regclass),
  true, 'RLS activé sur legacy_bo_moderation_reports');

select has_table('public', 'legacy_bo_mutations', 'table legacy_bo_mutations existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_mutations'::regclass),
  true, 'RLS activé sur legacy_bo_mutations');

select has_table('public', 'legacy_bo_platform_configs', 'table legacy_bo_platform_configs existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_platform_configs'::regclass),
  true, 'RLS activé sur legacy_bo_platform_configs');

select has_table('public', 'legacy_bo_teams', 'table legacy_bo_teams existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_teams'::regclass),
  true, 'RLS activé sur legacy_bo_teams');

select has_table('public', 'legacy_bo_zones', 'table legacy_bo_zones existe');
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.legacy_bo_zones'::regclass),
  true, 'RLS activé sur legacy_bo_zones');

select * from finish();
rollback;
