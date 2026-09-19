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
│     entités 'market-session', 'merchant-partner' (client OU fournisseur,
│     MODE-906/907), 'credit-op' (MODE-906), 'selling-point' (MODE-908) —
│     upsert idempotent client_id / operation_id ; le fournisseur d'un achat
│     part en 'stock-purchase' APRES son 'merchant-partner' (ordre FIFO,
│     MODE-907) ; le point de vente part AVANT la vente qui le référence
│     (MODE-908)
│
├── sync-handlers (22 entités) + SyncFlusher      ← §31
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

## 8ter. Fournisseurs (§15 — MODE-907)

**Modèle.** Un fournisseur est un `business_partners` (kind 'fournisseur')
— même table, même route `POST/GET /api/marchand/partners` (upsert
idempotent par client_id, MODE-906) et même handler offline
`'merchant-partner'` que les clients : RIEN n'est dupliqué. L'annuaire
local vit dans le `credits-store` (persist 'julaba-credits-store') avec
des champs structurés LOCAUX (localisation, produits en texte libre) ; ils
voyagent vers le serveur composés dans `note` (« Localisation : … ·
Produits : … ») — aucune perte, aucune migration nouvelle.

**Achats rattachés.** Le payload d'achat accepte `supplierClientId`
(client_id du partenaire, prioritaire) et/ou `supplierName` (secours) :
la route `/api/marchand/purchases` résout le client_id en
`business_partners.id` (scopé au marchand) et passe `p_supplier_id` à la
RPC `merchant_record_purchase` (qui refuse déjà « Fournisseur invalide »).
Fournisseur inconnu : création à la volée SI `supplierName` (upsert
idempotent, course 23505 → relecture), sinon 422 « Fournisseur inconnu ».
`supplierId` direct reste accepté (compat). `supplierName` seul (sans
client_id) n'est ni résolu ni créé — aucune clé d'idempotence appareil.
GET accepte `?supplierId=` et `?supplierClientId=` pour l'historique par
fournisseur (fournisseur jamais synchronisé → liste vide honnête).

**Voix (tutoiement).** « j'ai acheté 20 kilos de tomates à 15 000 francs
chez Koné » → achat + fournisseur capté (« chez <nom> », 1 à 3 mots, fin
de phrase, casse libre). La queue « chez … » est retirée du flux montant
(« à 15 000 francs chez Koné » = total 15 000, l'espace des milliers y est
normalisée) ; les phrases SANS « chez » restent strictement identiques.
La modal crée/récupère le fournisseur LOCALEMENT avant de construire
l'achat — la file FIFO part 'merchant-partner' AVANT 'stock-purchase' —
puis confirme : « Achat enregistré : 20 kilos de tomates pour 15 000
francs, chez Koné. » (clause dite uniquement si un fournisseur est capté).

**Écran « Mes fournisseurs » (route 'fournisseurs').** Liste (nom,
téléphone, localisation, badge crédit si balance < 0 = le marchand doit
au fournisseur), création/édition (nom requis, téléphone, localisation,
produits), détail = historique d'achats (GET ?supplierClientId=, repli
honnête hors connexion), état vide avec aide (« Dites : j'ai acheté 20
kilos de tomates à 15 000 francs chez Koné »). Accès : QuickAction de
l'écran Mode Marché + tuile accueil à côté de « Mes crédits ».

**Crédit fournisseur : AFFICHAGE SEULEMENT en v1.** Rien n'écrit la
balance d'un fournisseur (les achats avec `amount_paid` partiel ne
créditent pas le fournisseur ; la RPC de crédit reste dédiée aux clients).
Enregistrer des paiements aux fournisseurs est HORS PÉRIMÈTRE — la
sémantique des signes (balance < 0 = le marchand doit) doit être repensée
avant d'écrire.

**Hors périmètre assumé.** Pas de formulaire clavier d'achat dans l'app
(les seuls émetteurs de POST purchases sont la voix et le rejeu offline) :
seuls la voix et l'API portent le fournisseur. Les commandes du Marché
Jùlaba (`legacy_supplier_orders.supplier`, texte libre) et leur réception
ne sont PAS migrées vers business_partners — dette technique consignée.

## 8quater. Points de vente multiples (§18 — MODE-908)

**Modèle.** Le marchand vend à plusieurs endroits (boutique, marché
Treichville, marché Adjamé…) : un point de vente est une entité
LOCALE-FIRST { clientId (UUID), name (2-60), kind boutique/marche/autre,
createdAt, archivedAt? } vivant dans `selling-points-store` (persist
'julaba-selling-points', partialize minimal — convention D8). Un point
« Boutique » est créé AUTOMATIQUEMENT au premier usage (jamais de liste
vide bloquante). Archivage seul : JAMAIS de suppression (l'historique des
ventes reste lisible). NB : la route écran s'appelle `'points-vente'` —
`'marche'` est déjà prise (marketplace virtuel MarcheScreen).

**Point actif.** Il vit dans le store (`activePointClientId`, préférence
APPAREIL — aucune colonne is_active côté serveur, donc pas de file pour
setActive). Il est VISIBLE sur la carte journée de l'écran Mode Marché
(nom cliquable) et gérable dans l'écran « Mes points de vente »
(ajout nom + kind, renommage, archivage en section repliée, « Vendre ici »).
Le builder pur `activeOrDefault(points, activeId)` ne rend JAMAIS null :
actif valide → actif ; sinon premier non archivé ; sinon défaut « Boutique ».

