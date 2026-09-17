-- Migration: provisionnement backoffice des identificateurs
--
-- Nouvelle règle produit : un identificateur n'est PLUS créé par
-- auto-inscription sur l'app (l'écran d'authentification n'enregistre plus
-- rien tout seul). Chaque compte est créé depuis le back-office avec
-- nom, prénom, téléphone, email et un code agent unique généré
-- automatiquement (format JID-0001, séquentiel).
--
-- L'app, au moment de la connexion, vérifie le numéro (ou le code agent)
-- auprès du serveur (GET /api/identificateur/auth/lookup) et refuse tout
-- compte absent du roster. La table existante legacy_bo_identificateurs est
-- étendue en conséquence ; `name` (nom complet) est conservé pour les
-- lectures existantes (missions, équipes, dashboard).

alter table public.legacy_bo_identificateurs
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists agent_code text;

-- Backfill : éclate `name` en prénom/nom (premier token = prénom,
-- convention ivoirienne « Kouamé Yao ») et génère un code agent unique
-- séquentiel pour les lignes existantes, dans l'ordre de création.
with numbered as (
  select
    id,
    name,
    row_number() over (order by created_at, id) as seq
  from public.legacy_bo_identificateurs
)
update public.legacy_bo_identificateurs as t
set
  first_name = coalesce(nullif(split_part(n.name, ' ', 1), ''), 'Agent'),
  last_name  = trim(substr(n.name, length(split_part(n.name, ' ', 1)) + 1)),
  agent_code = 'JID-' || lpad(n.seq::text, 4, '0')
from numbered n
where t.id = n.id
  and (t.first_name is null or t.agent_code is null);

-- Unicité forte du code agent (les nouvelles créations sont contrôlées par
-- l'API ; l'index protège aussi contre les écritures directes).
create unique index if not exists uq_legacy_bo_identificateurs_agent_code
  on public.legacy_bo_identificateurs (agent_code);

create index if not exists idx_legacy_bo_identificateurs_phone
  on public.legacy_bo_identificateurs (phone);

comment on table public.legacy_bo_identificateurs is
  'Roster des identificateurs. Comptes créés uniquement par le back-office (nom, prénom, téléphone, email, code agent unique JID-XXXX) ; l''app ne fait que vérifier le compte au moment de la connexion.';
