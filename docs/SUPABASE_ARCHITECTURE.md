# Architecture Supabase de Jùlaba

## 1. Objectif et périmètre

Ce document propose l'architecture de Jùlaba utilisant Supabase (Postgres,
Auth, Storage, Realtime et Edge Functions si nécessaire).

Il est adapté à l'état actuel du projet :

- application Next.js 16 avec une route unique et des API Route Handlers ;
- applications marchand, producteur, identificateur et backoffice ;
- modèles couvrant les ventes, stocks, dépenses, tontines, récoltes,
  enrôlements, acteurs, missions, audit et supervision ;
- authentification backoffice serveur avec cookie HTTP-only ;
- authentification métier vérifiée par les routes serveur et les tables
  Supabase ;
- absence de base locale métier : une mutation exige une connexion et Supabase
  reste l'unique source de vérité.

La cible recommandée est un **monolithe modulaire** : Supabase fournit les
services de données et d'identité, tandis que Next.js reste la façade métier
et le point de contrôle des workflows sensibles. Il n'est pas nécessaire de
transformer chaque table en endpoint public ou d'exposer directement Postgres
à tous les clients.

## 2. Architecture cible

```text
Applications Capacitor/Web
  |  Supabase Auth (session utilisateur)
  |  API HTTPS avec access token
  v
Next.js /api
  |-- validation Zod, rate limiting, idempotence
  |-- règles métier et transactions
  |-- client Supabase avec session utilisateur (RLS)
  |-- client serveur privilégié uniquement pour les jobs contrôlés
  v
Supabase
  |-- Postgres + RLS
  |-- Auth
  |-- Storage privé
  |-- Realtime pour notifications ciblées
  |-- Edge Functions / cron pour tâches asynchrones
```

Principes directeurs :

1. Le client ne reçoit jamais la clé `service_role`.
2. La sécurité est refusée par défaut dans Postgres, pas seulement dans l'UI
   ou dans un middleware Next.js.
3. Les mutations financières et les changements de stock passent par une
   fonction SQL transactionnelle ou une API métier dédiée.
4. Chaque ligne appartenant à un tenant porte un `organization_id` explicite.
5. Toutes les écritures synchronisées depuis un appareil portent un
   `client_id` unique par tenant et par type d'entité.
6. Les permissions sont vérifiées à la fois au niveau du rôle et du périmètre
   (organisation, zone, acteur ou appareil).

## 3. Modélisation Postgres

### 3.1 Identité et multi-tenant

Supabase Auth devient la source d'identité technique. `auth.users.id` est la
clé étrangère de référence ; les profils métier ne doivent pas dupliquer les
mots de passe ou les secrets d'authentification.

Tables centrales recommandées dans le schéma `public` :

| Table | Rôle |
| --- | --- |
| `organizations` | Coopérative, institution ou périmètre client isolé |
| `organization_members` | Appartenance d'un utilisateur à une organisation |
| `profiles` | Nom, téléphone, type d'acteur et préférences non sensibles |
| `roles` / `permissions` | Catalogue stable des droits |
| `role_permissions` | Association rôle/droit |
| `zones` | Zones géographiques et rattachement organisationnel |
| `devices` | Appareils autorisés, révocables et auditables |
| `audit_events` | Journal append-only des opérations sensibles |

Ne pas conserver dans `profiles` les valeurs brutes de PIN, pattern ou OTP.
Pour un compte marchand/producteur, deux options sont possibles :

- **recommandée** : un compte Supabase Auth avec téléphone ou email ; le PIN
  local ne sert qu'à déverrouiller l'application, pas à remplacer l'identité
  serveur ;
- transition : conserver le déverrouillage local et utiliser un login serveur
  initial qui vérifie le secret côté serveur, crée une session Auth courte puis
  lie l'appareil. Le hash ne doit jamais être envoyé dans une URL ni retourné
  au client.

Le compte `identificateur` doit également obtenir une identité serveur avant de
pouvoir créer un enrôlement distant. Cela corrige le risque actuel du premier
claim d'un identificateur qui ne possède pas encore de preuve serveur.

### 3.2 Domaines métier

Le schéma cible peut regrouper les tables par domaine logique, même si elles
restent dans `public` au début :

- `merchant_profiles`, `products`, `stock_movements`, `sales`, `sale_items`,
  `expenses`, `cash_sessions` ;
- `producer_profiles`, `harvests`, `producer_orders`, `producer_journals` ;
- `tontines`, `tontine_members`, `tontine_contributions` ;
- `actors`, `enrolments`, `missions`, `mutations`, `zones` ;
- `backoffice_users` ou, de préférence, `organization_members` avec un rôle
  backoffice ;
- `notifications`, `sync_conflict_reports`, `audit_events`.

Évolutions importantes par rapport à l'ancien schéma :

