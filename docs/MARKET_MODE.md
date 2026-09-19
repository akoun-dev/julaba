# MARKET_MODE.md — Le Mode Marché Jùlaba

_Task 71 · MODE-901..905 · Cible : cahier des charges « Mode Marché » 48 sections._
_Fusion UNION avec le commit utilisateur `0b209d4` (INCIDENT-006) : son écran/store/langue/sync conservés, mes fondations session marché (§7-8) ajoutées._

## 1. Principe

> **Internet est un accélérateur, pas une dépendance.**

Le Mode Marché transforme Jùlaba en outil de gestion commerciale de terrain :
la marchande peut perdre complètement le réseau et continuer à vendre, acheter,
gérer son stock, sa caisse, ses dépenses, parler à Tata et consulter son
historique. L'absence de réseau n'est **jamais** traitée comme une panne — le
bandeau d'état reste neutre (§34). Au retour de la connexion, la
synchronisation repart automatiquement.

Le Mode Marché est un **état local** (D1), pas un compte ni un rôle : il module
le contexte et l'affichage, jamais les droits. L'offline-first est déjà la
nature de l'app ; l'activation rend ce contexte visible et l'associe à un
emplacement de travail.

## 2. Architecture (ce qui existe, réutilisé)

```
Écran Mode Marché (§40) — src/components/marchand/market-mode-screen.tsx
│
├── market-mode-store (zustand persist 'julaba-market-mode',
│     src/lib/stores/market-mode-store.ts — fusion 0b209d4)
│     activation · hors-ligne · localisation · langue Tata · statut sync
│     + session marché courante (MODE-902 : lastSession + builders)
│
├── caisse-link (sens UNIQUE caisse → market-mode, zéro cycle)
│     openSession/closeSession → contexte de journée
│
├── offline-db (file FIFO localStorage, 500 max)  ← §29-30
│     entités 'market-session', 'merchant-partner', 'credit-op' (MODE-906)
│     (upsert idempotent client_id / operation_id)
│
├── sync-handlers (21 entités) + SyncFlusher      ← §31
│     flush au retour réseau / focus / démarrage
│
├── POST /api/marchand/market-sessions            ← §32 idempotence
│     requireDeviceOwner + zod + upsert par client_id
│
└── Supabase merchant_market_sessions (RLS service_role)
```

**Zéro duplication** (D3) : l'écran pilote les modales globales existantes
(`VenteRapideModal`, `OpenCaisseModal`, `CloseDayModal`, `VoiceModal`) et les
fonctions pures existantes (`collectTodaySales`, `buildDaySummarySpeech`,
StockService, day-summary). La caisse (`caisse-store`) reste la source de
vérité des montants ; la session marché porte le **contexte**.

## 3. Activation et configuration (§4-6)

1. **Entrée** : tuile « Mode Marché » en tête du menu rapide de l'accueil.
2. **Première activation (§4)** : texte exact du cahier des charges +
   bouton « Activer le Mode Marché ». Persistance locale — l'activation est
   définitive (déactivation possible par le store).
3. **Configuration (§5.2)** : quatre choix — « Utiliser ma position
   actuelle », « Choisir un marché » (liste provisoire : Adjamé, Treichville,
   Yopougon, Cocody), « Ne pas enregistrer la position », « Autre marché »
   (saisie libre).
   - La liste est **provisoire** (D5) : aucune table/API marché n'existe en
     base ; `src/lib/market-mode/markets.ts` est le point de branchement
     unique quand une source serveur apparaît.
4. **Géolocalisation (§6)** : la permission n'est demandée QUE si
   l'utilisatrice choisit « position actuelle », avec l'explication simple
   imposée. Contrat `captureCurrentPosition()` (`geo.ts`) :
   `{status:'captured'|'refused'|'unavailable'}` — **jamais throw**, natif
   Capacitor puis repli web (pattern `biometric-auth`). Un refus n'empêche
   rien : le Mode Marché continue, la position est retentée à l'ouverture de
   journée suivante. Collecte **ponctuelle** (à l'activation et à l'ouverture
   de la journée), jamais en continu ; position transmise au serveur
   uniquement en mode `gps`.

## 4. Journée marché (§7-8)

| Événement | Ce qui se passe |
|---|---|
| Ouverture de caisse (`openSession`) | un enregistrement `market-session` **status open** est construit (marché, mode de position, position éventuelle, caisse de départ, `startedAt`) puis mis en file ; en mode `gps`, la position est rafraîchie ponctuellement puis re-file (même `clientId`) |
| Clôture (`closeSession(countedCash)`) | le MÊME `clientId` repart **status closed** avec `closedAt`, la caisse **comptée** (modale « Fond de caisse réellement compté »), les totaux ventes/dépenses du jour |

Le lien caisse → market-mode est **unidirectionnel** (`caisse-link.ts`) :
aucun cycle, tout est no-op tant que le mode est inactif, jamais bloquant.

## 5. Modèle de données

