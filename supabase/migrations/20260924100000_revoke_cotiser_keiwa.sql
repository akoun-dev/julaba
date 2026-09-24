-- A11-F01 (AUDIT-011, 2026-09-24, MODE-1003) — HOTFIX P0 : la RPC
-- cooperative_cotiser_keiwa (migration 20260923110000) est SECURITY DEFINER
-- et s'est retrouvée SANS revoke : Supabase accorde EXECUTE à anon +
-- authenticated à la création (classe SEC-813, documentée par
-- 20260921100000_revoke_rpc_post_audit.sql). Les 5 RPC marketplace créées
-- LE MÊME JOUR portaient leurs revokes ; la RPC keiwa seule a été oubliée.
--
-- Impact (AUDIT-011 §3.1) : via la clé anon (publique par design, embarquée
-- dans l'APK et le bundle web), n'importe qui peut débiter le wallet Keiwa
-- de tout marchand membre actif d'un montant arbitraire et écrire dans le
-- livre de trésorerie — aucune des gardes internes de la RPC
-- (membre actif, règle annuelle, idempotence) n'authentifie l'appelant.
--
-- Contrat légitime : la seule consommatrice est
-- POST /api/cooperatives/cotisation (src/app/api/cooperatives/cotisation/
-- route.ts) qui appelle la RPC via createSupabaseAdminClient() (service_role)
-- APRÈS son garde requireMembreActif — service_role seul est donc le bon
-- contrat, à l'identique des RPC marketplace.
--
-- Idempotente : revoke répété = no-op, applicable en prod sans garde.
-- Vérification post-application : supabase/tests/acl.sql (assertions
-- A11-F01 en fin de fichier).

revoke execute on function public.cooperative_cotiser_keiwa(uuid, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.cooperative_cotiser_keiwa(uuid, text, integer, text, text)
  to service_role;
