# Coopératives — gouvernance Back-office

Le module Back-office complète le module opérationnel existant (`cooperatives`,
`cooperative_membres`, stock, trésorerie et besoins) ; il ne crée pas de second
annuaire. Une adhésion est toujours portée par `cooperative_membres` et un
marchand ne peut avoir qu'une adhésion active, grâce à l'index existant.

## Cycle de vie

`brouillon → en_attente_validation → active → suspendue → active`, avec
archivage possible depuis `active` ou `suspendue`. Une coopérative archivée est
conservée et ne peut plus être réactivée implicitement. Les transitions sont
contrôlées dans `/api/backoffice/cooperatives`, indépendamment de l'interface.

## Autorisations et sécurité

Le module `cooperatives` est accessible aux rôles Back-office `super_admin`,
`admin_general`, `admin_national` et `gestionnaire_zone`. Chaque route vérifie
la session serveur et l'action demandée (`read`, `create`, `update`) via
`requireBackofficePermission`; cacher une action dans l'UI n'est donc jamais un
contrôle d'accès.

Les tables de gouvernance ajoutées par la migration MODE-943 ont RLS activée
sans policy : elles ne sont accessibles que par les routes serveur utilisant le
client de service. `cooperative_audit_logs` est append-only (les mises à jour et
suppressions sont rejetées par trigger). Les documents et invitations utilisent
des références de stockage, sans exposer de contenu privé au client.

## Rôles et permissions

`cooperative_roles` est configurable par coopérative et peut compléter les
rôles opérationnels historiques. `cooperative_permissions` est un catalogue
global (`coop.*`, `production.*`, `stock.*`, `sales.*`, etc.) relié par
`cooperative_role_permissions`; `cooperative_member_roles` conserve les
responsabilités et empêche deux rôles principaux actifs pour un même membre.

## Adhésions, invitations et historique

Les statuts d'adhésion existants restent `en_attente`, `actif`, `suspendu` et
`exclu`; ils sont mis à jour sans suppression. Les invitations ont leur propre
cycle (`envoyee`, `acceptee`, `refusee`, `annulee`, `expiree`). Toute mutation
Back-office importante écrit dans `cooperative_audit_logs` et dans le journal
d'audit Back-office global.

## Synchronisation et intégrations

Les opérations terrain continuent d'emprunter `cooperative-store` et sa file
offline existante, avec idempotence côté données. Le Back-office n'annonce pas
une opération sensible comme validée avant la réponse serveur. Les indicateurs
de la fiche proviennent des membres, du stock commun et de la trésorerie validée
existants : aucune activité ou chiffre d'affaires fictif n'est créé.
