-- MODE-934 — MFA back-office par TOTP (RFC 6238) — AUDIT-003, S-02 (P0)
--
-- Constat d'audit : le challenge MFA générait un code à 6 chiffres côté
-- serveur mais AUCUN canal ne le livrait (aucun mailer/SMS dans le dépôt) ;
-- en production, la connexion back-office était donc impossible hors mode
-- test (BACKOFFICE_MFA_TEST_MODE), et l'UI promettait un « code envoyé par
-- email » qui n'existait pas.
--
-- Correction : bascule vers TOTP (application d'authentification, offline).
-- Le secret TOTP vit dans la colonne EXISTANTE bo_users.mfa_secret
-- (jamais utilisée jusqu'ici — base32, 160 bits). Trois colonnes complètent :
--   - totp_enrolled       : le secret est confirmé (1re vérification réussie) ;
--   - totp_last_step      : dernier pas de temps consommé (anti-rejeu — un
--                           code intercepté n'est pas rejouable) ;
--   - totp_recovery_codes : hashes sha256 des 8 codes de récupération
--                           « XXXX-XXXX » générés à l'enrôlement (usage unique).
--
-- Le flux bo_mfa_challenges est CONSERVÉ : la ligne de challenge reste le
-- compteur de tentatives (5 max, TTL 5 min) et l'ancre du parcours
-- login → vérification ; en mode TOTP son code_hash reste NULL (sentinelle).

alter table public.bo_users
  add column if not exists totp_enrolled boolean not null default false;
alter table public.bo_users
  add column if not exists totp_last_step bigint;
alter table public.bo_users
  add column if not exists totp_recovery_codes jsonb not null default '[]'::jsonb;

comment on column public.bo_users.mfa_secret is
  'Secret TOTP base32 (160 bits) — provisionné à la 1re connexion MFA, confirmé par totp_enrolled';
comment on column public.bo_users.totp_enrolled is
  'true une fois le secret TOTP vérifié au moins une fois (fin d''enrôlement)';
comment on column public.bo_users.totp_last_step is
  'Dernier pas TOTP (période 30 s) accepté — anti-rejeu RFC 6238';
comment on column public.bo_users.totp_recovery_codes is
  'Tableau JSON de 8 hashes sha256 des codes de récupération (usage unique, format XXXX-XXXX)';