**Étiquetage des ventes.** Le payload de vente gagne `sellingPointClientId`
(min 8) + `sellingPointName` (snapshot du nom AU MOMENT de la vente) —
OPTIONNELS : absents = payload historique identique (compat avant/après
migration). Le point actif est passé par ARGUMENTS (`QuickSaleOptions` de
completeQuickSale) depuis la caisse, la vente rapide et la vente vocale —
SENS UNIQUE : quick-sale n'importe jamais le store des points de vente.
La route `/api/marchand/sales` résout le client_id en
`merchant_selling_points.id` et l'écrit dans l'insert legacy
(`selling_point_client_id`) SEULEMENT si résolu — point inconnu ou table
non migrée → pas de colonne, la vente n'est JAMAIS bloquée. La RPC
merchant_record_sale n'est PAS modifiée (même écart documenté A1 que
payment_method). Côté appareil, le journal local du jour (caisse-store,
`todayPoints`) agrège montants et comptages PAR POINT avec le snapshot du
nom — stats offline, remises à zéro chaque jour.

**Sync.** Route `POST/GET /api/marchand/selling-points` : upsert IDEMPOTENT
par client_id — connu → UPDATE name/kind (+ archived_at SI fourni, jamais
NULLé : on ne désarchive pas par accident) → 200 ; création → 201 ; course
23505 → relecture → 200 ; table non migrée (42P01) → 503 transitoire ; GET
scopé merchant_id (limit 200 clampé). File offline `'selling-point'` à
chaque mutation qui change les données serveur (création, renommage,
archivage) ; FIFO : le point part AVANT la vente qui le référence — au
rejeu offline, le point existe déjà quand la vente arrive.

**Hors périmètre v1 (documenté).** Stock par point, transferts entre
points, réconciliation serveur → local de la liste (le serveur fait foi à
la relecture ; l'appareil ne télécharge pas la liste au démarrage),
désarchivage, sous-division d'un même marché.

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

- **Unitaires (vitest, 1031/1031 — 69 fichiers)** : builders de session (open/close,
  position uniquement en `gps`, FCFA entiers), store (activation, sessions
  ignorées avant activation, garde de cohérence à la clôture, re-file de
  position), géolocalisation (7 cas : natif, repli web, refus, indisponible,
  timeout), connectivité (4 états + pluriels + jamais un libellé d'erreur),
  liste des marchés, état de flush offline ; MODE-906 : phrases crédit
  (tutoiement, aucun vouvoiement, formatMontantParle), store crédits
  (offline-first, refus dépassement SANS mutation ni file, journal cap 200,
  recherche insensible casse/accents), intents vocaux (credit_doit/credit_paye,
  lettres, noms composés, apostrophes, non-capture vente/stock) ; MODE-907 :
  capture « chez X » (phrase du cahier qty/unité/produit/montant/fournisseur,
  noms 1-3 mots, casse, ponctuation, non-capture en milieu de phrase,
  non-régression sans « chez », vente/production jamais captées), payload
  achat supplierClientId/supplierName (absents si pas de fournisseur),
  phrase de confirmation avec clause «, chez Koné » (inchangée sinon),
  résolution route (mocks : client_id connu → id, création à la volée,
  422, 23505 → relecture, 42P01 → 503, GET supplierId/supplierClientId,
  liste vide honnête), store fournisseurs (kind, localisation/produits
  locaux + note composée, FIFO avant l'achat) ; MODE-908 : store points de
  vente (« Boutique » auto-créée au premier usage et stable, add/rename/
  archive avec file 'selling-point', archivage JAMAIS une suppression,
  setActive refuse un archivé, retombée sur un autre point, tout archivé →
  recréation, sans marchand = pas de file), builder activeOrDefault (jamais
  null, fallback createdAt, tout archivé → défaut), schéma
  createSellingPointSchema (bornes name 2-60, kind fermé, défaut 'autre',
  archivedAt optionnel), route selling-points (upsert idempotent : 201 /
  200 + UPDATE name/kind sans jamais NULLer archived_at / 23505 → relecture
  → 200 / 42P01 → 503, GET scopé limit clampé), résolution côté route
  ventes (client_id → id dans l'insert legacy SEULEMENT si résolu, absent
  sinon, 42P01 toléré, RPC jamais alimentée), payload vente étiqueté
  (clés présentes si point fourni, absentes sinon, journal local avec
  snapshot).
- **E2E navigateur (vérifié)** : activation → configuration Adjamé →
  ouverture de journée 5 000 F → entité `market-session` open en file →
  clôture avec caisse comptée 4 500 F → 2 entrées, même `clientId`,
  `endingCash: 4500`.
- **pgTAP** : à jouer avec `bun run test:rls` après `bun run supabase:push`
  (tables `merchant_market_sessions`, `merchant_selling_points`).
- **Android réel (§44)** : BLOQUÉ en sandbox (rejoint B5-052) — scénario 16
  étapes du cahier des charges à exécuter sur appareil.

## 11. Restant (registre MODE-908..912)

Annulation de vente (909), résumé enrichi + stats + alertes (910),
checklist §45 complète + smoke Android (912). Crédits/remboursements +
modes de paiement : **livrés (906, Task 74-b)**. Fournisseurs : **livrés
(907, Task 74-c)** — reste hors périmètre assumé : vente vocale à crédit
avec panier stock (la vente à crédit passe par la caisse),
échéanciers/relances, annulation d'op de crédit, paiements aux
fournisseurs (écriture de balance), rattachement des commandes
`legacy_supplier_orders` (texte libre) à l'annuaire. Points de vente :
**livrés (908, Task 74-d)** — reste hors périmètre assumé : stock par
point, transferts entre points, réconciliation serveur → local de la
liste, désarchivage.
