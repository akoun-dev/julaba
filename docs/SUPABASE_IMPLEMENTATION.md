# Mise en œuvre Supabase

Prisma a été entièrement supprimé du projet. Toutes les routes API utilisent
désormais Supabase (Postgres). Les fichiers de `supabase/migrations/` sont
la source de vérité unique.

## Structure

```text
supabase/
  config.toml
  migrations/20260908000000_extensions_and_triggers.sql
  migrations/20260908000100_create_organizations_table.sql
  migrations/20260908000200_create_profiles_table.sql
  migrations/20260908000300_create_zones_table.sql
  migrations/20260908000400_create_organization_members_table.sql
  migrations/20260908000500_create_devices_table.sql
  migrations/20260908000600_create_products_table.sql
  migrations/20260908000700_create_stock_movements_table.sql
  migrations/20260908000800_create_sales_table.sql
  migrations/20260908000900_create_sale_items_table.sql
  migrations/20260908001000_create_expenses_table.sql
  migrations/20260908001100_create_notifications_table.sql
  migrations/20260908001200_create_sync_conflict_reports_table.sql
  migrations/20260908001300_create_audit_events_table.sql
  migrations/20260908001400_storage.sql
  migrations/20260908001500_business_functions.sql
  migrations/20260908001600_create_cash_sessions_table.sql
  migrations/20260908001700_cash_session_functions.sql
  migrations/20260908001800_create_tontines_table.sql
  migrations/20260908001900_create_tontine_members_table.sql
  migrations/20260908002000_create_tontine_contributions_table.sql
  migrations/20260908002100_tontine_functions.sql
  migrations/20260908002200_create_harvests_table.sql
  migrations/20260908002300_create_producer_orders_table.sql
  migrations/20260908002400_create_producer_journals_table.sql
  migrations/20260908002500_create_actors_table.sql
  migrations/20260908002600_create_enrolments_table.sql
  migrations/20260908002700_enrolment_functions.sql
  migrations/20260908002800_create_missions_table.sql
  migrations/20260908002900_create_mutations_table.sql
  migrations/20260908003000_create_roles_table.sql
  migrations/20260908003100_create_alerts_table.sql
  migrations/20260908003200_create_institutions_table.sql
  migrations/20260908003300_create_moderation_reports_table.sql
  migrations/20260908003400_create_training_contents_table.sql
  migrations/20260908003500_create_communications_table.sql
  migrations/20260908003600_create_api_keys_table.sql
  migrations/20260908003700_create_deliveries_table.sql
  migrations/20260908003800_create_cron_jobs_table.sql
  migrations/20260908003900_create_credit_scores_table.sql
  migrations/20260908004000_create_keiwa_accounts_table.sql
  migrations/20260908004100_create_keiwa_transactions_table.sql
  migrations/20260908004200_create_platform_configs_table.sql
  migrations/20260908004300_create_system_events_table.sql
  migrations/20260908004400_create_voice_logs_table.sql
  functions/hello-world/index.ts
  tests/rls.sql
src/
  proxy.ts
  lib/supabase/
    admin.ts
    browser.ts
    env.ts
    server.ts
  app/api/v1/
    auth/otp/route.ts
    auth/callback/route.ts
    auth/signout/route.ts
    products/route.ts
    cash-sessions/route.ts
    tontines/route.ts
    harvests/route.ts
    enrolments/route.ts
    storage/sign-upload/route.ts
```

## Prérequis

- Node.js 20+ ou Bun 1.3+ ;
- Docker si Supabase doit être exécuté localement ;
- Supabase CLI installé et disponible dans le `PATH` ;
- un projet Supabase distinct pour chaque environnement.

Installer le CLI selon la méthode officielle de la plateforme, puis vérifier :

```bash
supabase --version
bun install
```

## Développement local

1. Démarrer les services Supabase :

```bash
bun run supabase:start
supabase status
```

2. Copier `.env.example` vers `.env.local` et renseigner les valeurs affichées
   par `supabase status`. Ne jamais ajouter `.env.local` au dépôt.

3. Appliquer la migration et régénérer les types :

```bash
bun run supabase:reset
bun run supabase:types
```

4. Démarrer Next.js :

```bash
bun run dev
```

Les points d'entrée principaux sont :

- `POST /api/v1/auth/otp` avec `{ "channel": "sms", "value": "+225..." }`
  ou `{ "channel": "email", "value": "..." }` ;
- `GET /api/v1/auth/callback?code=...` pour échanger un code Auth ;
- `POST /api/v1/auth/signout` ;
- `GET /api/v1/products?organizationId=<uuid>` ;
- `POST /api/v1/products` avec `organizationId`, `name`, `priceUnit`,
  `stockQty` et un `clientId` UUID optionnel ;
- `GET /api/v1/cash-sessions?organizationId=<uuid>&status=open|closed` pour
  l'historique des sessions de caisse ;
- `POST /api/v1/cash-sessions` avec `{ "action": "open", "organizationId",
  "openingFloat", "clientId"? }` ou `{ "action": "close", "organizationId",
  "sessionId" }`. L'ouverture et la clôture sont idempotentes par `client_id` ;
  une seule session ouverte par marchand et par organisation ;
