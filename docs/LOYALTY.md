# Avantages fidélité Jùlaba

Le module **Avantages fidélité** est un moteur configurable qui récompense les activités validées de Jùlaba. Il est commun aux marchands, producteurs, grossistes, semi-grossistes, coopérateurs et coopératives. Le module ne contient volontairement ni challenges ni parrainage.

## Principes

Le score JULABA existant reste distinct du programme de points. Le score mesure une performance agrégée. Le programme de fidélité possède un compte et un ledger de mouvements de points. Aucun solde n'est accepté depuis le frontend.

Chaque mouvement est immuable. Une annulation produit un mouvement inverse avec une référence vers le mouvement initial. L'identifiant d'opération est unique par compte afin de rendre les rejeux offline idempotents.

Les règles, niveaux et récompenses sont des données administrables. Une règle peut cibler un profil, filtrer un montant, définir une période et attribuer un nombre fixe de points ou un nombre de points par tranche de FCFA. Les montants monétaires restent des entiers FCFA.

## Modèle de données

La migration `20260921180000_create_loyalty_engine.sql` crée les entités suivantes :

- `loyalty_programs` : programmes et périodes de validité ;
- `loyalty_rules` : règles d'attribution et ciblage par profil ;
- `loyalty_levels` : seuils, ordre et avantages associés ;
- `loyalty_accounts` : compte d'un sujet et cache transactionnel du solde ;
- `loyalty_transactions` : ledger append-only des gains, dépenses, reversals, expirations et ajustements ;
- `loyalty_rewards` : catalogue des avantages ;
- `loyalty_redemptions` : utilisations atomiques ;
- `loyalty_audit_logs` : journal dédié aux changements sensibles.

Le compte est identifié par `program_id + subject_id`. `subject_id` reste textuel afin de supporter les identifiants historiques des marchands et les UUID des autres profils sans dupliquer les comptes utilisateurs.

## Sécurité

Les tables sont protégées par RLS. Les écritures de points passent exclusivement par les fonctions `SECURITY DEFINER` appelées depuis les routes serveur : `loyalty_post_transaction` et `loyalty_redeem_reward`. Le client ne peut donc pas modifier son solde, créer un gain arbitraire ou utiliser le compte d'un autre appareil.

La route personnelle `/api/loyalty/me` exige une session appareil correspondant au sujet demandé. La route back-office `/api/backoffice/loyalty` est protégée par le module RBAC `loyalty`. Les rôles centraux peuvent administrer les règles, niveaux et récompenses ; la lecture des statistiques est également contrôlée par le même module.

## Attribution métier

`src/lib/loyalty/evaluator.ts` évalue les règles actives après le succès d'une opération métier. La première intégration est la vente validée. Une erreur de fidélité ne bloque jamais une vente, un achat ou une récolte : le métier source reste prioritaire et le mouvement peut être rejoué avec le même identifiant d'opération.

Les intégrations prévues suivent le même contrat :

```text
opération validée côté serveur
        ↓
évaluation des règles actives et du profil
        ↓
loyalty_post_transaction
        ↓
ledger idempotent + recalcul du niveau
```

## API mobile

`GET /api/loyalty/me?subjectId=...&subjectRole=...` renvoie le compte, le niveau, la progression, les récompenses éligibles et les mouvements récents. `POST /api/loyalty/me` utilise une récompense après vérification du solde, de la période, du stock et de l'idempotence.

L'écran existant `FideliteScreen` devient **Mes avantages**. Il affiche le solde réel, le niveau, la progression, les récompenses et l'historique. En mode hors connexion, il n'invente aucun solde et laisse le bouton d'utilisation désactivé tant que le serveur n'a pas confirmé l'opération.

## Back-office

Le module API fournit un dashboard avec le nombre de comptes actifs, les points distribués, utilisés et expirés, ainsi que la répartition par profil. Les règles, niveaux et récompenses sont créés avec des statuts `draft`, `active`, `inactive` ou `archived`. Toute création est enregistrée dans le journal d'audit général du back-office ; les évolutions sensibles doivent également alimenter le journal dédié.

## Offline-first

Une attribution issue d'une vente locale utilise l'identifiant stable de la vente comme base d'idempotence. Le rejeu ne peut pas créer un second mouvement grâce à `unique (account_id, operation_id)`. Les opérations qui exigent une validation serveur, notamment l'utilisation d'une récompense, ne sont pas présentées comme confirmées hors connexion.

L'extension de la file offline aux événements producteurs, commandes et coopératives doit conserver l'ordre de dépendance : l'opération métier source est d'abord synchronisée, puis le mouvement de fidélité est posté avec un identifiant dérivé stable.

## Tata

Les commandes vocales de fidélité prévues sont : « combien j'ai de points ? », « qu'est-ce que je peux avoir avec mes points ? » et « combien il me manque pour le prochain niveau ? ». Une utilisation de points doit toujours identifier une récompense non ambiguë et demander confirmation avant l'appel de redemption.

Le moteur reste indépendant de la langue. Français, Baoulé, Dioula/Jula, Sénoufo et Bété ne sont exposés vocalement que lorsque leur chaîne ASR/TTS est validée.

## Vérifications à poursuivre

La suite d'implémentation doit ajouter les routes d'édition back-office, les handlers offline dédiés, les branchements producteurs et coopératives, les commandes Tata et les tests d'idempotence, de sécurité, de règles et de redemption. Les challenges et le parrainage ne font pas partie du produit livré.
