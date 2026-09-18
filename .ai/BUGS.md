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