- `GET /api/v1/tontines?organizationId=<uuid>&mine=true` pour les tontines
  dont l'utilisateur est membre (avec son total cotisé) ;
- `POST /api/v1/tontines` avec `{ organizationId, tontineId, amount,
  clientId? }` pour enregistrer sa cotisation (RPC idempotente, réservée au
  membre) ;
- `GET/POST/PATCH /api/v1/harvests` pour les récoltes du producteur
  (brouillon → publiée → vendue, propriétaire uniquement) ;
- `GET /api/v1/enrolments?organizationId=<uuid>&mine=true` pour les dossiers
  d'un identificateur ;
- `POST /api/v1/enrolments` avec `{ organizationId, dossierId, actorName,
  actorType, zoneId, phone, hasPhoto?, hasGps?, gpsLat?, gpsLng? }` :
  soumission idempotente par `dossierId`, le nom de l'identificateur est
  dérivé de son profil serveur ;
- `PATCH /api/v1/enrolments` avec `{ id, action: "valider" }` ou
  `{ id, action: "rejeter", rejectReason }` : décision backoffice
  transactionnelle (création/mise à jour de l'acteur `#M-####`, notification à
  l'identificateur, événement d'audit) ; un gestionnaire de zone ne décide que
  dans sa zone ;
- `POST /api/v1/storage/sign-upload` pour obtenir une URL d'upload signée.

Les tables producteur `producer_orders` et `producer_journals` sont migrées
avec leurs policies RLS et leurs routes v1. Les tontines et leurs membres
sont pilotées par le backoffice (rôles admin), les cotisations sont saisies
par le membre lui-même.

## Domaine backoffice

Les modèles historiques `BoUser`, `BoSession` et `BoMfaChallenge` ne sont pas
migrés : Supabase Auth + `organization_members` + MFA Supabase les remplacent
(architecture §12.2). Le catalogue `roles` / `permissions` /
`role_permissions` est seedé depuis la matrice
`src/lib/backoffice-permissions.ts` (8 rôles, 30 modules, 75 droits) et reste
en lecture seule côté client.

Les tables backoffice suivent la matrice exacte des modules : lecture/écriture
par rôle via `has_org_role` (ex. `api_keys` et `cron_jobs` réservés à
`super_admin`, la modération ouverte à `gestionnaire_zone` et
`operateur_terrain` mais pas à `admin_national`). Particularités :

