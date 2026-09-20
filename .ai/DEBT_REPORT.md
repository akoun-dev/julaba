# DEBT_REPORT.md — Dette technique (AUDIT-001, 2026-09-19)

*Établi par AGENT AUDIT GLOBAL à HEAD `0f71025`. Chaque item : preuve, classification, effort (S/M/L/XL), priorité, impact si non corrigé.*

## CRITIQUE — aucune

## MAJEUR

| ID | Item | Preuve | Effort | Priorité | Impact si non corrigé |
|---|---|---|---|---|---|
| DET-001 | **12 fichiers > 500 l.** hors types générés : auth-screen 2177, ident-identification-screen 1710, backoffice-store 1605, profile-screen 1588, secondary-screens 1256, bo-academie 1145, bo-acteurs 1006, ident-profil 986, bo-auth 922, bo-enrolement 915, bo-missions 914, localIntent 905 | `wc -l` AUDIT-001 §2 | M/L par fichier | P3 | Difficulté de revue, risque de régression à chaque retouche, duplication entretenue |
| DET-002 | **`native-tts.ts` sans test dédié** — seul module voice non testé directement (mocké dans tata-tts.test.ts:48, stt-routing.test.ts:30) | AUDIT-001 §7 COH-008 | S | P3 | Le pont natif TTS peut casser sans garde (cf. AUDIT_VOCAL_VENTE_RAPIDE.md) |
| DET-003 | **BUG-002** : intent vocal `restock` = PATCH absolu (dérive balance ↔ stock_qty, pas de mouvement PURCHASE) — traité comme BUG, rappelé ici comme dette de conception | voice-modal.tsx:245, stock-store.ts:200 | M | **P2** | Divergence des vérités stock à chaque réappro vocal |

## MINEUR

| ID | Item | Preuve | Effort | Priorité | Impact |
|---|---|---|---|---|---|
| DET-004 | ~21 `: any` ciblés dans 8 fichiers API (keiwa BO ×5, tontines ×4, ventes BO ×4, sales ×3, marketplace ×2, document-ocr, admin.ts, products) | `rg -c ": any"` AUDIT-001 | S | P4 | Typage affaibli localement, erreurs runtime possibles |
| DET-005 | Code mort répertorié : `supabase/browser.ts`, `ident-top-bar.tsx`, `db/custom.db`, `examples/websocket`, dep `z-ai-web-dev-sdk`, `/api/v1/*` non câblée au front. **Task 90 : import mort `PROD_COLOR` (prod-stock-screen) et doublon `MARCHAND_COLOR` (home-screen) CORRIGÉS.** Classes `dark:` désormais orphelines dans marchand/producteur depuis le retrait du réglage sombre (DET-UI-015) | ARCHITECTURE.md §6.5 | S | P4 | Bruit de lecture, surface d'audit gonflée |
| DET-UI-015 | **Conversion mode sombre (UI-MP-015, Task 90)** : le réglage « sombre » a été RETIRÉ de l'UI (profile-screen) et la classe `dark` n'est plus appliquée (page.tsx) tant que la surface marchand/producteur n'est pas convertie aux jetons sémantiques (`bg-card`, `text-foreground`… sur ~13 fichiers). Le champ `darkMode` reste dans le store (persistance) | audit UI Task 90 | M/L | P3 | Le thème sombre est une feature future ; le mode Soleil couvre la lisibilité terrain |
| DET-006 | Squelettes d'écrans dupliqués assumés : voice-modal (516) vs prod-voice-modal (389), auth-screen (2177) vs prod-auth-screen (560) | ARCHITECTURE.md §6.2/6.3 | L | P4 | Double maintenance à chaque évolution auth/vocal |
| DET-007 | Doublon `'ident-dossier-detail'` dans `ScreenRoute` (app-store.ts:48,51) — union TS masquée par le type | ARCHITECTURE.md §3 | S | P4 | Confusion route, risque de régression navigation |
| DET-008 | `admin.ts` typé `any` volontairement (l.4,30) + absence de garde `server-only` | AUDIT sécurité OBS-4 | S | P3 | Import client possible par erreur (convention seule) |

## Dettes de tests / doc / deps

- **Tests** : aucun module stock non couvert (5/5 modules, 7 fichiers) ; voice 19/22 modules avec test homonyme ; 0 `.skip/.only/.todo` sur toute la suite
- **Doc** : fonctions publiques de stock/voice non JSDocisées en masse — compensé par les registres `.ai/` et les docs spécialisés ; à renforcer à l'occasion (P4)
- **Deps** : rien de critique détecté à ce jour (verrou bun.lock, `--frozen-lockfile` en CI désormais) ; scan CVE à mettre en place avec l'audit perf (P4)

## Priorisation recommandée

1. DET-003 (= BUG-002) — seul item à effet métier direct
2. DET-002 + DET-008 (garde-fous sécurité/voix, petits efforts)
3. DET-001 par tranches UX (auth-screen d'abord) — opportuniste, une tranche par Task
4. DET-004..008 — nettoyage opportuniste lors des retouches
