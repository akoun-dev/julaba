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
│     MODE-906/907), 'credit-op' (MODE-906), 'selling-point' (MODE-908),
│     'sale-reversal' (MODE-909 — mise en file APRÈS la vente qu'elle
│     annule : rejeu FIFO = vente créée PUIS annulée) — upsert idempotent
│     client_id / operation_id ; le fournisseur d'un achat part en
│     'stock-purchase' APRES son 'merchant-partner' (ordre FIFO, MODE-907) ;
│     le point de vente part AVANT la vente qui le référence (MODE-908)
│
├── sync-handlers (23 entités) + SyncFlusher      ← §31
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
`buildVentesSummary`/`percentChange` via `day-stats`, StockService,
day-summary). La caisse (`caisse-store`) reste la source de
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

## 8quinquies. Annulation de vente (§28 — MODE-909)

**Principe.** Une vente enregistrée ne se supprime JAMAIS : ni DELETE ni
UPDATE sur `legacy_sales`, ni sur le journal local. L'annulation est une
**OPÉRATION INVERSE append-only** : une entité `sale-reversal`
{ clientId (UUID d'idempotence), saleClientId, raison OBLIGATOIRE (3-200
après trim), createdAt }. Une vente annulée = EXISTS une reversal la
ciblant. L'historique reste intact, le stock revient. Dans toute l'UI :
« Annuler la vente », JAMAIS le mot « supprimer ».

**Serveur.** Migration `20260919150000` — table `merchant_sale_reversals`
(UNIQUE (merchant_id, operation_id) : le rejeu est reconnu sans rien
refaire ; UNIQUE (merchant_id, sale_client_id) : une vente ne s'annule qu'
UNE fois ; index (merchant_id, created_at desc) ; RLS ; raison CHECK
length(trim) 3-200). AUCUNE colonne ajoutée à legacy_sales. RPC
`merchant_reverse_sale` (migration `20260919150100`, SECURITY DEFINER,
style merchant_record_credit_op) : idempotence (merchant_id, operation_id)
→ état courant sans refaire ; VERROU sur la vente (FOR UPDATE — les
annulations concurrentes se sérialisent) ; vente introuvable → 22023 «
Vente introuvable » ; déjà annulée (re-vérifié sous verrou) → état courant
; sinon UN mouvement d'entrée CUSTOMER_RETURN (quantité rendue = quantité
vendue) par article SUIVI de stock via la RPC existante
merchant_record_movement (une couche, zéro duplication), operation_id
dérivé DÉTERMINISTE par produit (md5(op || ':reversal:' || product_id) —
même technique que le fix STK-809 ; la route TS dérive avec la MÊME formule
via deriveOperationUuid : les deux côtés convergent, jamais de doublon au
rejeu) ; ligne sans product_id ou produit non suivi (balance absente ou
UNKNOWN, §23 D7) → item ignoré SANS erreur. Retour
{ operation_id, sale_client_id, items_returned, created }.