```sql
merchant_market_sessions (
  id, merchant_id,
  client_id  UNIQUE,          -- = id de session de caisse (idempotence §32)
  market_name, location_mode, -- gps | select | none
  latitude, longitude, accuracy_m,  -- null hors mode gps (§6)
  started_at, starting_cash,
  status,                     -- open | closed
  closed_at, ending_cash, sales_total, expenses_total
)
-- RLS activé, tier service_role (accès API uniquement), trigger updated_at
```

Payload strict (zod `marketSessionSchema`) : montants FCFA entiers ≥ 0 ;
position refusée hors mode `gps` ; clôture exige `closedAt`.

## 6. Idempotence et conflits (§32-33)

- **Idempotence** : `client_id` UNIQUE côté base ; le rejeu offline rejoue le
  MÊME payload ; la route répond 200 « déjà connu » (update) ou 201 (créé) ;
  course concurrente protégée par l'unicité (retry 23505 en update).
- **Conflits** : une session marché n'est qu'un **résumé de contexte** —
  jamais une source de vérité commerciale. La règle forte du système (vente
  immuable, refus strict serveur, mouvements append-only) vit dans le
  système de stock (voir `.ai/PLAN_STOCK.md`). Un 4xx offline = conflit
  définitif (comportement standard `jsonRequest`), un 5xx garde l'entrée en
  file pour rejeu.

## 7. Connectivité (§34)

`MarketConnectivityStrip` : quatre états — **Hors connexion** (+ « N
opérations en attente »), **Synchronisation…** (un flush est en vol,
`isSyncFlushInProgress()`), **N opérations en attente**, **À jour**. Ton
toujours neutre (ambre/vert/bleu, jamais rouge-erreur) ; lecture réseau via
l'unique `network-store` (@capacitor/network), file lue sur l'événement
`julaba-offline-queue-changed` + rafraîchissement léger.

## 8. Écran principal (§40)

- Bandeau connectivité + emplacement actif ;
- carte journée (« Commencer ma journée » / « Fermer ma journée » + chiffres
  du jour) ;
- bouton vocal **Vendre avec Tata** (verrou F9 : caisse fermée → ouverture
  d'abord, identique à la barre du bas) ;
- actions essentielles : Nouvelle vente, Mon stock, Ventes passées, Mes
  crédits (grand livre de crédit vivant — MODE-906), Résumé du jour (dicté
  par Tata via les fonctions pures existantes) ;
- accès secondaires : Dépenses, Transferts, Historique, Commandes,
  Fournisseurs (Marché Jùlaba), Paramètres.

Le menu rapide de l'accueil porte aussi la tuile **Mes crédits** (à côté de
Dépenses) ; l'écran « Mes crédits » est la route `'credits'` (`app-store`,
case `page.tsx`).

## 8bis. Crédits clients et remboursements (§9/§21-22/§27-28 — MODE-906)

**Modèle (décisions verrouillées).** Le grand livre de crédit est une entité
PROPRE, `merchant_credit_ops` (append-only, `kind` 'credit'|'repayment',
`UNIQUE (merchant_id, operation_id)`). La vente reste ce qu'elle est (autorité
stock) ; une vente à crédit = la vente existante (avec `payment_method`
'credit' sur `legacy_sales`, migration 20260919130000) + une op de crédit
liée par `sale_client_id`. JAMAIS de DELETE/UPDATE d'une vente ni d'une op.
Le client nommé vit dans `business_partners` (kind 'client') : `balance_cfa`
signé — > 0 le client doit au marchand, < 0 le marchand doit au client. Le
serveur fait foi à la sync ; le solde local (`credits-store`, zustand persist
`julaba-credits-store`, journal cap 200) sert à l'UI offline.

**Offline-first.** Les actions du store (`recordCredit`, `recordRepayment`,
`upsertPartner`) mutent le journal local PUIS mettent en file ('merchant-partner'
d'abord, 'credit-op' ensuite — l'ordre FIFO garantit que le partenaire part
avant l'op qui le référence) ; elles ne font JAMAIS de réseau et ne jettent
jamais. L'offline n'est pas une erreur.

**Idempotence (§31-32).** `client_id` unique sur partenaires comme ops ; rejeu
offline = MÊME payload ; la route répond 200 si déjà connu, 201 si créé ;
course 23505 → relecture → 200. Côté base, la RPC
`merchant_record_credit_op` (SECURITY DEFINER) verrouille le partenaire
FOR UPDATE et reconnaît l'op existante SANS retoucher le solde.

**Refus métier (§27).** Un remboursement ne dépasse JAMAIS la dette :
nouveau solde < 0 refusé — localement (rien muté, rien en file) et côté RPC
(`REPAYMENT_EXCEEDS_DEBT`, détail = solde courant) → 422 avec
`{ balanceCfa }` ; 4xx définitif = retiré de la file, conflit rapporté
(comportement `offline-db`). Repli PGRST202 (migrations non poussées) :
INSERT op + UPDATE solde avec relecture du solde avant UPDATE, même refus ;
table absente (42P01) → 503 transitoire, l'entrée reste en file.

**API.** `POST/GET /api/marchand/partners` (upsert idempotent par client_id,
GET scopée limit 200) ; `POST/GET /api/marchand/credit-ops` (résolution
partenaire par `partnerClientId`, création à la volée si inconnu —
`partnerName` requis — puis RPC ; GET 50 dernières ops avec nom partenaire).
`createSaleSchema` gagne `paymentMethod` (défaut 'especes') ; la route vente
l'écrit dans `legacy_sales` SEULEMENT si ≠ 'especes' (compatible avant/après
migration).

