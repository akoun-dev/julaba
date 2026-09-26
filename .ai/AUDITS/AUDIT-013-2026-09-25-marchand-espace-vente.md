# AUDIT-013 — Jùlaba : acteurs, voix Tata et offline-first

Date : 25 septembre 2026
Identifiant : audit-marchand-espace-vente-2026-09-25 + audits domaines Producteur, Identificateur, Coopérateur, Back-office/Institution, Voix et Offline
Nature : audit statique du dépôt, des routes API, stores, migrations SQL, documentation et tests ciblés
Consigné tel que reçu (porteur) — triage dans TASKS.md (MODE-1014).

## Verdict exécutif

Verdict : le premier lancement dépendant du réseau est conforme au contrat retenu ; après ce bootstrap, le produit n'est pas encore pleinement offline-first sur tous les parcours et reste soumis à plusieurs corrections P0/P1 avant une mise en production terrain générale. Le dépôt contient néanmoins un socle fonctionnel important et réel : caisse, ventes, clôture, stock, crédits, cycles Producteur, enrôlement Identificateur, adhésion/cotisation coopérative, marketplace, fidélité, RBAC back-office et une chaîne vocale substantielle existent sous forme de code, schémas SQL, contrôles et tests.

Les écarts les plus graves sont transversaux :

• Le premier lancement dépend du réseau par conception et n'est donc pas classé comme anomalie. En revanche, après le bootstrap, le service worker ne met pas en cache les API authentifiées et ne précharge que le shell minimal ; certaines lectures métier et surfaces non préparées ne sont donc pas garanties hors ligne.

• La file offline est une file locale foreground, principalement localStorage, et non une outbox durable transactionnelle. Elle ne modélise pas toujours le type de sujet, les stores persistés ne sont pas systématiquement isolés par compte, les dépendances parent/enfant peuvent être rejouées dans le mauvais ordre et les 401/403 sont supprimés comme conflits au lieu de déclencher une récupération de session.

• Plusieurs parcours restent incomplets après le bootstrap offline. La marketplace ne met pas en file les commandes/paiements/réceptions ; la distribution coopérative est explicitement réseau-only ; le vendeur marketplace Producteur ne dispose pas de handler offline ; plusieurs lectures métier ne disposent pas encore d'un snapshot local garanti.

• Un défaut de permission bloque le vendeur marketplace marchand. La route seller-orders utilise le royaume de session producteur alors qu'elle traie le vendeur marchand ; un marchand correctement authentifié peut recevoir 403 avant la mise à jour.

• La chaîne vocale est substantielle mais pas prouvée de bout en bout hors ligne ni multi-plateforme. Web Speech et le fallback NLU dépendent du réseau, Sherpa natif est scaffoldé/indisponible sur certains chemins, le wake word est fondé sur le transcript plutôt que sur un détecteur acoustique dédié, Baoulé/Dioula restent push-to-talk, et les packs ne présentent pas tous des tailles/empreintes vérifiées.

• L'enrôlement Identificateur capture des photos, pièces et GPS localement mais le chemin audité ne les transmet pas réellement au back-office. Le serveur reçoit des indicateurs hasPhoto/hasCni... et hasGps, pas les fichiers ni les coordonnées complètes ; les images sont retirées de la persistance du brouillon.

• Des contrôles métier et de sécurité importants sont inégaux. Les montants FCFA sont bien protégés dans plusieurs flux marchands/marketplace, mais pas partout au niveau SQL/API ; les transitions marketplace, demandes d'information et configuration ont des courses concurrentes ; un compte institution de démonstration avec secret public apparaît dans l'historique des migrations, même s'il est neutralisé par une migration ultérieure.

---

## Triage MODE-1014 (Super Z, 2026-09-26, contre 946c4f0)

| Constat audit | Verdict triage | Preuve |
|---|---|---|
| seller-orders utilise le royaume producteur → 403 marchand | **DÉJÀ CORRIGÉ** (MODE-1004 P1-1, constat antérieur à l'amont) | `requireDeviceOwner(request,'merchant',…)` GET+PATCH + test namespace |
| 401/403 supprimés comme conflits, pas de récupération session | **DÉJÀ CORRIGÉ** | `authRequired` propagé (MODE-1004) + sync-flusher : reclaim session AVANT flush, état `error`, réclamation au retour |
| File « principalement localStorage », outbox non durable | **DÉJÀ CORRIGÉ** (constat antérieur à c23b251) | Bascule IndexedDB MODE-1010-ter (banc 20/20), écritures atomiques clear+put, FIFO clé primaire |
| Stores pas isolés par compte | **DÉJÀ CORRIGÉ** | Garde `ownerId` au rejeu : entrée d'un autre compte → conflit enregistré, JAMAIS rejouée (offline-db flush) |
| Dépendances parent/enfant rejouées dans le mauvais ordre | **NON-PROBLÈME en l'état** | Les mutations composites partent en UNE entrée FIFO (vente+lignes embarquées dans un seul payload/POST) |
| Marketplace ne met rien en file (commandes/paiements/réceptions) | **CORRIGÉ — MODE-1014 ①** | 5 handlers verbatim + enfilement checkout/paiement/réception/annulation/statut (3 écrans), clientId idempotent |
| Vendeur producteur sans handler offline | **CORRIGÉ — MODE-1014 ①** | `seller-order-status` + enfilement sur prod-marketplace-commandes-screen |
| Distribution coopérative réseau-only | **NON-TRAITE motivé** — décision produit à trancher (P2) | dettes TASKS |
| SW ne cache pas les API authentifiées / lectures sans snapshot | **NON-TRAITE motivé** — limite design hybrid-remote, plan 30-90 j (P2) | dettes TASKS |
| Voix : wake word transcript, Baoulé/Dioula PTT, Web Speech réseau | **NON-TRAITÉS motivés** — décisions produit/roadmap (fr = Sherpa natif offline ; bci BAOULE_NOT_READY) | MATRICE_CAPACITES_VOIX |
| Packs sans tailles/empreintes vérifiées | **CORRIGÉ — MODE-1014 ⑤** | publication stricte (publish + install), lecture legacy tolérante avertie |
| Identificateur : serveur reçoit has*, pas les fichiers ni GPS complet | **CORRIGÉ — MODE-1014 ②** | payload GPS+base64, bucket privé, migration 20260925160000, caps 413/415, rollback |
| Montants pas partout gardés au niveau SQL | **CORRIGÉ — MODE-1014 ④** | 27 CHECK / 15 tables (20260925162000), pré-contrôle prod en tête |
| Courses transitions marketplace | **DÉJÀ CORRIGÉ** (MODE-1004, RPC FOR UPDATE transactionnelles) | 20260924130000 reconstruite |
| Courses demandes d'information + config | **CORRIGÉ — MODE-1014 ③** | précondition expectedStatus + UPDATE conditionnel (409) ; config par updated_at (409) |
| Compte institution démo secret public dans l'historique | **DÉJÀ CORRIGÉ** (l'audit le note lui-même) | 20260924110000 + compte désactivé, seed local uniquement |

Gates campagne : vitest **2513/2513** (184 fichiers, +67) · tsc 0 · eslint 0 · build OK.
