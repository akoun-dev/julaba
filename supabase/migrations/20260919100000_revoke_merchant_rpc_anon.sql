-- SEC-813 — Revoke EXECUTE des RPC stock marchand pour anon + authenticated
-- (audit PHASE 1, anomalie N°1 — haute).
--
-- Les RPC merchant_* sont SECURITY DEFINER : Supabase accorde EXECUTE
-- explicitement à anon + authenticated à la création, même après un
-- « revoke ... from public ». Sans ce durcissement, l'anon key PostgREST
-- peut appeler directement merchant_record_sale / record_purchase /
-- record_movement / adjust_to_count / backfill_opening_balances et
-- contourner requireDeviceOwner (les routes API passent par le client
-- service_role, l'anon n'a JAMAIS à les appeler).
--
-- Vérification post-application :
--   has_function_privilege('anon', 'public.merchant_record_sale', 'EXECUTE') = false
--   has_function_privilege('service_role', ..., 'EXECUTE') = true (héritée)

revoke execute on function public.merchant_record_sale(text, uuid, text, jsonb, bigint, boolean, text, text, text) from anon, authenticated;
revoke execute on function public.merchant_record_purchase(text, uuid, text, jsonb, text, bigint, text, text, boolean, text) from anon, authenticated;
revoke execute on function public.merchant_record_movement(text, uuid, text, text, text, numeric, numeric, text, text, text, text, text) from anon, authenticated;
revoke execute on function public.merchant_adjust_to_count(text, uuid, text, text, numeric, text) from anon, authenticated;
revoke execute on function public.merchant_backfill_opening_balances() from anon, authenticated;