**Route.** `POST /api/marchand/sale-reversals` (zod clientId/saleClientId
min 8, raison 3-200, requireDeviceOwner) : chemin principal = RPC ; repli
PGRST202 (migrations non poussées) = repli non transactionnel HONNÊTE —
insert reversal append-only (le fait métier prime) + mouvements best-effort
via merchant_record_movement, skip stock avec note explicite si la RPC de
mouvement manque ; 42P01 → 503 transitoire (l'entrée reste en file) ; «
Vente introuvable » → 422 définitif (conflit, jamais de boucle) ; course
23505 sur sale_client_id → relecture → 200 idempotent. Handler offline
`'sale-reversal'` (rejeu verbatim POST) ; FIFO : la reversal part APRÈS la
vente qu'elle annule — au rejeu, la vente est créée PUIS annulée.

**Lecture.** `GET /api/marchand/sales` : chaque vente est enrichie
`annulee: boolean` (reversals lues à part, tolérant 42P01 — annulée false
avant migration, jamais bloquant) ; la LISTE garde toutes les ventes
(historique intact) ; `totalRevenue` exclut les annulées (revenu = ce qui
est compté) + `cancelledCount`. L'écran Ventes affiche le badge « Annulée »
amber (montant barré), bouton « Annuler la vente » → modale raison (champ
libre + 3 raisons rapides : Erreur de prix / Erreur de produit / Client
parti), phrases `reversal-phrases.ts` (« Vente annulée. Le stock est
revenu. »), refus honnête si déjà annulée. Le résumé du jour exclut les
annulées et dit « {N} vente(s) annulée(s) non comptée(s). » si N > 0.

**Local.** caisse-store gagne un JOURNAL des ventes du jour (append-only,
`todaySalesJournal`, remis à zéro chaque jour) alimenté par tous les
émetteurs (caisse, vente rapide, voix via quick-sale). `reverseSale(
saleClientId, reason)` : MARQUE l'entrée (annulee + raison + annuleeAt,
jamais retirée), met en file 'sale-reversal' (clientId UUID d'idempotence),
remet le stock local en DELTA (+qty par article suivi via adjustLocalStock
— jamais une valeur absolue, piège D3), décrémente les agrégats du jour
(ventes, comptage, journal par point — jamais sous 0). REFUS sur une vente
déjà annulée. Annulation d'une vente EN FILE offline : permise sur la copie
locale (FIFO vente puis reversal = rejeu cohérent).

**Voix.** Intent `annule_vente` (« annule la dernière vente », « annule la
vente », infinitif/participe passé/possessif) → confirmation orale
OBLIGATOIRE (pendingConfirmRef) avec les infos RÉELLES de la dernière vente
locale non annulée (« Tu veux annuler la vente de {montant} francs de
{produit} ? Je confirme ? ») ; aucune vente → « Je ne trouve pas de vente à
annuler aujourd'hui. » ; refus oral → « Je n'ai rien annulé. » Le oui
annule avec la raison fixe « Annulée à la voix » (l'oral ne dicte pas de
raison).

**Hors périmètre v1 (documenté).** Remboursement cash en caisse (le retour
stock ne restitue pas l'argent — le marchand rend la monnaie
physiquement), annulation d'une vente d'un autre jour/appareil depuis ce
device (le journal local couvre le jour), la reversal d'une vente à crédit
ne touche pas le solde du partenaire (MODE-906), annulation d'op de crédit,
échéanciers.

## 8sexies. Résumé enrichi, statistiques et alertes (§23/§25/§26 — MODE-910)

Tout en réutilisation pure : aucune nouvelle route, aucune migration, aucun
nouvel intent — les briques existantes (day-summary, ventes-jour, credits-store,
selling-points, notifications) sont composées et testées.

### Résumé du jour enrichi (§23 — stock faible)

- `buildDaySummarySpeech(data, stockAlerts?)` accepte un **deuxième paramètre
  optionnel** `Array<{ name, level: 'low' | 'out' }>` (type `DayStockAlert`) :
  la lib reste **pure** — c'est l'APPELANT qui construit la liste via
  `getLowStockProducts()` du stock-store (jamais de lecture store dans la lib).
  Branché sur l'unique chemin de dicté du résumé : `speakDaySummary` de
  l'accueil (tuile « Résumé du jour » + bouton « Écouter le détail des ventes »
  de la modale — le bouton du Mode Marché ouvre cette même modale). Audit des
  appelants : l'intent `consultation` du voice-modal garde sa réponse COURTE
  (`buildDayTotalText`, contrat VOCAL-607) et la `CloseDayModal` ne dicte pas
  de résumé — aucun des deux n'a été forcé.
- **Phrases** (tutoiement, en FIN de dicté, épuisés d'abord, max **1 ligne par
  catégorie**) : 1 épuisé — « Attention : tomates est épuisé. » ; plusieurs —
  « Attention : 2 produits sont épuisés : tomates et huile. » (compte réel,
  liste max 3 avec « et » final) ; presque épuisé — « Attention : 1 produit est
  presque épuisé : riz. » / « Attention : 3 produits sont presque épuisés :
  savon, sucre et sel. ». Noms vides ignorés, jamais de phrase fabriquée.
- **Arbitrage documenté** : la limite globale de 12 lignes dictées du détail
  reste respectée — les lignes stock (≤ 2) sont prioritaires (sécurité du
  commerce) et consomment le budget du détail VENTES (les dernières lignes
  optionnelles de la liste tombent dans le « et N autres ventes » honnête, le
  total réel complet est toujours dicté) ; le détail des DÉPENSES et les
  totaux ne sont JAMAIS amputés. Sans alertes (paramètre absent, vide ou noms
  vides) : dicté STRICTEMENT inchangé (non-régression testée, MODE-909 inclus).

### Carte « Ma journée en chiffres » (§25 — écran Mode Marché)

- Carte sous la grille de métriques de la section « Aujourd'hui » : ventes du
  jour (nb), chiffre d'affaires du jour (formatFCFA), variation vs hier **si
  disponible** (« En hausse de X % » / « En baisse de X % » — icônes
  TrendingUp/TrendingDown, vert/ambre), « Crédits en cours » (total dû via
  `totalOutstandingCfa()` du credits-store MODE-906) et « N points de vente
  actifs » (MODE-908, affiché au-delà de la « Boutique » seule déjà visible
  sur la carte point de vente).