- `keiwa_transactions` est un journal financier append-only (insert + lecture,
  jamais d'update/delete) ;
- `api_keys` ne stocke qu'un préfixe public et le SHA-256 du secret ;
- `system_events` s'écrit uniquement via la fonction contrôlée
  `write_system_event` (membre de l'organisation requis) ;
- `voice_logs` (données sensibles) : lecture limitée au marchand propriétaire
  et aux admins nationaux ;
- `alerts` (sévérités contraintes), `institutions`, `moderation_reports`
  (cible polymorphe assumée), `training_contents` (académie lisible par tous
  les membres), `communications`, `deliveries`, `credit_scores`,
  `platform_configs` (jsonb objet validé) complètent le domaine.

Ces tables sont administrées via la façade Next.js existante avec le client
serveur Supabase de l'utilisateur (RLS appliquée) ; aucune route v1 publique
n'est nécessaire pour elles.

La création de produits et toutes les lectures sont contrôlées par RLS. Un
utilisateur doit donc avoir une ligne active dans `organization_members`.
Cette première appartenance doit être créée depuis un outil d'administration
de confiance ou avec la clé serveur, jamais par un formulaire client.

## Authentification côté client

### Authentification back-office (sans MFA)

**MODE-961** : la vérification MFA du back-office a été retirée. La connexion
back-office vérifie le mot de passe (scrypt) puis ouvre directement la session
(cookie httpOnly) ; les verrous anti-force-brute (423 après 5 échecs) et la
limite IP (429) restent actifs. Aucun mode de test MFA n'existe plus : les
variables `BACKOFFICE_MFA_*` sont obsolètes et ignorées.

Utiliser `createSupabaseBrowserClient()` dans un composant client et ne jamais
importer `admin.ts` côté navigateur. Côté serveur, utiliser
`createSupabaseServerClient()` ; cette instance transporte les cookies de session
et conserve les contrôles RLS.

La clé `SUPABASE_SERVICE_ROLE_KEY` est réservée à des jobs serveur explicites.
Elle contourne RLS et ne doit être utilisée ni dans les Route Handlers normaux,
ni dans les composants, ni dans une application Capacitor.

## Migration distante

### Règle de création d'une migration

Chaque table doit avoir son propre fichier, généré par la CLI. Le fichier doit
contenir la table, ses index, l'activation RLS et les policies de cette table.
Les fonctions communes et les fonctions métier ont leurs propres migrations
afin de rendre les dépendances explicites.

```bash
supabase migration new create_<table_name>
```

Ne modifiez jamais une migration déjà appliquée sur un environnement partagé.
Créez une nouvelle migration corrective. Pour une base locale jetable, la
réinitialisation rejoue tous les fichiers dans l'ordre lexicographique :

```bash
supabase db reset
supabase migration list
```

Pour appliquer uniquement les migrations en attente sur une base locale :

```bash
supabase migration up
```

Lier le projet Supabase avec un token CI ou une session locale :

```bash
supabase login
supabase link --project-ref <project-ref>
```

Avant toute production :

```bash
supabase db diff --linked
supabase db push --dry-run
supabase db push
```

Les fichiers de `supabase/migrations` sont la source de vérité. Toute
migration destructive doit être séparée, sauvegardée et revue.

### Environnements et branching

Utiliser un projet Supabase par environnement :

```text
julaba-dev      branche de développement
julaba-staging  validation d'une release
julaba-prod     production
```

Une branche Git qui modifie le schéma doit créer une migration dédiée. Le
pipeline CI applique les migrations sur dev, puis staging, puis production avec
approbation manuelle. Ne partagez pas les clés, les bases ou les données entre
environnements. Les branches de preview doivent utiliser une base isolée ou un
jeu de données synthétique.

Vérifications recommandées avant une PR :

```bash
supabase db diff --local
supabase db reset
supabase test db
```

## Configuration du projet Supabase

Dans le dashboard de chaque projet :

1. configurer l'URL du site et les redirect URLs exactes de l'environnement ;
2. activer la confirmation email/téléphone en staging et production ;
3. activer TOTP MFA pour les rôles backoffice ;
4. configurer le fournisseur SMS/email et ses limites de débit ;
5. activer PITR et les sauvegardes selon le RPO choisi ;
6. vérifier que les buckets `actor-photos`, `harvest-photos` et `voice-exports`
   restent privés ;
7. conserver la clé anon/publishable dans les variables publiques et la clé
   service uniquement dans les variables serveur.

## Edge Functions

La fonction `hello-world` est sécurisée par Auth et vérifie explicitement le
Bearer token avant de traiter le JSON :

```bash
supabase functions new hello-world --auth
supabase functions serve hello-world
```

Test local avec la clé publishable affichée par `supabase status` et un vrai
access token Supabase :

```bash
curl -i --location --request POST \
  'http://127.0.0.1:54321/functions/v1/hello-world' \
  --header 'apikey: <SUPABASE_PUBLISHABLE_KEY>' \
  --header 'Authorization: Bearer <SUPABASE_ACCESS_TOKEN>' \
  --header 'Content-Type: application/json' \
  --data '{"name":"Jùlaba"}'
```

Déploiement d'une fonction :

```bash
supabase functions deploy hello-world
```

Ne mettez jamais `SUPABASE_SERVICE_ROLE_KEY` dans le code de la fonction ou
dans le bundle client. Les secrets spécifiques à une fonction doivent être
définis avec `supabase secrets set` dans le projet cible.

## Tests

Les tests de structure et de policies se lancent sur la base locale :

```bash
bun run test:rls
bun run lint
bun run test
```

Le test RLS doit être complété par des tests d'intégration avec deux utilisateurs
de tenants différents. Les scénarios minimum sont :

- lecture d'un produit de son organisation ;
- refus de lecture d'un produit d'une autre organisation ;
- refus d'une insertion dont `merchant_user_id` n'est pas l'utilisateur ;
- rejeu d'une vente avec le même `client_id` ;
- refus d'accès à un bucket privé hors organisation ;
- révocation d'un membre puis invalidation de sa session.

## Déploiement CI

Le pipeline doit exécuter les tests locaux, générer les types, puis pousser les
migrations avant le déploiement Next.js :

```bash
bun install --frozen-lockfile
bun run supabase:reset
bun run test:rls
bun run lint
bun run build
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase db push
```

Les variables `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` et
`SUPABASE_SERVICE_ROLE_KEY` doivent être des secrets CI. La migration ne doit
pas être exécutée au démarrage de chaque instance applicative.

## État actuel

Prisma a été entièrement supprimé. Toutes les routes historiques sous
`/api/marchand`, `/api/producteur`, `/api/identificateur` et `/api/backoffice`
ont été migrées vers Supabase. Le backend utilise `NEXT_PUBLIC_SUPABASE_URL`,
ses clés Supabase et `SUPABASE_DB_URL` pour les migrations PostgreSQL.

## Données et migrations

Les migrations SQL versionnées dans `supabase/migrations/` sont la seule
procédure de création et d'évolution du schéma. Le dépôt ne contient plus de
base SQLite ni de script de migration local non vérifiable. Pour une reprise de
données historique, utiliser un export contrôlé vers une table de staging
Supabase, valider les totaux, puis exécuter une importation idempotente avec la
clé de service uniquement dans un environnement serveur sécurisé.

```bash
supabase start
supabase db reset
supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

Vérification RLS locale après migration :

```bash
bun run typecheck
bunx supabase test db
```

Le contrôle d'accès doit confirmer qu'un membre authentifié lit son
organisation et ses zones, tandis qu'un rôle `anon` ne lit aucune organisation.
Le migrateur utilise la clé service uniquement pour l'import administratif ; les
lectures applicatives restent soumises aux policies RLS.
