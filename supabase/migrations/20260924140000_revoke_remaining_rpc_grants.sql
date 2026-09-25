-- MODE-1004 / AUDIT-012 — RECONSTRUCTION de la migration
-- 20260924140000_revoke_remaining_rpc_grants : appliquée sur la base
-- hébergée par le porteur le 24/09 mais JAMAIS committée. État ACL observé
-- en production (pg_proc.proacl le 25/09, Task 166) : seuls postgres et
-- service_role exécutent la famille marketplace — ADR-001 : aucune RPC
-- SECURITY DEFINER métier exécutable par anon/authenticated.

revoke all on function public.marketplace_create_order(text,jsonb,uuid,bigint,bigint,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.marketplace_create_order(text,jsonb,uuid,bigint,bigint,text,text,text,text,text) to service_role;

revoke all on function public.marketplace_cancel_order(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.marketplace_cancel_order(uuid,text,text,text) to service_role;

revoke all on function public.marketplace_fulfill_order(uuid,text,text) from public, anon, authenticated;
grant execute on function public.marketplace_fulfill_order(uuid,text,text) to service_role;

revoke all on function public.marketplace_confirm_receipt(uuid,text) from public, anon, authenticated;
grant execute on function public.marketplace_confirm_receipt(uuid,text) to service_role;

revoke all on function public.marketplace_reserved_quantity(text,text) from public, anon, authenticated;
grant execute on function public.marketplace_reserved_quantity(text,text) to service_role;

revoke all on function public.marketplace_seller_transition(uuid,text,text) from public, anon, authenticated;
grant execute on function public.marketplace_seller_transition(uuid,text,text) to service_role;

revoke all on function public.marketplace_initiate_payment(uuid,text,uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.marketplace_initiate_payment(uuid,text,uuid,text,text,text,jsonb) to service_role;
