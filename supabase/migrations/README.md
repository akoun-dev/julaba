# Migrations Supabase — Jùlaba

Ce dossier suit la convention officielle Supabase :
https://supabase.com/docs/guides/deployment/database-migrations

## Les règles du projet

1. **Nomenclature** : `<timestamp>_<nom_snake_case>.sql`
   - timestamp `YYYYMMDDHHMMSS` (celui généré par `supabase migration new`) ;
   - nom en snake_case décrivant l'objet : `create_merchants_table`,
     `create_submit_enrolment_function`, `alter_merchants_add_sexe`,
     `seed_bo_users`, `backfill_marchand_categories`…
2. **1 table = 1 fichier** : le CREATE TABLE de la table, ses index, son RLS
   (enable + policies) et ses triggers vivent dans le fichier de la table.
3. **1 fonction = 1 fichier** : la fonction + ses `revoke`/`grant`.
4. **1 alter = 1 table ciblée** : un `alter table` n'adresse qu'une table
   (si la même colonne doit exister sur N tables, N fichiers).
5. **Seeds** dans des fichiers `_seed_`/`backfill_` dédiés, toujours
   idempotents (`on conflict do nothing/do update`, garde `where … is null`).
6. **Ordre** : les versions trient par timestamp ; l'ordre respecte les
   dépendances (extensions → fonctions utilitaires → tables → FK → seeds →
   fonctions métier). Le script `scripts/verify-migrations.py` le vérifie.
7. **Jamais modifier une migration déjà appliquée** (règle officielle) :
   corriger via une nouvelle migration. Exception : le re-baseline du
   2026-09-16 (voir historique git) a redistribué les anciens monolithes
   (004500/004600/004700, `20260916*_marchand_*`) — les environnements
   existants doivent réaligner leur historique (voir plus bas).

## Niveaux d'exposition RLS

Le schéma applique deux régimes distincts, selon le destinataire des données :

1. **Tier « scope » (42 tables modernes)** : policies granulaires par rôle
   (`anon`/`authenticated`) et par opération (select/insert/update/delete),
   nommées `*_read_scope`, `*_insert_owner`, `*_admin_write`… Ces tables sont
   lues/écrites soit par l'utilisateur Supabase Auth (routes `/api/v1/*`
   avec le client serveur anon), soit via des RPC en sécurité invoker.
2. **Tier « service_role » (45 tables, RLS définie dans chaque migration de création)**
   : tables `bo_*`, `device_sessions`, `merchants`, `producers` et toutes les
   `legacy_*`. RLS activé **sans aucune policy publique** (default deny) :
   anon et authenticated se voient refuser chaque opération. Tout l'accès
   légitime passe par le backend avec le client `service_role`
   (`src/lib/supabase/admin.ts`), qui contourne le RLS par conception.
   Ne jamais créer de policy sur ces tables sans audit préalable des routes
   qui les exposent.

Les tests pgTAP (`supabase/tests/rls.sql`) vérifient les deux niveaux :
policies attendues pour le tier « scope », `relrowsecurity = true` pour le
tier « service_role ».

## Workflow quotidien

```bash
# 1. Créer une migration (génère le timestamp automatiquement)
supabase migration new create_shipments_table

# 2. Écrire le SQL dans le fichier généré, puis vérifier les règles
python3 scripts/verify-migrations.py

# 3. Tester en local
supabase db reset          # rejoue migrations + seed.sql depuis zéro

# 4. Appliquer sur le projet lié (staging/production)
supabase db push
```

## Environnement existant non suivi (drift / création manuelle)

Si la base distante existait avant l'adoption du CLI (objets déjà créés à la
main ou via l'éditeur SQL), `db push` voudrait tout rejouer. Deux options :

- **Baseline propre (recommandé)** : marquer comme « appliquées » les
  migrations dont les objets existent déjà, puis laisser `db push` n'appliquer
  que le reste :

  ```bash
  supabase migration list                 # compare local ⇄ distant
  supabase migration repair --status applied 20260101000000   # …pour chaque version déjà en base
  supabase db push                        # n'applique plus que le delta
  ```

- **Nouvel environnement** (staging neuf, projet fraîchement créé) : rien à
  faire, `supabase db push` applique toute la chaîne dans l'ordre.

## Garde-fou CI

`.github/workflows/ci.yml` exécute lint, typecheck et tests unitaires à chaque
push et PR. La vérification de nomenclature des migrations, initialement
assurée par `scripts/verify-migrations.py` (supprimé lors de la consolidation
du baseline), repose désormais sur la revue de code : `YYYYMMDDHHmmss_` +
verbe (`create_`, `alter_`, `backfill_`, `drop_`), une seule version par
fichier, un objet par fichier, ordre des FK et des seeds respecté.
