-- A11-F18 (AUDIT-011, 2026-09-24, MODE-1003) — P3 : la RPC
-- loyalty_refresh_level (migration 20260921180000, SECURITY DEFINER) est
-- née sans revoke : Supabase accorde EXECUTE à anon + authenticated à la
-- création (classe SEC-813 — 20260921100000_revoke_rpc_post_audit.sql).
--
-- Contrairement à A11-F01 (cooperative_cotiser_keiwa, P0), l'impact est
-- inoffensif : la fonction recalcule le niveau d'un compte loyalty de façon
-- idempotente et interne (aucune fuite, aucune mutation arbitraire
-- exploitable — l'appelant ne contrôle que l'id du compte, sans effet
-- au-delà du recalcul prévu). Le contrat « service_role seul » est tout de
-- même rétabli pour fermer la classe : la RPC n'a aucun consommateur direct
-- (elle est appelée par loyalty_post_transaction et les triggers du moteur
-- loyalty, côté base).
--
-- Idempotente : revoke répété = no-op, applicable en prod sans garde.

revoke execute on function public.loyalty_refresh_level(uuid)
  from public, anon, authenticated;
grant execute on function public.loyalty_refresh_level(uuid)
  to service_role;
