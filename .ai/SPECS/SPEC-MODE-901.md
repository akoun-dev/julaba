# SPEC-MODE-901 — Fondation « Mode Marché » (MODE-901..905, Task 71)

Source : cahier des charges 48 sections §4-8, §34, §40, §45-46 · plan `.ai/PLAN_MARKET_MODE.md`.

## Périmètre

1. **Store** `src/lib/market-mode/market-mode-store.ts` (zustand persist `julaba-market-mode-store`) :
   - état : `activated`, `market {name, locationMode 'gps'|'select'|'none'}`, `lastPosition {lat,lng,accuracy?,timestamp}|null`, `lastSession|null`, `gpsStatus 'idle'|'captured'|'refused'|'unavailable'`.
   - actions : `activateMarketMode(config)`, `deactivate()`, `setPosition(pos)`, `onSessionOpened({sessionId,fondDeCaisse,openedAt})`, `onSessionClosed({sessionId,closedAt,countedCash,salesTotal,expensesTotal})`.
   - `onSessionOpened/Closed` : construisent l'enregistrement (builders purs de `market-session.ts`), le stockent dans `lastSession`, le mettent en file (`queuePendingSync('market-session', …)`) **uniquement si activé** — sinon no-op.
2. **Géo** `geo.ts` : `captureCurrentPosition()` → `{status:'captured',position}|{status:'refused'}|{status:'unavailable'}` — Capacitor Geolocation d'abord, repli `navigator.geolocation`, timeout 10 s, JAMAIS throw (§6, pattern biometric-auth).
3. **Connectivité** `connectivity.ts` : `buildConnectivityView(connected, pendingCount, flushing)` pur → 4 états `offline|syncing|pending|synced` (§34) + libellés FR exacts (« Hors connexion », « Synchronisation… », « N opération(s) en attente », « À jour »). `offline-db` expose `isSyncFlushInProgress()` (compteur incrémenté/décrémenté dans `finally`).
4. **Session marché** (§7-8) : migration `merchant_market_sessions` (RLS service_role, `client_id` unique), route `POST/GET /api/marchand/market-sessions` (upsert idempotent par `client_id`, zod, `requireDeviceOwner`), handler offline `market-session`, branchement dans `caisse-store.openSession/closeSession` (sens unique caisse → market-mode, zéro cycle).
5. **Écran** `market-mode-screen.tsx` (§40) : bandeau connectivité, carte journée (ouverte → « Fermer ma journée » via `openCloseDay` ; fermée → « Commencer ma journée » via `openOpenCaisseModal`), actions primaires (Tata → `openVoiceModal`+auto-record si caisse ouverte, sinon modale caisse — verrou F9 identique bottom-bar ; Nouvelle vente → `openVenteRapideModal` ; Mon stock / Ma caisse → navigate ; Mes crédits → tuile « Bientôt » honnête ; Résumé du jour → `collectTodaySales` + `buildDaySummarySpeech` + `tataSpeak`), accès secondaires (Dépenses/Transferts/Historique/Commandes/Fournisseurs=Marché Jùlaba/Profil ; Clients → « Bientôt »).
6. **Activation/config** (§4-6) : modale 2 étapes — écran 1 copie EXACTE du cahier (« Activer le Mode Marché / Continuez à gérer votre activité… / [Activer le Mode Marché] ») ; écran 2 radio « Utiliser ma position actuelle / Choisir un marché / Ne pas enregistrer la position » + liste marchés provisoire + « Autre » + demande de permission SEULEMENT si « position actuelle » ; refus GPS → information, continuation (non bloquant).
7. **Intégration** : route `'mode-marche'` + case page.tsx + narration ; tuile « Mode Marché » en tête du menu rapide accueil.

## Hors périmètre (tâches dédiées)

Modes de paiement/crédits/remboursements (MODE-906), fournisseurs CRUD (907), points de vente multiples (908), annulation vente (909), stats/stock faible dans le résumé (910).

## Verrous de tests (écrits AVANT le code)

- store : activation non activée → sessions ignorées ; activée → record open (clientId = sessionId, startingCash, startedAt, marché, statut 'open') + close (endingCash = counted ?? start+ventes−dépenses, statut 'closed') ; file appelée 2 fois même clientId.
- geo : capturé (mock natif), refusé (permission), indisponible (aucun moteur), timeout web — aucun throw.
- connectivity : 4 états + pluriels + detail null si 0 en attente hors ligne.
- session builder : montants entiers FCFA, position optionnelle selon locationMode, marché absent si 'none'.
- markets : liste non vide, « Autre » exige un nom libre.
- flush counter : isSyncFlushInProgress vrai pendant un flush, faux après (y compris sur échec handler).

## Gates

vitest ≥ 901 + nouveaux verts · tsc 0 · eslint 0 · zéro régression (baseline 901/901).
