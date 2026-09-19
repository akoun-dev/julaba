# SPEC-MODE-906 — Crédits clients + remboursements (cahier Mode Marché §9/§21-22/§27-28)

Statut : livré (Task 74-b — tests d'abord, gates vertes ; migrations écrites, à pousser avec `bun run supabase:push`). Prérequis : MODE-901..905 livrés (Task 71), stock STK-804/805.

## 1. Principe
Vendre à crédit, suivre les dettes clients, encaisser les remboursements —
100 % offline-first : local d'abord, file de sync ensuite ; l'offline n'est
JAMAIS une erreur. Montants en FCFA entiers. Zéro emoji. La voix marchande
tutoie (phrases crédit) et parle tata (formatMontantParle).

## 2. Modèle de données (grand livre de crédit PROPRE)
- `merchant_credit_ops` (append-only, `kind` 'credit'|'repayment') : journal
  des opérations de crédit, `UNIQUE (merchant_id, operation_id)` = idempotence.
  Jamais de DELETE/UPDATE d'une vente ni d'une op.
- Une vente à crédit = la vente existante (autorité stock, `legacy_sales` +
  `payment_method` 'credit') + une op de crédit liée par `sale_client_id`.
- `business_partners` (kind 'client') = le client nommé ; `balance_cfa` signé :
  > 0 le client doit au marchand, < 0 le marchand doit au client. Le serveur
  fait foi à la sync ; le solde local (store) sert à l'UI offline.

## 3. Idempotence et refus métier
- `client_id` unique sur ops et partenaires ; rejeu offline = MÊME payload ;
  serveur 200 si déjà connu, 201 si créé ; course 23505 → relecture → 200.
- Un remboursement ne dépasse JAMAIS la dette : nouveau solde < 0 refusé →
  `REPAYMENT_EXCEEDS_DEBT` + `{ balanceCfa }` en 422 (4xx définitif = retiré
  de la file, conflit rapporté). La RPC verrouille le partenaire FOR UPDATE ;
  repli non transactionnel (RPC absente PGRST202) re-relit le solde avant
  UPDATE. Table absente (42P01) → 503 transitoire (reste en file).

## 4. Offline
- File : deux entités `'merchant-partner'` et `'credit-op'` (handlers dans
  sync-handlers.ts, rejeu verbatim via jsonRequest, même URL/méthode que le
  live). Le store `credits-store` ('julaba-credits-store') journalise localement
  (ops cap 200) et met en file ; il ne fait JAMAIS de réseau.

## 5. API
- `POST/GET /api/marchand/partners` — upsert idempotent par client_id
  (kind client/fournisseur), GET scoppé merchant_id, limit 200.
- `POST/GET /api/marchand/credit-ops` — résolution partenaire par
  partnerClientId (création à la volée si inconnu, partnerName requis),
  RPC `merchant_record_credit_op`, repli PGRST202, GET 50 dernières ops.
- `createSaleSchema` gagne `paymentMethod` (défaut 'especes') ; la route
  l'écrit dans `legacy_sales` seulement si ≠ 'especes' (compatible avant/après
  migration).

## 6. Voix et UI
- Intents : `credit_doit` (« Adjoua me doit 5 000 francs »), `credit_paye`
  (« Adjoua m'a payé les 3 000 francs ») — noms 1-3 mots, montants lettres ou
  chiffres ; ne capte jamais vente/stock. `credit_block` devient une aide
  (caisse Crédit ou dictée de dette). Confirmation à la voix avant toute
  écriture (§Tata) ; « non » → « Je n'ai rien noté. »
- Phrases pures (`credit-phrases.ts`) : creditRecordedPhrase,
  repaymentRecordedPhrase, repaymentExceedsDebtPhrase, debtTotalPhrase.
- UI : écran « Mes crédits » (route 'credits'), tuile accueil, accès secondaires
  Mode Marché, sélecteur de paiement caisse (Espèces/Mobile Money/Crédit/Autre ;
  Crédit → nom du client requis, montant reçu masqué, op de crédit liée à la
  vente par saleClientId).

## 7. Notifications
Catégorie 'credit' (types + libellés), builders creditRecordedInput /
repaymentReceivedInput, déclenchés best-effort dans les actions du store.

## 8. Hors périmètre (volontaire)
Vente vocale à crédit complète avec panier stock, échéanciers/relances,
intégration fournisseurs (MODE-907), annulation d'op de crédit.
