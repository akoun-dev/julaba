# ADR-002 — Offline idempotent : operation_id UUID déterministe client-side

- **Statut** : ACCEPTÉ (STK-808/809 ; fix opérationnel `20260919110000`/`110100`)
- **Date** : 2026-09-19 (rétro-documentation)
- **Décideurs** : AGENT 1 ; implémentation DEV BACKEND ; validation pgTAP (STK-812)
- **Contexte** : les opérations stock peuvent être rejouées des jours plus tard (file offline localStorage, cap 500) ou dupliquées par retry réseau. Un compteur client serait collision-prone entre appareils ; un UUID aléatoire casse le rejeu déterministe du même item en file.
- **Options rejetées** : UUID v4 pur (non déterministe entre deux queues du même payload — rejeu = doublon si l'id est régénéré) ; timestamp+merchant (collisions horloges) ; déduplication serveur par hash du payload (coûteux, ambigu avec retouches légales du même panier).
- **Décision** :
  1. Côté client : `operationUuid = md5(clientId lisible)` → **même payload re-queue = même UUID** (technique identique au backfill d'ouverture).
  2. Côté DB : `UNIQUE(merchant_id, operation_id)` sur `merchant_stock_movements` ; les RPC vérifient l'idempotence AVANT toute écriture (rejeu → résultat stable, pas de double décrément).
  3. Côté sync : 18 handlers idempotents ; **4xx (ex. 422 INSUFFICIENT_STOCK) = conflit définitif, jamais remis en file** ; refresh des balances post-flush (throttle 2 s).
- **Conséquences** : + rejeus sûrs, pas de double vente ; + le refus serveur reste l'autorité (refus strict 3 niveaux STK-805) ; − le md5 d'un clientId lisible doit rester unique par domaine métier (convention `entite:id local`).
- **Preuves** : `stock-service.ts` (`operationUuid`, `parseStockRpcError`), `sync-handlers.ts` (18 handlers), pgTAP 108 assertions (idempotence, concurrence 7+5 sur 10 → jamais −2), tests `sync-handlers-stock.test.ts`.
