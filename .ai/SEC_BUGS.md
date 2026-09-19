# SEC_BUGS.md — Vulnérabilités ouvertes (régistre de suivi)

*Cycle de vie : DÉTECTÉ (DEV SÉCURITÉ / AUDIT) → CORRECTION → RE-AUDIT indépendant → FERMÉ. Les fixes fermés sont historisés dans SECURITY_AUDIT.md (SEC-813, SEC-814 fermés et validés live le 2026-09-19).*

## Ouverts

### SEC-OBS-2 — TTL session appareil 365 jours sans rotation (BAS)
- **Détecté** : AUDIT-001 (2026-09-19), sous-audit sécurité
- **Preuve** : `src/lib/device-session.ts:6` (TTL 365 j) ; `revoked_at` non exploité dans `getDeviceSubject`
- **Risque** : vol de cookie longue durée sur appareil partagé ; pas de re-authentification périodique
- **Correctif envisagé** : rotation du token à intervalle + re-PIN périodique ; exploitation systématique de `revoked_at`
- **Priorité** : P3 — **Statut : OUVERT**

### SEC-OBS-3 — Cookie `secure` conditionnel au NODE_ENV (BAS)
- **Preuve** : `device-session.ts:90`, `backoffice-auth/session.ts:103` (`secure: NODE_ENV === 'production'`)
- **Risque** : un déploiement staging servi en HTTPS (NODE_ENV ≠ production) émet des cookies non-Secure
- **Correctif envisagé** : `secure` inconditionnel (le app tourne toujours derrière HTTPS ; local exempté via `x-forwarded-proto`)
- **Priorité** : P3 — **Statut : OUVERT**

### SEC-OBS-4 — Garde d'import `server-only` absente + typage `any` du client admin (BAS)
- **Preuve** : `src/lib/supabase/admin.ts:4,30`
- **Risque** : import client par erreur non intercepté à la compilation (protection par convention seulement)
- **Correctif envisagé** : `import 'server-only'` en tête + types générés (dépend NORM-305)
- **Priorité** : P3 — **Statut : OUVERT (couplé à NORM-305)**

## Fermés (résumé — détail dans SECURITY_AUDIT.md)

| ID | Sévérité | Fermé le | Validation |
|---|---|---|---|
| SEC-813 | HAUT | 2026-09-19 | Live : anon/authenticated/PUBLIC sans EXECUTE ×8, service_role seul |
| SEC-814 | HAUT | 2026-09-19 | Live : RLS deny-all, grants postgres+service_role uniquement |