- **Réutilisations** : `collectTodaySales` (ventes + CA du jour, serveur + file
  offline + repli agrégats — ne lève jamais) ; agrégateur pur `buildVentesSummary`
  et `percentChange` de `src/lib/ventes-jour.ts`, exposés par le nouveau module
  PUR `src/lib/market-mode/day-stats.ts` (montants écrêtés entiers) — la
  définition du CA et de la variation ne peut pas diverger du backoffice.
- **Variation vs hier** : source serveur = route ventes EXISTANTE, bornes
  `yesterdayUtcRange()` (hier 00:00 → aujourd'hui 00:00 UTC — même définition
  du « jour » que le BO, `dayRangeUtc`/`todayDateStr`/`shiftDateStr`) ; ventes
  annulées exclues (MODE-909). Repli LOCAL sans réseau : la session marché
  clôturée HIER (persistée dans `julaba-market-mode`) porte son `salesTotal`.
  Donnée absente ou hier à zéro → la ligne de variation disparaît simplement.
- **Offline-first** : le rendu part des sources locales (agrégats caisse,
  crédits, points de vente, session persistée) puis se raffine en tâche de
  fond — JAMAIS de fetch bloquant, JAMAIS d'erreur affichée ; l'absence de
  données = valeur zéro honnête. Dérivations en useMemo HORS sélecteurs
  zustand (INCIDENT-006 : jamais une fonction dans un sélecteur).

### Alertes (§26 — constat, compléments)

- **Constat — déjà vivant, rien réinventé** : stock faible/épuisé
  (`notifyStockLevel` du stock-store, dédupliqué par produit+jour, seuils
  STK-806), crédit (catégorie `credit` + builders MODE-906, déclenchés
  best-effort par le store), synchronisation (`syncQueued`/`syncCompleted`).
- **(a) Préférences — décision MODE-906 vérifiée et documentée** : la
  catégorie `credit` a un libellé (`Crédits clients`) pour le centre de
  notifications mais reste HORS de `NOTIFICATION_CATEGORIES` (périmètre
  affichable figé à 12 catégories par le test `preferences.test.ts`) —
  préférence non réglable = « on » par défaut (`effectiveCategoryPref`) :
  les alertes crédit s'affichent toujours, personne ne peut les couper par
  accident. Décision NON forcée, figée par un test dédié.
- **(b) Non-régression des builders crédit** : nouveau fichier
  `credit-events.test.ts` — `creditRecordedInput`/`repaymentReceivedInput`
  (catégorie, titres « Crédit enregistré » / « Paiement enregistré » /
  « Dette soldée », montants FCFA formatés, action vers « Mes crédits »,
  aucun emoji). Garde sur du code livré en 74-b : vert d'emblée par
  construction.

**Hors périmètre v1 (documenté).** Graphe du CA par heure à l'écran marché
(`revenueByHour` de ventes-jour est prêt côté agrégateur), export des
statistiques, relances crédit planifiées (le scheduler tontine est le pattern
futur), smoke Android (MODE-912, appareil requis).

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

## 9ter. Mots de réveil et commandes visibles dans Mode Marché

Le gestionnaire `WakeWordManager` est monté au niveau de l'application, et
reste donc actif sur l'écran Mode Marché lorsque les réglages **Voix** et
**Mot de réveil** sont activés. L'écran rappelle désormais explicitement cette
capacité afin que la marchande n'ait pas à mémoriser une seule prononciation.

Les variantes reconnues sont : `Tata`, `Tatah`, `Ta ta`, `T ata`, `Julaba`,
`Djulaba`, `Jula ba` et `Jou laba`. Les formes d'appel `Assistant Tata` et
`Madame Tata` sont également acceptées par le moteur. Après le réveil, la
commande est extraite puis transmise au même parseur vocal offline que depuis
les autres écrans.

Exemples affichés dans l'interface : « Tata, j'ai vendu deux tomates »,
« Julaba, ouvre mes ventes », « Tata, combien j'ai vendu aujourd'hui ? » et
« Tatah, annule la dernière vente ». Ils couvrent respectivement la vente,
la navigation, la consultation du bilan et l'annulation contrôlée d'une
vente. Le bouton microphone reste disponible comme repli lorsque le mot de
réveil est désactivé ou indisponible.

## 10. Tests

