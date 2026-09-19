# Registre des bugs — Jùlaba

*Cycle de vie : DÉTECTÉ (AGENT 2) → CORRECTION (AGENT 1) → RETEST (AGENT 2) → FERMÉ.*

## BUG-001 — 2 erreurs eslint `react-hooks/immutability` dans `vente-rapide-modal.tsx`
- **Statut** : ✅ **FERMÉ** (corrigé commit `b0a95e1`, 2026-09-18)
- **Priorité** : P2 (échouait le gate lint, introduit par commit `ce8aa12` — session concurrente)
- **Fonctionnalité** : vente rapide vocale / étape de confirmation
- **Fichiers** : `src/components/marchand/vente-rapide-modal.tsx`
- **Cause** : cycle de déclarations `handleSale` → `listenForConfirmation` → `handleConfirmResponse` → `startListening` → `handleSale` (accès à des `useCallback` avant déclaration)
- **Correctif** : refs d'indirection (`listenForConfirmationRef`/`startListeningRef`) synchronisées par `useEffect` — les callbacks différés lisent `.current` ; comportement inchangé
- **Validation** : `bunx eslint .` → 0 erreur ; suite 480/480 (puis 501/501 après B2)

## BUG-002 — Intent vocal « réappro » : PATCH absolu contredit le design stock (D3)
- **Statut** : ✅ **FERMÉ** (corrigé Task 68, 2026-09-19 — spec `.ai/SPECS/SPEC-BUG-002.md`)
- **Priorité** : P2 (dérive silencieuse balance ↔ `stock_qty`, aucun mouvement PURCHASE journalisé)
- **Fonctionnalité** : voix marchand — intent `restock`
- **Preuve initiale** : `src/components/marchand/voice-modal.tsx:245` (`updateProduct(product.id, { stockQty: product.stockQty + addedQty })`) + file `product-update` (`src/lib/stores/stock-store.ts:200`)
- **Contradiction initiale** : STK-805 (D3 : « plus jamais de valeur absolue calculée client ») et STK-811 (réappro absolu SUPPRIMÉ de l'UI `stock-screen.tsx`) — le chemin vocal était le seul survivant de l'ancien pattern
- **Correctif appliqué** : l'intent `restock` est routé dans la **même branche que l'achat dicté** (`voice-modal.tsx` — `intent.type === 'purchase' || intent.type === 'restock'`) : RPC `merchant_record_purchase` via `POST /api/marchand/purchases`, delta local `adjustLocalStock` post-verdict, file offline `stock-purchase` idempotente sur `clientId`, refus métier parlé. Builder pur partagé `buildStockPurchasePayload` (`src/lib/voice/voice-stock.ts`) = un seul contrat achat/réappro, testé. L'ancien `updateProduct({stockQty: +X})` et son défaut `|| 1` silencieux sont **supprimés** (quantité absente → « Je n'ai pas compris la quantité. Répète. »)
- **Validation** : vitest **882/882** (55 fichiers, +3 : `voice-stock-intents.test.ts` — contrat restock = contrat achat, unitCostCfa 0 sans prix dicté, parité prix dicté) · tsc 0 · eslint 0 · suite NLU restock inchangée (localIntent.test.ts:225 verte). Mouvement PURCHASE visible dans HISTORIQUE : vérification appareil (rejoint la smoke B5-052)

## Points d'attention non bloquants (à surveiller, pas des bugs à ce jour)

| # | Sujet | Impact potentiel | Où c'est documenté |
|---|-------|------------------|--------------------|
| 1 | Premier lancement hybrid-remote sans réseau → app inaccessible | UX bloquante en terrain | docs/CAPACITOR.md |
| 2 | APK 294–557 Mo > limites Play Store (AAB requis) | Distribution | docs/CAPACITOR.md |
| 3 | Piper/Kokoro à revalider sur appareil Android réel (mémoire WebView) | Voix de secours | docs/IA_LOCALE.md, kokoro-tts.ts L84-87 |
| 4 | Premier claim identificateur sans preuve serveur | Sécurité session | docs/SUPABASE_ARCHITECTURE.md §3.1 |
| 5 | `simpleHash` PIN + rate-limiting en mémoire | Sécurité (assumé démo) | docs/OFFLINE.md |
| 6 | Comptes démo BO `admin123` + MFA « tout code » (seed) | À ne JAMAIS pousser en prod | seed.sql, backoffice-comptes.md |
| 7 | Récompenses fidélité + catalogue fournisseurs mockés en dur | Données factices visibles | secondary-screens.tsx, supplier-catalog.ts |
| 8 | Écrans identificateur (acteurs/statistiques/rapports/dashboard) perdus au reset workspace, non recréés | Périmètre produit | worklog.md Task 18 |
