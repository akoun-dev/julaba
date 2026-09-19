# SPEC-BUG-002 — Router l'intent vocal `restock` sur le chemin achat serveur-vérité

*Source : BUG-002 (AUDIT-001 / COH-002) — `.ai/BUGS.md` · Priorité P2 · Agent 1 (Tech Lead)*
*Statut : IMPLÉMENTÉE — voir CHANGELOG Task 68*

## 1. Problème

L'intent vocal `restock` (« reçu / réappro / livré / livraison / stock reçu » —
`RESTOCK_KEYWORDS`, localIntent.ts:227) est le **dernier survivant de l'ancien
pattern absolu** interdit par D3 (STK-805) et supprimé de l'UI par STK-811 :

```
voice-modal.tsx:245 (avant correctif)
updateProduct(product.id, { stockQty: product.stockQty + addedQty })
```

Conséquences mesurées :
1. **Dérive silencieuse** entre la projection UI locale (`product-update` en
   file offline = PATCH de la ligne produit) et la balance serveur
   `merchant_stock_balances` — exactement la classe de bug que D3 interdit.
2. **Aucun mouvement PURCHASE** journalisé → l'Historique (HISTORIQUE) ne
   montre pas le réappro, le coût moyen pondéré n'est jamais alimenté.
3. **Quantité fantôme** : `intent.quantity || 1` ajoutait silencieusement 1
   unité quand la quantité n'était pas dictée.

## 2. Décision

Le `restock` suit **exactement le chemin de l'achat dicté** (STK-807 §10) —
même RPC, même file offline, même idempotence, mêmes refus parlés :

| Étape            | Contrat                                                                             |
| ---------------- | ----------------------------------------------------------------------------------- |
| Déclencheur      | `intent.type === 'restock'` routé dans la branche `purchase` du modal (un seul code) |
| Résolution qté   | `resolveSpokenQuantity(intent.quantity, intent.unit, config)` — **plus de `\|\| 1`** ; quantité absente → « Je n'ai pas compris la quantité. Répète. » (honnête) |
| RPC              | `POST /api/marchand/purchases` → `merchant_record_purchase` (mouvement PURCHASE + CMUP) |
| Payload          | builder pur partagé `buildStockPurchasePayload` (voice-stock.ts) — un seul contrat pour `purchase` et `restock` |
| Idempotence      | `clientId = stockOperationClientId('achat')` — rejeu offline = un seul achat         |
| Hors ligne       | file `stock-purchase` (handler sync existant, testé `sync-handlers-stock.test.ts`)   |
| Refus serveur    | message parlé `body.erreur` (refus métier honnête)                                   |
| Delta local      | `adjustLocalStock(productId, +quantityBase)` **post-verdict uniquement** (D3)        |
| Confirmation     | `formatPurchaseConfirmation` — « Achat enregistré : … »                              |
| Produit inconnu  | `intent.product ? 'Produit introuvable dans le stock.' : 'Sur quel produit ?'` (aligné sur les autres intents stock, ligne 257) |

## 3. Hors périmètre

- **Aucun changement NLU** : le type `restock` et `RESTOCK_KEYWORDS` restent —
  c'est le *routage* qui change, pas la classification. Les tests NLU existants
  (localIntent.test.ts:225 « détecte un restock ») doivent rester verts.
- Aucun changement de la route `/api/marchand/purchases` ni de la RPC.
- Aucun changement du handler sync `stock-purchase`.

## 4. Testabilité (exigée par BUGS.md : « test dédié intent restock → achat RPC »)

Le modal n'est pas testé au niveau composant (dette assumée). Le contrat est
donc rendu testable par un **builder pur** dans `voice-stock.ts` (module PUR :
ni store ni réseau) :

- `buildStockPurchasePayload({ merchantId, product, intent, quantityBase })`
  → `{ apiPath, offlineEntity, payload }`.
- **Test dédié** : un intent `restock` et un intent `purchase` équivalents
  produisent le **même** contrat — `apiPath: '/api/marchand/purchases'`,
  `offlineEntity: 'stock-purchase'`, `clientId` préfixé `achat-`,
  `quantityBase` converti, `unitCostCfa` par défaut 0 (réappro sans prix dicté).

## 5. Validation attendue

1. vitest vert (`bun run test`) — nouveau test dédié inclus.
2. tsc 0 erreur, eslint 0 erreur.
3. La chaîne complète « reçu 10 kilos de tomates » → confirmation → mouvement
   PURCHASE visible dans HISTORIQUE (vérification appareil — rejoint la smoke
   vocale existante B5-052).