- remplacer les champs polymorphes ou sérialisés (`details`, `data`, `photos`,
  `config`) par `jsonb` validé, ou par des tables relationnelles lorsque les
  données sont requêtables ;
- remplacer les chaînes libres de statut/rôle par des enums Postgres ou des
  tables de référence avec contraintes ;
- ajouter `organization_id`, `created_by`, `updated_by`, `created_at` et
  `updated_at` aux tables métier concernées ;
- utiliser `bigint` pour les montants FCFA exprimés en entier, jamais `float` ;
- utiliser `numeric` pour les quantités physiques si la précision métier le
  justifie ;
- préférer `timestamptz` et stocker les dates en UTC ;
- déclarer les clés uniques composées, par exemple
  `unique (organization_id, client_id)` et
  `unique (organization_id, reference)` ;
- utiliser `on delete restrict` pour les écritures financières et
  `on delete set null` pour les acteurs d'audit ou les utilisateurs supprimés.

Exemple de noyau SQL :

```sql
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in (
    'super_admin', 'admin_general', 'admin_national',
    'gestionnaire_zone', 'operateur_terrain', 'marchand',
    'producteur', 'identificateur'
  )),
  zone_id uuid references public.zones(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  merchant_user_id uuid not null references auth.users(id),
  client_id uuid,
  name text not null,
  category text not null default 'autre',
  price_unit bigint not null default 0 check (price_unit >= 0),
  stock_qty numeric(14, 3) not null default 0 check (stock_qty >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id)
);

create index products_org_merchant_idx
  on public.products (organization_id, merchant_user_id, updated_at desc);
```

Pour le stock, `stock_qty` ne doit pas être la seule source de vérité. Ajouter
`stock_movements` (entrée, vente, correction, synchronisation) et modifier le
stock dans la même transaction que la vente. Le solde courant peut être
maintenu comme projection pour les lectures rapides.

## 4. Authentification et RLS

### 4.1 Authentification

Configurer Supabase Auth avec :

- téléphone avec OTP ou email selon le parcours de chaque population ;
- confirmation obligatoire du téléphone/email en production ;
- durée de session et rotation des refresh tokens adaptées au risque ;
- redirections strictement limitées aux URLs des environnements autorisés ;
- limitation de fréquence sur OTP, login, claim d'appareil et endpoints
  d'enrôlement.

Dans Next.js, utiliser `@supabase/ssr` pour les cookies de session côté serveur
et vérifier l'utilisateur sur le serveur avec `auth.getUser()`. Ne pas faire
confiance à un `user_id` envoyé dans le JSON ou à un JWT décodé sans
validation.

### 4.2 Claims et rôles

Le rôle ne doit pas être modifiable par le client dans `user_metadata`.
Conserver l'autorité dans `organization_members`, et éventuellement recopier
un rôle court dans `app_metadata` via un serveur de confiance pour les checks
rapides. Les changements de rôle doivent être audités et invalider les
sessions concernées si nécessaire.

Pour les règles de zone, la requête RLS doit joindre la table des membres ; ne
pas encoder toute la matrice de permissions dans un JWT long et potentiellement
obsolète. La matrice actuelle de `backoffice-permissions.ts` doit devenir une
source de seed/migration et être couverte par des tests de politiques.

### 4.3 RLS par défaut

Activer RLS sur chaque table exposée au client, y compris les nouvelles tables.
Exemple de fonction de périmètre :

```sql
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.is_active
  );
$$;

alter table public.products enable row level security;
alter table public.products force row level security;

create policy products_select_own_scope
on public.products for select
to authenticated
using (
  is_org_member(organization_id)
  and (
    merchant_user_id = (select auth.uid())
    or exists (
      select 1 from public.organization_members m
      where m.organization_id = products.organization_id
        and m.user_id = (select auth.uid())
        and m.role in ('super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone')
        and m.is_active
    )
  )
);

create policy products_insert_own_scope
on public.products for insert
to authenticated
with check (
  merchant_user_id = (select auth.uid())
  and is_org_member(organization_id)
);
```

Bonnes pratiques RLS :

- toujours préciser `to authenticated` ;
- utiliser `(select auth.uid())` et indexer les colonnes de jointure ;
- écrire des clauses `using` et `with check` distinctes ;
- ne pas accorder `update` ou `delete` par défaut ;
- ne jamais utiliser une fonction `security definer` sans `search_path` fixe ;
- ne pas donner de privilèges d'exécution inutiles sur les fonctions ;
- tester un utilisateur sans rôle, un autre tenant, chaque rôle et une zone
  différente ;
- rappeler que `service_role` contourne RLS et doit rester exclusivement côté
  serveur/jobs.

