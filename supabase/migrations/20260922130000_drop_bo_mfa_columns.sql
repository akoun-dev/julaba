-- AUDIT-005 — nettoyage final des structures MFA devenues inutiles.
-- Le parcours Back-office utilise désormais uniquement le mot de passe scrypt,
-- les verrous anti-force-brute et la session HTTP-only.
-- La migration est idempotente pour fonctionner que les colonnes aient été
-- provisionnées ou non sur l’environnement cible.

alter table if exists public.bo_users
  drop column if exists mfa_secret,
  drop column if exists totp_enrolled,
  drop column if exists totp_last_step,
  drop column if exists totp_recovery_codes;
