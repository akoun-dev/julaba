# Workflows métier de bout en bout — Jùlaba

*À préserver à chaque modification — tout changement AGENT 1 doit être testé contre ces workflows (AGENT 2).*

## WF1 — Onboarding → inscription marchand
`onboarding-screen` (Tata parle) → `auth-screen` inscription (PIN/schéma/visuel) → `registerMerchantAccount()` → `POST /api/merchant` (ou file offline) → claim session appareil → accueil + narration par écran.

## WF2 — Login multi-comptes marchand/producteur
Numéro de téléphone → `/api/auth/lookup` (détecte le rôle) → cache `julaba-account-<tel>` → écran code adapté ou biométrie → `setAuth` role-aware → re-liaison appareil → flush file offline.

## WF3 — Vente vocale (cœur métier — impacté par la roadmap multilingue)
Wake-word « Julaba » / bouton Tata → `voice-modal` → STT (langue sélectionnée : fr = VoiceService/Sherpa ; bci = Omnilingual) → `parseIntent` → (si navigation : Gemma locale) → confirmation vocale Tata → `completeQuickSale` (`quick-sale.ts`) → `POST /api/marchand/sales` ou file `sale` → décrément stock + stats → « enregistré, autre chose ? ».
> ⚠️ Roadmap B4 : ce workflow sera étendu — STT bci → **traduction NLLB bci→fra** → parseIntent → IA → **traduction fra→bci** → **TTS bci**. Les confirmations oui/non doivent devenir bilingues.

## WF4 — Déclaration de récolte vocale (producteur)
`prod-voice-modal` → « j'ai récolté 100 kilos de manioc » → `prodIntent.ts` → relecture à voix haute + « oui » explicite obligatoire → `POST /api/producteur/recoltes` (jamais d'écriture silencieuse).

## WF5 — Enrôlement identificateur → validation backoffice
`ident-auth` (PIN ou code JID-XXXX) → wizard 5 étapes (CNI+OCR → photo → détails → GPS → autorisation) → auto-save 30 s → `submitDossierToServer()` (synced/queued/lost) → `/api/backoffice/enrolments` → validation/rejet/demande d'info BO → acteur créé + notification agent.

## WF6 — Authentification backoffice
Credentials → `/api/backoffice/login` → MFA OrbitOtp → `mfa/verify` → session cookie → `BoGate` (refus sans session serveur confirmée) → sidebar RBAC → modules.

## WF7 — Synchro offline (transverse)
Reprise réseau/focus → `sync-flusher` → rejeu FIFO des 12 handlers → succès (idempotence `client_id`) ou conflit persisté → `/api/sync-conflicts/report` → écran BO sync-conflicts.
> Règle : Keiwa et création de tontine restent volontairement en ligne seule (intégrité financière).

## WF8 — Téléchargement de modèles opt-in (transverse, pattern à réutiliser pour NLLB)
Profil → carte modèle (Gemma 558 Mo / Piper ~25 Mo / Kokoro ~86 Mo) → téléchargement avec progression → stockage cache → garde `isXReady()` avant usage → messages d'erreur explicites affichés sous les boutons (Task 41).
> Roadmap B2/B3 : même pattern obligatoire pour le modèle NLLB et la voix bci TTS.
