# Registre des régressions — Jùlaba

*Une régression = une fonctionnalité précédemment fonctionnelle qui cesse de l'être à la suite d'une modification.*

## Régressions actives

Aucune régression active détectée au 2026-09-18 (baseline : 480/480 tests verts, tsc 0 erreur, workflows WF1–WF8 conformes à leur état livré).

## Historique des régressions corrigées (avant la création de ce dossier)

| Date | Régression | Cause racine | Correctif |
|------|-----------|--------------|-----------|
| 2026-09-17 (Task 41) | « Voix ultra naturelle » (Kokoro) ne se télécharge plus en production | CSP production sans `'wasm-unsafe-eval'` → `WebAssembly.instantiate()` rejeté APRÈS le téléchargement du modèle ; erreur avalée par le handler | `next.config.ts` CSP + messages d'erreur explicites sous les boutons (marchand + producteur) — commit `6c3f77d` |
| 2026-09-17 (Task 38) | « Compte déjà utilisé sur un autre appareil » bloquait les connexions légitimes | Blocage session trop strict | Retrait du blocage — commit `3ebadec` |

## Régressions à surveiller lors de la roadmap multilingue (anticipation AGENT 2)

1. **Routing fr** : toute évolution de `stt-factory.ts` (B4/B5) doit garder la chaîne fr intacte (suite `stt-routing.test.ts` verte).
2. **Narration par défaut** : l'ajout du TTS bci (B3) ne doit pas casser la narration française par défaut ni le signal `notifyBciNarrationLimitOnce` pour les utilisateurs sans la voix bci.
3. **CSP** : toute nouvelle dépendance WASM (NLLB B2) doit rester compatible avec la CSP production (le piège Task 41) — vérifier en build de prod, pas seulement en dev (devScriptPolicy masque les manques).
4. **Parseur d'intents** : la traduction NLLB en amont (B2) ne doit pas altérer les 49 cas de test `localIntent` (le parseur continue de recevoir du français).