**Voix (tutoiement, zéro emoji).** Intents `credit_doit` (« Adjoua me doit
5 000 francs », lettres comprises) et `credit_paye` (« Adjoua m'a payé les
3 000 francs ») — noms de 1 à 3 mots, JAMAIS une vente ou un stock captés ;
`credit_block` devient une aide. Toute écriture est confirmée à la voix
(« Je note que Adjoua te doit 5 000 francs. Je confirme ? ») — « non » →
« Je n'ai rien noté. » Phrases pures (`credit-phrases.ts`) :
« C'est enregistré. Adjoua te doit maintenant 5 000 francs. » /
« La dette de Adjoua passe de 5 000 à 2 000 francs. » (ou « ne te doit plus
rien ») / refus honnête « Adjoua ne te doit que 2 000 francs. Je ne peux pas
noter un paiement de 3 000. » / « Tes clients te doivent 25 000 francs en
tout, sur 3 crédits. »

**Caisse (§9).** Sélecteur 4 boutons — Espèces (défaut) / Mobile Money /
Crédit / Autre. Espèces/Mobile Money/Autre : comportement historique (montant
reçu ≥ total). Crédit : nom du client requis (suggestions des clients connus,
insensible casse/accents), montant reçu masqué, validation → vente en file
avec `payment_method` 'credit' + op de crédit liée (`saleClientId`) + phrase
tata. `completeQuickSale` accepte `{ paymentMethod }` (défaut 'especes',
inchangé).

**Notifications.** Catégorie 'credit' (types + libellés ; hors périmètre
des préférences affichables — préférence non définie vaut « on »), builders
`creditRecordedInput` / `repaymentReceivedInput`, déclenchés best-effort dans
le store.

## 9. Multilingue et vocal (§36-38)

Aucune nouvelle brique : le Mode Marché s'appuie sur le pipeline existant
(VoiceEngine façade, fr + baoulé pilote, NLLB bci↔fra à la demande, jamais
NLLB comme ASR). Les intentions métier restent dans `localIntent.ts` ;
l'ouverture/fermeture de journée à la voix passe par les intentions de
navigation existantes (verrou caisse inclus).

## 9bis. Langue de Tata sur l'écran Mode Marché (fusion 0b209d4)

L'écran propose le sélecteur de langue : Français et Baoulé (moteurs réels du
projet — jamais affichés comme disponibles sinon), Dioula/Jula, Sénoufo et
Bété explicitement « Bientôt disponible » (§36). Le choix persiste et pilote
le sélecteur vocal existant (`voice-language-store`).

La synchronisation manuelle « Synchroniser » de l'écran réutilise
`flushAllPendingSync` — aucune seconde file ; le compteur et le statut sont
tenus par le `SyncFlusher` (démarrage, reconnexion, focus, visibilité).

## 10. Tests

- **Unitaires (vitest, 956/956 — 62 fichiers)** : builders de session (open/close,
  position uniquement en `gps`, FCFA entiers), store (activation, sessions
  ignorées avant activation, garde de cohérence à la clôture, re-file de
  position), géolocalisation (7 cas : natif, repli web, refus, indisponible,
  timeout), connectivité (4 états + pluriels + jamais un libellé d'erreur),
  liste des marchés, état de flush offline ; MODE-906 : phrases crédit
  (tutoiement, aucun vouvoiement, formatMontantParle), store crédits
  (offline-first, refus dépassement SANS mutation ni file, journal cap 200,
  recherche insensible casse/accents), intents vocaux (credit_doit/credit_paye,
  lettres, noms composés, apostrophes, non-capture vente/stock).
- **E2E navigateur (vérifié)** : activation → configuration Adjamé →
  ouverture de journée 5 000 F → entité `market-session` open en file →
  clôture avec caisse comptée 4 500 F → 2 entrées, même `clientId`,
  `endingCash: 4500`.
- **pgTAP** : à jouer avec `bun run test:rls` après `bun run supabase:push`
  (table `merchant_market_sessions`).
- **Android réel (§44)** : BLOQUÉ en sandbox (rejoint B5-052) — scénario 16
  étapes du cahier des charges à exécuter sur appareil.

## 11. Restant (registre MODE-907..912)

Fournisseurs CRUD (907), points de vente multiples (908), annulation de vente
(909), résumé enrichi + stats + alertes (910), checklist §45 complète + smoke
Android (912). Crédits/remboursements + modes de paiement : **livrés (906,
Task 74-b)** — reste hors périmètre assumé : vente vocale à crédit avec panier
stock (la vente à crédit passe par la caisse), échéanciers/relances,
annulation d'op de crédit.
