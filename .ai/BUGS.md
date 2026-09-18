# Registre des bugs — Jùlaba

*Cycle de vie : DÉTECTÉ (AGENT 2) → CORRECTION (AGENT 1) → RETEST (AGENT 2) → FERMÉ.*

## BUG-001 — 2 erreurs eslint `react-hooks/immutability` dans `vente-rapide-modal.tsx`
- **Statut** : CORRECTION (à confier à AGENT 1 — première tâche de correction)
- **Priorité** : P2 (échoue le gate lint, introduit par commit `ce8aa12` — session concurrente)
- **Fonctionnalité** : vente rapide vocale / étape de confirmation
- **Fichiers** : `src/components/marchand/vente-rapide-modal.tsx` (lignes ~63 et ~91 : `startListening` useCallback + useEffect « Speak the prompt on open »)
- **Reproduction** : `bunx eslint .` → 2 erreurs `react-hooks/immutability`
- **Résultat attendu** : `bunx eslint .` → 0 erreur, suite de tests intacte (480 verts)
- **Note** : détecté à la baseline du 2026-09-18, avant toute modification de notre part.

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