Pour une vente ou une clôture de caisse, préférer une fonction RPC sécurisée
qui valide le montant, les lignes et le stock, puis écrit la vente, les lignes
et les mouvements dans une transaction. La fonction doit dériver l'utilisateur
depuis `auth.uid()` et refuser tout `merchant_user_id` arbitraire.

## 5. API et opérations métier

### 5.1 Répartition recommandée

- **Lecture simple filtrable** : client Supabase avec RLS, uniquement pour les
  vues dont le contrat est stable.
- **Écriture métier** : endpoint Next.js ou RPC transactionnelle ; validation
  Zod, contrôle d'idempotence et audit.
- **Backoffice** : API Next.js conservée comme façade, avec permissions
  `action + module + zone`, puis accès Supabase au nom de l'utilisateur quand
  c'est possible.
- **Jobs administratifs** : Edge Function ou worker serveur avec `service_role`,
  secret stocké dans l'environnement et journalisation stricte.

Conventions d'API :

- ressources plurielles et versionnement (`/api/v1/...`) ;
- pagination curseur pour ventes, audit et notifications ;
- filtres et tri par liste blanche ;
- réponses d'erreur uniformes avec `code`, `message` et `request_id` ;
- `Idempotency-Key` ou `client_id` obligatoire pour les mutations offline ;
- ne jamais retourner les hashes, tokens ou payloads sensibles ;
- limite de taille JSON et timeouts explicites ;
- `request_id` propagé dans les logs Next.js et les événements d'audit.

Le flux de synchronisation recommandé :

1. créer localement une mutation avec UUID `client_id` ;
2. envoyer les mutations dans l'ordre causal ;
3. appliquer `insert ... on conflict (organization_id, client_id)` ou une
   table `sync_operations` dédiée ;
4. répondre avec l'identifiant serveur et la version de la ressource ;
5. distinguer erreur transitoire (réessai exponentiel) et conflit définitif
   (enregistrer dans `sync_conflict_reports`) ;
6. réconcilier les conflits avec une règle métier explicite, jamais par un
   écrasement silencieux.

## 6. Storage, notifications et données sensibles

Créer des buckets privés séparés, par exemple `actor-photos`,
`harvest-photos` et `voice-exports`. Les chemins doivent commencer par
`organization_id/user_id`, et les policies Storage doivent vérifier le même
périmètre que les tables. Utiliser des URLs signées de courte durée. Ne pas
stocker de photo base64 dans Postgres.

Supabase Realtime doit être limité aux tables et événements nécessaires :
notifications de l'utilisateur, progression d'un dossier ou statut d'une
commande. Ne pas diffuser une table entière de ventes. Pour les données
financières, conserver l'historique en Postgres et utiliser Realtime seulement
comme signal de rafraîchissement.

Les transcriptions vocales et coordonnées GPS sont des données sensibles :
minimiser leur conservation, chiffrer les sauvegardes, restreindre leur
lecture aux rôles nécessaires et prévoir une politique de rétention.

## 7. Migrations et schéma Supabase

### Phase 0 : préparation

- figer la liste des modèles et leurs relations ;
- choisir la clé d'organisation et rattacher les données historiques ;
- nettoyer les doublons et les statuts libres ;
- ajouter les identifiants UUID et les `client_id` manquants ;
- inventorier les secrets actuels et les remplacer s'ils ont été exposés.

### Phase 1 : Supabase local et schéma

```bash
supabase init
supabase start
supabase migration new initial_julaba_schema
supabase db reset
supabase gen types typescript --local > src/lib/database.types.ts
```

Les fichiers SQL dans `supabase/migrations/` sont la source de vérité. Une
migration est revue, testée sur une base locale puis appliquée avec
`supabase db push` ou le pipeline CI.

### Phase 2 : validation Supabase

1. appliquer les migrations SQL sur l'environnement cible ;
2. vérifier les référentiels, comptes et données métier dans Supabase ;
3. vérifier les totaux de ventes, stocks, dépenses et contributions ;
4. exécuter les tests RLS et les tests des routes API ;
5. vérifier qu'aucun client ne persiste de mutation métier localement.



## 8. Environnements et secrets

Prévoir trois projets Supabase séparés : `julaba-dev`, `julaba-staging` et
`julaba-prod`. Ne jamais partager une base ou une clé de service entre ces
environnements.