- **Unitaires (vitest, 1126/1126 — 76 fichiers)** : builders de session (open/close,
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
  snapshot) ; MODE-909 : store caisse journalTodaySale/reverseSale (journal
  append-only, file 'sale-reversal' avec clientId UUID, stock local en DELTA
  +qty, agrégats jamais sous 0, REFUS déjà annulée, raison 3-200, vente
  introuvable, sans marchand = pas de file, lastCancellableSale saute les
  annulées), schéma createSaleReversalSchema (bornes raison 3-200, ids min
  8, trim), route sale-reversals (RPC created 201 / rejeu 200 idempotent,
  422 « Vente introuvable », 42P01 → 503, repli PGRST202 non transactionnel
  : insert + mouvements best-effort CUSTOMER_RETURN avec operation_id dérivé
  déterministe, non suivi ignoré, skip stock noté, 23505 → relecture → 200,
  idempotence du rejeu), GET sales annulee (marquage, liste intacte,
  totalRevenue exclut l'annulée, cancelledCount, 42P01 toléré), phrases
  reversal (phrase imposée sans « supprim » ni emoji, confirmation avec
  formatMontantParle, libellé produit 1/N articles, raisons rapides 3-200),
  intent vocal annule_vente (impératif/infinitif/participe/possessif,
  accents, non-capture « annule tout »/« annule » seul/stock, vente et
  crédit jamais captées), résumé du jour (annulées exclues du dicté,
  « N vente(s) annulée(s) non comptée(s). », bilan vide honnête, dicté
  STRICTEMENT inchangé sans annulation) ; MODE-910 : résumé enrichi
  (alertes stock — un épuisé / plusieurs avec liste max 3 « et » final,
  épuisés d'abord, presque épuisés ensuite, une ligne max par catégorie,
  fin de dicté, noms vides ignorés, journée vide quand même alertée,
  budget : lignes stock consommées sur le détail VENTES « et N autres
  ventes » avec total réel intact, détail des DÉPENSES jamais amputé,
  dicté STRICTEMENT inchangé sans alertes), agrégats purs day-stats
  (buildDayStats : CA/ventes du jour, variation vs hier — hausse, baisse,
  hier inconnu/nul → null, montants non entiers écrêtés, zéro honnête ;
  yesterdayRevenueFromServerSales : annulées exclues, vide → 0 ;
  yesterdayRevenueFromSession : session clôturée hier → salesTotal,
  ouverte/avant-hier/absente → null ; yesterdayUtcRange : bornes UTC
  d'hier), notifications crédit (builders creditRecordedInput/
  repaymentReceivedInput : catégorie, titres, montants FCFA, action
  « Mes crédits », aucun emoji ; décision préférences figée : 'credit'
  hors des 12 catégories affichables, défaut « on »).
- **E2E navigateur (vérifié)** : activation → configuration Adjamé →
  ouverture de journée 5 000 F → entité `market-session` open en file →
  clôture avec caisse comptée 4 500 F → 2 entrées, même `clientId`,
  `endingCash: 4500`.
- **pgTAP** : à jouer avec `bun run test:rls` après `bun run supabase:push`
  (tables `merchant_market_sessions`, `merchant_selling_points`,
  `merchant_sale_reversals`).
- **Android réel (§44)** : BLOQUÉ en sandbox (rejoint B5-052) — scénario 16
  étapes du cahier des charges à exécuter sur appareil.

## 11. Restant (registre MODE-908..912)

Checklist §45 complète + smoke Android (912). Crédits/remboursements +
modes de paiement : **livrés (906, Task 74-b)**. Fournisseurs : **livrés
(907, Task 74-c)** — reste hors périmètre assumé : vente vocale à crédit
avec panier stock (la vente à crédit passe par la caisse),
échéanciers/relances, annulation d'op de crédit, paiements aux
fournisseurs (écriture de balance), rattachement des commandes
`legacy_supplier_orders` (texte libre) à l'annuaire. Points de vente :
**livrés (908, Task 74-d)** — reste hors périmètre assumé : stock par
point, transferts entre points, réconciliation serveur → local de la
liste, désarchivage. Annulation de vente : **livrée (909, Task 74-e)** —
reste hors périmètre assumé : remboursement cash en caisse (le retour stock
ne restitue pas l'argent), annulation d'une vente d'un autre jour/appareil,
reversal d'une vente à crédit ne touchant pas le solde du partenaire,
annulation d'op de crédit, échéanciers. Résumé enrichi + stats + alertes :
**livrés (910, Task 74-f)** — reste hors périmètre assumé : graphe du CA
par heure à l'écran marché (agrégateur `revenueByHour` prêt), export des
statistiques, relances crédit planifiées (pattern futur = scheduler
tontine), smoke Android (912, appareil requis).
