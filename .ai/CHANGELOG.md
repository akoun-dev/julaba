# Changelog — Jùlaba

*Format : date · commit · type · description. Les entrées antérieures au 2026-09-18 sont dans `worklog.md` (racine du dépôt).*

## 2026-09-18 (avant prise en charge multi-agents — historique récent)

- `ce8aa12` feat(vente) : enregistrer les ventes vocales et gérer la synchronisation — `src/lib/quick-sale.ts` (service partagé), étape de confirmation vocale dans `vente-rapide-modal.tsx`, bascule `voice-modal.tsx` sur `completeQuickSale`. ⚠️ Introduit 2 erreurs lint (BUG-001).
- `6c3f77d` fix(voix) : CSP `'wasm-unsafe-eval'` — Kokoro/Piper instanciables en production (Task 41) + messages d'erreur de téléchargement.
- `bfec4f8` feat(voix) : langue par défaut Français/Baoulé dans les réglages marchand + producteur (Task 40).
- `601da3b` fix(auth) : voix de la connexion toujours en français.
- `b1ab5f4` feat(auth) : redesign section code secret « terre ».
- `3ebadec` fix(session) : retrait du blocage « compte déjà utilisé sur un autre appareil ».

## 2026-09-18 (système multi-agents)

- **[ANALYSE]** Analyse complète du projet exécutée (AGENT 1 audit technique + AGENT 2 inventaire fonctionnel) après réinitialisation du sandbox (repo re-cloné, deps réinstallées, baseline revalidée).
- **[PILOTAGE]** Création du dossier `.ai/` (14 fichiers) + registre `TASKS.xlsx` — référentiel initial : 10 fonctionnalités livrées, 5 étapes roadmap Baoulé (B1 existant/B2-B5 à construire), 5 tâches de normalisation, 2 tâches d'infra, 1 bug (BUG-001).
- **[BASELINE]** 480/480 tests verts · tsc 0 erreur · eslint 2 erreurs (BUG-001, préexistantes).

## Décisions d'architecture enregistrées

1. **DADR-001** — La traduction NLLB-200 (B2) suivra le pattern établi des modèles opt-in (`kokoro-tts.ts`) : téléchargement sur action utilisateur, Cache API, progression, erreurs explicites, compat CSP `'wasm-unsafe-eval'`.
2. **DADR-002** — Le module `BaouleVoiceEngine` (B5) sera un module TS unifié côté app (comme `voice-service.ts`), les modèles lourds restant côté natif (pattern VoiceServicePlugin) ou WASM opt-in.
3. **DADR-003** — Ne pas introduire de couche repository côté serveur dans l'immédiat (pas de violation client actuelle ; normalisation serveur différée NORM-30x, non bloquante pour la roadmap).