Variables côté serveur :

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        # serveur/jobs uniquement
SUPABASE_DB_URL                  # CI/migrations, jamais client
SUPABASE_ACCESS_TOKEN            # CI uniquement, secret du fournisseur
```

Règles :

- versionner seulement `.env.example`, jamais `.env` ;
- stocker les secrets dans le gestionnaire de secrets du déploiement ;
- faire tourner les clés après un changement d'équipe ou une fuite ;
- séparer les secrets d'application, de migration et de fournisseur ;
- utiliser la clé publishable/anon côté client uniquement avec RLS activé ;
- bloquer le build si une variable `SERVICE_ROLE` apparaît dans un bundle
  client ;
- n'utiliser aucune donnée réelle dans dev et staging sans anonymisation.


## 9. Performance et évolutivité

- indexer systématiquement les colonnes RLS, clés étrangères et couples
  `(organization_id, created_at)` ;
- analyser les requêtes réelles avec `EXPLAIN (ANALYZE, BUFFERS)` ;
- paginer les historiques et ne pas charger de relations non nécessaires ;
- sélectionner explicitement les colonnes ;
- utiliser des vues matérialisées ou tables de projection pour les dashboards ;
- éviter les compteurs dénormalisés modifiés par plusieurs requêtes sans
  transaction ;
- regrouper les synchronisations offline par lot borné ;
- activer le pooler Supavisor adapté au runtime et ne pas ouvrir une connexion
  Postgres par requête ;
- mettre les fichiers volumineux dans Storage, jamais dans les tables ;
- archiver les logs et événements selon leur durée de conservation ;
- charger les données de backoffice avec recherche serveur, filtres et
  pagination curseur.

À court terme, Postgres managé suffit. À moyen terme, isoler les lectures
analytiques ou ajouter un entrepôt de données plutôt que de ralentir les
transactions opérationnelles.

## 10. Sauvegardes, reprise et supervision

Configurer et tester :

- sauvegardes automatiques Supabase et, pour la production, PITR selon le
  niveau de risque ;
- export logique chiffré périodique vers un stockage indépendant ;
- rétention adaptée aux obligations métier ;
- test de restauration au moins trimestriel ;
- objectifs documentés RPO/RTO, par exemple RPO 15 minutes et RTO 2 heures
  pour la première version de production ;
- alertes sur erreurs 5xx, latence p95, saturation de connexions, échecs de
  migrations, usage Storage et échecs de synchronisation ;
- suivi des `sync_conflict_reports`, expirations de devices et refus RLS ;
- corrélation par `request_id` entre Next.js, Supabase et l'appareil.

Les audits ne doivent pas être supprimables par un rôle fonctionnel. Pour les
opérations critiques, écrire un événement append-only contenant acteur,
organisation, action, ressource, résultat et empreinte du payload minimisée.


## 11. Déploiement CI/CD

Pipeline recommandé :

1. lint, tests unitaires, tests d'intégration et tests RLS sur Supabase local ;
2. génération de types depuis le schéma validé ;
3. création d'une preview avec base de staging ou branche éphémère ;
4. revue du SQL et vérification des plans de migration ;
5. sauvegarde/point de restauration avant production ;
6. application de la migration ;
7. déploiement Next.js ;
8. smoke tests Auth, RLS, vente idempotente, enrôlement et Storage ;
9. surveillance renforcée et procédure de rollback documentée.

Le serveur Next.js peut rester déployé selon le fonctionnement actuel
(build standalone avec Bun et reverse proxy Caddy). Les migrations Supabase ne
doivent pas être exécutées au démarrage de chaque instance applicative.


## 12. Découpage d'implémentation recommandé

1. Ajouter `@supabase/ssr`, le client navigateur et le client serveur.
2. Mettre en place Auth pour le backoffice et remplacer
   `BoSession`/`BoUser.passwordHash` par `auth.users` + profil/membership.
3. Créer `organizations`, `organization_members`, `zones`, `profiles` et les
   fonctions RLS communes.
4. Migrer les domaines marchand (`products`, `sales`, `sale_items`, `expenses`,
   `cash_sessions`) avec RPC transactionnelles et idempotence.
5. Migrer producteur, tontines et enrôlement.
6. Migrer Storage, notifications, audit et rapports de conflits.
7. Introduire les tests RLS dans CI et effectuer la bascule progressive par
   fonctionnalité.
8. Maintenir Supabase comme seul système de persistance et régénérer les types
   après chaque évolution de schéma.


## 13. Critères de validation avant production

- un utilisateur d'un tenant ne peut lire ni modifier les données d'un autre ;
- un opérateur de zone ne peut agir que dans sa zone ;
- un utilisateur authentifié ne peut s'auto-attribuer un rôle ;
- une vente rejouée avec le même `client_id` ne crée pas de doublon ;
- une vente et le mouvement de stock sont atomiques ;
- la `service_role` n'apparaît dans aucun bundle ni log ;
- les buckets privés refusent les URLs non signées ;
- un compte révoqué perd immédiatement son accès ;
- une restauration complète a été réalisée sur un environnement isolé ;
- les migrations sont reproductibles depuis une base vide ;
- les erreurs de synchronisation sont visibles sans exposer les secrets ou
  données inutiles ;
- les objectifs RPO/RTO et le runbook d'incident ont été testés.
