-- MODE-949 (AUDIT-003 S-11) — révocation applicative des sessions appareil.
--
-- Avant : un cookie appareil vivait 365 jours et la seule « révocation »
-- (BO, DELETE /api/backoffice/device-sessions) SUPPRIMAIT la ligne — aucune
-- trace, aucune notion de session révoquée. Désormais :
--   • revoked_at marque une session révoquée (traçable, non nulle) ;
--   • getDeviceSubject refuse toute session révoquée (vérifié sur CHAQUE
--     requête, comme l'expiration) ;
--   • le claim d'un appareil (avec preuve de secret : code de liaison)
--     remet revoked_at à NULL — la re-liaison après vol/perte reste le
--     chemin de récupération, inchangé.

alter table public.device_sessions
  add column if not exists revoked_at timestamptz;

create index if not exists idx_device_sessions_revoked_at
  on public.device_sessions(revoked_at);
