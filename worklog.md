# Jùlaba Project Worklog

---

Task ID: 1
Agent: Main Orchestrator
Task: Implement Identificateur module — complete field agent identification & enrollment system

Work Log:

-   Extended `app-store.ts` with `UserRole` type (`'marchand' | 'identificateur'`), 11 new Identificateur screen routes, `userRole`/`setUserRole` state, role-aware `setAuth`, `goBack`, `logout`, and `onRehydrateStorage`
-   Added brown `#9F8170` "Identificateur" button (top-right) on Marchand auth screen → navigates to `ident-auth`
-   Created `identificateur-store.ts` with full Dossier schema (actor types, GPS, documents, dynamic fields per type), agent zone/mission management, screen sensitivity toggle, and constants (ZONES, ACTIVITES, PRODUITS)
-   Created `ident-auth-screen.tsx` — simplified PIN-only auth for field agents (no voice/pattern/visual), with registration and login flows, demo account (05 55 55 55 55 / 0000)
-   Created `ident-bottom-bar.tsx` — 5-tab nav (Akèy, Aktè, Sivi, Tata désactivé, Mwa) with `#9F8170` active color
-   Created `ident-home-screen.tsx` — agent dashboard with greeting, search, counters (Brouyon/Atann/Validé/Rejeté), territory KPIs, monthly mission progress bar, quick access links, screen sensitivity alert
-   Created `ident-identification-screen.tsx` (45KB) — dynamic 9-section form: photo capture, actor type selector (Marchand/Producteur/Coopérative), mandatory fields, complementary info, type-specific dynamic fields, GPS geolocation, notes, document attachments, auto-save every 30s, draft/submit actions
-   Created `ident-suivi-screen.tsx` — dossier tracking grouped by status (En attente/Validés/Rejetés) with search, filters, action buttons (Korijé/Siprimé for rejected)
-   Created `ident-brouillons-screen.tsx` — drafts management with completion progress, 3 actions (Reprendre/Soumettre/Supprimer with AlertDialog), sort toggle, empty state
-   Created `ident-acteurs-screen.tsx` — actors list with photo thumbnails, type/status filters, phone masking (screen sensitivity), quick stats section
-   Created `ident-statistiques-screen.tsx` — period tabs, KPI grid, type distribution bars, 7-day bar chart, zone breakdown
-   Created `ident-rapports-screen.tsx` — 3 report types (journalier/hebdomadaire/mensuel) with generated summaries and export/share buttons
-   Created `ident-dashboard-screen.tsx` — advanced KPIs, performance vs objective, daily pace calculation, mock rankings, top zones chart
-   Created `ident-profil-screen.tsx` — agent profile, settings (soleil mode, screen sensitivity), security section, red logout button
-   Updated `page.tsx` with IdentScreenRouter, role-based bottom bar switching, Identificateur screen routing
-   Fixed bugs: default export → named export (identification screen), login PIN numpad stale closure (stepRef + pinRef), handleLogin using stale `pin` state → `pinRef.current`, logout routing to correct auth screen per role

Stage Summary:

-   11 new Identificateur component files created in `src/components/identificateur/`
-   1 new store file: `src/lib/stores/identificateur-store.ts`
-   3 core files modified: `app-store.ts`, `page.tsx`, `auth-screen.tsx`
-   Full auth flow verified: Marchand auth → Identificateur button → Ident auth (register/login) → Home → Logout → Ident auth
-   All screens in Ivorian phonetic French
-   Zero lint errors, clean compilation

---

Task ID: 2
Agent: Main Orchestrator
Task: Correct phonetic/creole French text to standard French in 3 identificateur files

Work Log:

-   Read all 3 target files: ident-identification-screen.tsx (1021 lines), ident-bottom-bar.tsx (99 lines), ident-home-screen.tsx (382 lines)
-   Made ~90+ precise Edit operations across ident-identification-screen.tsx:
    -   Step labels (Fotò & Idantite → Photo & Identité, Detay Aktè → Détails Acteur, etc.)
    -   Section titles (FOTÒ AKTÈ → PHOTO ACTEUR, ENFÒMASYON OBLIGATWA → INFORMATIONS OBLIGATOIRES, etc.)
    -   All labels (Prenon → Prénom, Telefòn → Téléphone, Sèks → Sexe, etc.)
    -   All placeholders (Prenon aktè a → Prénom de l'acteur, Chwazi aktivite → Choisir une activité, etc.)
    -   All toast messages (Erè → Erreur, Kòd pa konfòm → Codes non conformes, etc.)
    -   Button texts (Pran foto → Prendre photo, Précédan → Précédent, Suivan → Suivant, etc.)
    -   Actor type/sex/commerce/production label records (Machan → Marchand, Maskilen → Masculin, etc.)
    -   Auth step copy (KONFIGIRASYON OTORIZASYON → CONFIGURATION AUTORISATION, etc.)
-   Made 4 Edit operations in ident-bottom-bar.tsx (Akèy → Accueil, Aktè → Acteurs, Sivi → Suivi, Mwa → Moi)
-   Made 7 Edit operations in ident-home-screen.tsx (Brouyon → Brouillon, Atann → En attente, etc.)
-   Ran ripgrep verification across all 3 files — only 2 remaining matches are code comments, no user-facing creole text remains
-   Lint passes with zero errors

Stage Summary:

-   3 files corrected: ident-identification-screen.tsx, ident-bottom-bar.tsx, ident-home-screen.tsx
-   ~100+ individual text replacements from Ivorian creole/phonetic French to standard French
-   All user-facing strings now in standard French; code comments intentionally left unchanged
-   Zero lint errors, clean compilation

---

Task ID: 1
Agent: main
Task: Convert identificateur identification form to step-based wizard with auth setup

Work Log:

-   Read and analyzed existing project structure (SPA with Zustand, client-side routing)
-   Read existing ident-identification-screen.tsx (1240 lines, single scrollable form)
-   Read identificateur-store.ts (Dossier type, Zustand persist store)
-   Read pattern-lock.tsx and visual-code-grid.tsx (auth components to reuse)
-   Confirmed Identificateur button already exists on auth-screen.tsx
-   Added pinHash, patternHash, visualCodeHash fields to Dossier interface in store
-   Added optional `color` prop to PatternLock component for identificateur theming
-   Completely rewrote ident-identification-screen.tsx as 4-step wizard:
    -   Step 1: Photo + Actor Type + Required Info (photo, type, name, phone, activity, zone)
    -   Step 2: Complementary Info + Dynamic Actor-Specific Fields (marchand/producteur/cooperative)
    -   Step 3: GPS + Notes + Documents
    -   Step 4: Authentication Setup (PIN code, Pattern/Schema, Visual/Image code)
-   Reused PatternLock and VisualCodeGrid components for auth step
-   Step validation: Step 1 validates required fields, Step 3 validates GPS, Step 4 requires at least 1 auth method
-   Clean lint, successful compilation

Stage Summary:

-   identificateur-store.ts: Added 3 auth hash fields to Dossier
-   pattern-lock.tsx: Added `color` prop for theming flexibility
-   ident-identification-screen.tsx: Complete rewrite from 1240-line single form to ~560-line stepper wizard
-   All 3 auth methods (PIN, Pattern, Visual Code) functional in final step
-   Step progress indicator with clickable completed steps

## French Text Corrections - Identificateur Screens

Corrected all phonetic/creole French text to standard French in 4 identificateur screen files:

### ident-statistiques-screen.tsx (11 corrections)

-   Machan → Marchand, Prodiktè → Producteur, Kopérativ → Coopérative
-   Total idantifikasyon → Total identifications
-   Taux de validasyon → Taux de validation, Tan moysn → Temps moyen
-   Taux de reje → Taux de rejet
-   STATISTIK → STATISTIQUES
-   Repartisyon pa tip → Répartition par type
-   Evolisyon tanporèl → Évolution temporelle
-   Repartisyon pa zon → Répartition par zone

### ident-rapports-screen.tsx (13 corrections)

-   Machan → Marchand, Prodiktè → Producteur, Kopérativ → Coopérative
-   Brouyon → Brouillon, Atann → En attente
-   Rapò jounalyè → Rapport journalier, Rapò hebdomadayè → Rapport hebdomadaire, Rapò mensyèl → Rapport mensuel
-   RAPÒ → RAPPORTS
-   Total dossiè → Total dossiers, Nouvo aktè → Nouveaux acteurs
-   Lis dossiè → Liste des dossiers, Partajè → Partager

### ident-dashboard-screen.tsx (16 corrections)

-   Brouyon → Brouillon, Atann → En attente
-   Total idantifiyé → Total identifiés, Objèktif mensyèl → Objectif mensuel
-   Taux validasyon → Taux de validation, Aujourdhui → "Aujourd'hui"
-   DASHBÒD → TABLEAU DE BORD, Vu djénéral → Vue générale
-   Pèfòmans vs objèktif → Performance vs objectif, Progrè mensyèl → Progrès mensuel
-   Jou restan → Jours restants, Ritm nésésèr → Rythme nécessaire
-   Dènyè aktivité → Dernière activité, Klasman → Classement
-   Konèksyon → Connexion, Top zon → Top zones

### ident-profil-screen.tsx (15 corrections)

-   Zon → Zone, Maché → Marché, Memb depuis → Membre depuis
-   PARAMÈT → PARAMÈTRES, Mod Soleil → Mode Soleil
-   Ekrans ensitiv → Écran sensible, Affectasyon zon → Affectation zone
-   Objèktif mensyèl → Objectif mensuel, SEKIRITE → SÉCURITÉ
-   Chanj mon kod PIN → Changer mon code PIN
-   Verouyaj otomatik → Verrouillage automatique
-   Kapti ecran bloké → Capture écran bloquée
-   A PROPO → À PROPOS, Vèsyon → Version, DEKONEKSYON → DÉCONNEXION

---

Task ID: 2
Agent: main
Task: Corriger tout le texte phonétique/créole en français standard dans les 10 fichiers identificateur

Work Log:

-   Scanned all 10 identificateur files for phonetic text
-   ident-auth-screen.tsx: Already in standard French, no changes needed
-   ident-identification-screen.tsx: ~90+ corrections (step labels, form labels, placeholders, toast messages, button texts, auth step labels, record labels)
-   ident-home-screen.tsx: 7 corrections (Brouyon→Brouillon, Atann→En attente, Statistik→Statistiques, Rapò→Rapports, aktè→acteur)
-   ident-bottom-bar.tsx: 8 corrections (Akèy→Accueil, Aktè→Acteurs, Sivi→Suivi, Mwa→Moi, Désaktivé→Désactivé + comments)
-   ident-suivi-screen.tsx: 8 corrections (actor labels, header, search, empty states, buttons, function names)
-   ident-brouillons-screen.tsx: 10 corrections (header, search, empty states, toast, dialog, button labels)
-   ident-acteurs-screen.tsx: 15 corrections (actor labels, header, search, counters, empty state, buttons, stat cards, function names)
-   ident-statistiques-screen.tsx: 11 corrections (actor labels, KPI labels, section headings)
-   ident-rapports-screen.tsx: 13 corrections (actor labels, status labels, report titles, stats, button)
-   ident-dashboard-screen.tsx: 16 corrections (status labels, KPI labels, heading, section titles)
-   ident-profil-screen.tsx: 15 corrections (info row labels, section headings, settings, buttons)

Stage Summary:

-   All user-facing text across 10 identificateur files converted from Ivorian phonetic to standard French
-   Lint passes clean, compilation successful
-   Browser verification confirms all bottom bar labels, counters, and navigation text are in French

---

Task ID: 1
Agent: main
Task: Remove search zone, Accès rapides section, and convert Nouveau dossier to floating button on ident-home

Work Log:

-   Read ident-home-screen.tsx to understand current layout
-   Removed the search bar zone (was a fake search div that navigated to identification)
-   Removed the "Nouveau dossier" card section
-   Removed the "⚡ Accès rapides" section with its quickAccess array
-   Added a floating action button (FAB) with Plus icon, colored #9F8170
-   Cleaned up unused imports (Search, ChevronRight, BarChart3, FileText, Input, goBack)
-   Removed unused quickAccess array and smallTextClass variable
-   Fixed FAB positioning: initially at bottom-6 but was covered by bottom nav bar (h-16, z-50)
-   Moved FAB to bottom-20 with z-[60] to sit above the nav bar
-   Changed content mb-4 to mb-24 on Alerte sécurité card for proper spacing
-   Verified with agent-browser: search bar removed, Accès rapides removed, FAB works and navigates correctly
-   Verified FAB click navigates to ident-identification screen (4-step wizard)

Stage Summary:

-   File modified: src/components/identificateur/ident-home-screen.tsx
-   Search zone: REMOVED
-   Accès rapides section: REMOVED
-   Nouveau dossier: Now a floating action button (FAB) in bottom-right, above bottom nav bar
-   FAB click handler: setCurrentDraftId(null); navigate("ident-identification") - WORKING

---

Task ID: 2
Agent: main
Task: Fix FAB button - identification screen shows loader then redirects back to home

Work Log:

-   Identified root cause: init dossier was done in useEffect (async), if merchantId/merchantName werent ready at effect time, dossier stayed null
-   The 2-second safety redirect (setTimeout → navigate(ident-home)) would then fire, sending user back
-   Fix: replaced async useEffect init with synchronous useState lazy initializer
-   Lazy initializer creates dossier immediately during first render when merchantId && merchantName are available
-   Kept a fallback useEffect only for the draft-resume case (currentDraftId) where dossiers array might load later
-   Removed the 2-second safety redirect entirely (no more auto-redirect to home)
-   isNew is also initialized via lazy initializer
-   Tested: FAB click → identification screen appears immediately (no spinner), stays after 5s
-   Tested: Retour → home, FAB click again → works again

Stage Summary:

-   File modified: src/components/identificateur/ident-identification-screen.tsx
-   Key change: useState lazy initializer replaces useEffect for dossier creation
-   Safety redirect (2s timeout) removed
-   FAB button now works reliably - no more loader-then-redirect issue

---

Task ID: 3
Agent: main
Task: Add confirmation modals for connection and account deletion

Work Log:

-   Read ident-auth-screen.tsx to understand login/register flow
-   Read ident-profil-screen.tsx to understand profile layout
-   Verified AlertDialog component exists in shadcn/ui
-   Added connection confirmation modal to ident-auth-screen:
    -   handleRegister: saves agent data, then shows modal "Compte créé !" before calling setAuth
    -   handleLogin: validates PIN, then shows modal "Bienvenue !" before calling setAuth
    -   Added confirmConnection() function that calls setAuth with pending data
    -   Cancel button resets PIN and goes back to login-pin step
    -   Modal uses CheckCircle2 icon with IDENT_COLOR theme
-   Added to ident-profil-screen:
    -   Changed DéCONNEXION button to outline style, now triggers logout confirmation modal
    -   Added SUPPRIMER MON COMPTE button with red outline style
    -   Logout modal: "Se déconnecter ?" with info text, Annuler/Se déconnecter buttons
    -   Delete modal: "Supprimer le compte ?" with irreversible warning, Annuler/Supprimer buttons
    -   handleDeleteAccount: clears agent localStorage, clears identificateur store, calls logout

Stage Summary:

-   Files modified: ident-auth-screen.tsx, ident-profil-screen.tsx
-   Connection: modal with "Compte créé !" (register) or "Bienvenue !" (login) + Annuler/Confirmer
-   Logout: modal with "Se déconnecter ?" + Annuler/Se déconnecter
-   Delete account: modal with "Supprimer le compte ?" (irréversible) + Annuler/Supprimer
-   All 3 modals tested and verified via agent-browser

---

Task ID: 4
Agent: main
Task: Develop all MON PROFIL features

Work Log:

-   Read and analyzed all existing files: ident-profil-screen.tsx, identificateur-store.ts, ident-auth-screen.tsx, shadcn UI components (sheet, select, radio-group, collapsible, input, label)
-   Updated identificateur-store.ts:
    -   Added `autoLockMinutes: number` (default 15) and `setAutoLockMinutes` action
    -   Added `screenshotBlocked: boolean` (default true) and `toggleScreenshotBlocked` action
    -   Added both to `partialize` for persistence
-   Completely rewrote ident-profil-screen.tsx with all 7 features inline:
    1. **Changer mon code PIN** — Bottom Sheet with 3-step numpad flow (current/new/confirm PIN), step indicator, PIN dots with #9F8170 color, validation against localStorage hash, error handling, success toast
    2. **Verrouillage automatique** — Bottom Sheet with RadioGroup (5min/10min/15min/30min/Désactivé), styled radio labels, save button, persisted in store
    3. **Affectation zone** — Bottom Sheet with shadcn Select (ZONES array) for zone, Input for marché name, Enregistrer button, updates store on save
    4. **Objectif mensuel** — Bottom Sheet with stepper (+/- buttons, range 10-9999), quick-select buttons (100/200/300/500/750/1000), Enregistrer button
    5. **Capture écran bloquée** — Replaced static "Activé" text with Switch toggle, persisted in store
    6. **Academy** — Bottom Sheet with 4 tutorial cards (emoji icons, titles, French descriptions covering identification, photography, drafts, best practices)
    7. **Support** — Bottom Sheet with contact info (phone, email), 4 FAQ items using Collapsible/CollapsibleTrigger/CollapsibleContent with ChevronDown rotation
-   Copied `simpleHash`, `normalizePhone`, `loadAgent`, `saveAgent` helpers into the file
-   Created `PinDots` and `PinNumpad` helper components for the PIN change flow
-   Created `FaqItem` component to avoid React hooks violation (useState inside map)
-   Kept existing logout and delete account AlertDialogs intact
-   Removed unused imports (navigate, X, smallTextClass)
-   Fixed JSX comment blocks (removed Unicode box-drawing characters that caused parsing error)
-   All text in French, all styling uses #9F8170 theme color
-   Lint passes with zero new errors (2 pre-existing errors in other files remain)

Stage Summary:

-   Files modified: identificateur-store.ts, ident-profil-screen.tsx
-   7 features implemented, all inline (no new routes or files)
-   6 bottom Sheets (PIN, auto-lock, zone, target, academy, support) + 1 inline Switch toggle (screenshot)
-   Store: 2 new persisted fields (autoLockMinutes, screenshotBlocked)
-   Zero new lint errors, clean compilation

---

Task ID: 4
Agent: main
Task: Develop all MON PROFIL features

Work Log:

-   Read ident-profil-screen.tsx (396 lines) and identificateur-store.ts to understand current stubs
-   Identified 7 features to develop: PIN change, auto-lock, zone assignment, monthly target, screenshot block, academy, support
-   Delegated implementation to full-stack-developer subagent
-   Subagent added autoLockMinutes + screenshotBlocked to identificateur-store with persistence
-   Subagent rewrote ident-profil-screen.tsx to 1005 lines with all features
-   Verified lint: only 2 pre-existing errors (no new ones)
-   Tested via agent-browser:
    -   Affectation zone: Sheet with Select dropdown + marché input + Enregistrer ✓
    -   Objectif mensuel: Sheet with +/- stepper + quick-select buttons (100-1000) ✓
    -   Verrouillage automatique: Sheet with RadioGroup (5/10/15/30 min + Désactivé) ✓
    -   Changer PIN: Sheet with 3-step numpad (current PIN → new → confirm) ✓
    -   Capture écran bloquée: Now a toggle Switch ✓
    -   Academy: Sheet with 4 tutorial cards (identification, photo, brouillons, pratiques) ✓
    -   Support: Sheet with contact info + 4 collapsible FAQ items ✓
    -   DÉCONNEXION and SUPPRIMER MON COMPTE: Modals still working ✓
-   VLM visual verification confirmed clean layout

Stage Summary:

-   identificateur-store.ts: Added autoLockMinutes (default 15), screenshotBlocked (default true), both persisted
-   ident-profil-screen.tsx: All 7 features fully functional, 1005 lines
-   All features use shadcn Sheet/Dialog/Select/RadioGroup/Collapsible
-   No new routes created - everything inline in the profile screen

---

Task ID: 3
Agent: Main Orchestrator
Task: Build complete Jùlaba BackOffice admin interface (24 modules)

Work Log:

-   Updated Prisma schema with 5 new BO models: BoUser, AuditLog, BoActor, BoZone, BoMission
-   Extended app-store.ts with 'backoffice' UserRole, 24 BO screen routes, BO-aware navigation/auth/hydration
-   Created backoffice-store.ts with: RBAC permission matrix (5 roles × 24 modules), 50 mock actors, 30 mock enrolments, 12 zones, 5 missions, 15 audit entries, 5 alerts, 7 demo BO users, ticker data, and all CRUD actions
-   Created bo-auth-screen.tsx: 3-step login (credentials → MFA OTP → success), 5 demo accounts with quick-login, dark theme, security badges (TLS 1.3, AES-256, MFA)
-   Created bo-layout.tsx: Desktop-first layout with dark sidebar (w-60/collapsible to w-16), header with search/notifications/user menu, status bar with system health indicators
-   Created bo-screen-router.tsx: Switch routing for all 24 BO screens
-   Created 24 module screens via parallel subagents:
    -   bo-dashboard-screen.tsx: 7 KPIs, real-time ticker, recharts (BarChart + AreaChart), top 5 identificateurs, data quality circles, system health, quick access
    -   bo-acteurs-screen.tsx: Full data table with search/filters/pagination, detail dialog, CSV export, bulk actions, counter bar
    -   bo-enrolement-screen.tsx: Card-based validation queue, validate/reject/info-request flows, rejection reason dialog, filter tabs, stats bar
    -   bo-utilisateurs-screen.tsx: BO user CRUD, visual RBAC permission matrix (5×10 grid), create/edit dialogs, role/status filters
    -   bo-audit-screen.tsx: Audit journal with expandable rows, JSON detail view, multi-filter, CSV/PDF export, SHA-256 signature display
    -   bo-zones-screen.tsx: Zone cards with progress bars, create dialog, detail with actor breakdown
    -   bo-missions-screen.tsx: Mission cards with progress, create/assign/close flows, filter tabs
    -   bo-supervision-screen.tsx: Alert list with severity, platform metrics, activity feed
    -   bo-rapports-screen.tsx: 4 report types with previews, countdown schedules, export buttons
    -   bo-institutions-screen.tsx: Institution cards, add dialog, sort/filter, sync buttons
    -   bo-moderation-screen.tsx: Report cards with severity borders, resolve/suspend flows
    -   bo-mutations-screen.tsx: Transfer requests with approve/reject, zone arrows
    -   bo-contenus-screen.tsx: Tabs (Tutoriels/FAQ/Articles), dual view (card/table), CRUD
    -   bo-monitoring-ia-screen.tsx: AI KPIs, recharts BarChart, model version, system resources
    -   bo-events-screen.tsx: Real-time event log (3s interval), level filters, pause/resume, auto-scroll
    -   bo-analytics-screen.tsx: DAU/MAU KPIs, 30-day LineChart, PieChart, retention funnel
    -   bo-scores-screen.tsx: Financial scoring, histogram, risk-level table, search/filters
    -   bo-api-keys-screen.tsx: Key management with mask/unmask, copy, revoke with AlertDialog
    -   bo-marketplace-screen.tsx: 3-tab interface (Produits/Commandes/Vendeurs), stats
    -   bo-livraison-screen.tsx: Delivery cards, status filters, map placeholder
    -   bo-communication-screen.tsx: 3-channel compose (SMS/Push/Email), history table
    -   bo-cron-screen.tsx: 9 cron jobs table, toggle/run-now, create dialog, stats
    -   bo-config-institution-screen.tsx: 5 config sections with edit/save, Switch toggles
    -   bo-keiwa-screen.tsx: Wallet KPIs, LineChart, transactions/accounts tabs
-   Added BackOffice entry button on marchand auth screen (next to Identificateur button)
-   Updated page.tsx with BO routing, layout wrapping, and BO-specific bottom bar handling
-   Fixed InputOTP render prop incompatibility (switched from render prop to children with index)
-   Fixed RBAC matrix: added super_admin to all 24 modules

Stage Summary:

-   30 new files created in src/components/backoffice/
-   1 new store: src/lib/stores/backoffice-store.ts
-   3 core files modified: app-store.ts, page.tsx, auth-screen.tsx
-   1 schema modified: prisma/schema.prisma
-   All 24 modules functional with mock data, real interactivity, and professional UI
-   5 demo accounts for quick testing (super_admin → operateur_terrain)
-   RBAC enforced: sidebar shows only modules accessible to the logged-in role
-   Zero new lint errors
-   Verified via Agent Browser: auth flow, MFA, dashboard, acteurs, enrolement, events all working

---

Task ID: 2-a, 2-b
Agent: Main
Task: Remplacer emojis par icônes Lucide + Ajouter système de thème light/dark

Work Log:

-   Analysé le design fourni par l'utilisateur avec VLM (design admin moderne, clair, bleu/slate)
-   Identifié 27 emojis dans 17 fichiers back-office
-   Délégué le remplacement des emojis à un sous-agent (27 remplacements dans 17 fichiers)
-   Ajouté ThemeProvider (next-themes) dans le root layout
-   Ajouté boTheme + toggleBoTheme dans le backoffice store (persisté)
-   Ajouté le bouton toggle thème (Sun/Moon) dans le header du layout BO
-   Ajouté les classes dark: complètes au layout (sidebar, header, status bar, dropdown menus)
-   Ajouté les classes dark: à l'écran d'authentification BO
-   Ajouté les classes dark: au tableau de bord BO (KPIs, graphiques, system health, data quality, etc.)
-   Corrigé les erreurs de syntaxe (double className=) introduites par le sous-agent
-   Vérifié en navigateur: auth light/dark + dashboard light/dark + toggle fonctionnel

Stage Summary:

-   27 emojis remplacés par des icônes Lucide (Check, X, Star, TrendingUp, Shield, etc.)
-   Système de thème light/dark fonctionnel avec persistance dans le store Zustand
-   Toggle accessible depuis le header du backoffice (icône Moon/Sun)
-   Layout, auth et dashboard entièrement adaptés aux deux thèmes
-   Captures d'écran: bo-auth-light.png, bo-auth-dark-check.png, bo-dashboard-light.png, bo-dashboard-dark.png

---

Task ID: 4-b
Agent: theme-batch-2
Task: Add dark/light theme to 6 BO screen files (batch 2)

Work Log:

-   Read bo-dashboard-screen.tsx as reference pattern (boTheme from store, isDark ternary, conditional classes)
-   Read all 6 target files completely to identify all hardcoded color patterns
-   bo-audit-screen.tsx (787 lines): Removed BO_COLOR import, Added boTheme/isDark to BoAuditScreen and ExpandedDetails sub-component, Replaced style={{ color: BO_COLOR }} with conditional classes, Replaced bg-gray-50/80/bg-white/bg-gray-100/text-gray-500/400/600/700/300 with isDark ternaries, Theme-aware table header bg, Card bg-slate-800 in dark
-   bo-rapports-screen.tsx (427 lines): Removed BO_COLOR import, Added boTheme/isDark to BoRapportsScreen and ScheduledReportCard sub-component, Replaced style={{ color: BO_COLOR }} and style={{ backgroundColor: BO_COLOR }} with conditional classes, getStatusConfig now takes isDark param for badge colors
-   bo-moderation-screen.tsx (516 lines): Removed BO_COLOR/BO_COLOR_BG imports, Added boTheme/isDark, Replaced outer container style={{ backgroundColor: BO_COLOR_BG }} with className, Moved SEVERITY_CONFIG inside component for isDark access, Replaced all text-gray-_/bg-gray-_/bg-red-50/bg-amber-50/bg-emerald-50 patterns
-   bo-mutations-screen.tsx (552 lines): Removed BO_COLOR/BO_COLOR_BG imports, Added boTheme/isDark, Replaced outer container, zone chips, rejection box, stat cards, empty state, action buttons with theme-aware classes
-   bo-contenus-screen.tsx (511 lines): Removed BO_COLOR/BO_COLOR_BG imports, Added boTheme/isDark, Themed stat cards, search icon, view mode toggle bg, card view items, table view, delete hover state, empty state
-   bo-institutions-screen.tsx (528 lines): Removed BO_COLOR/BO_COLOR_BG imports, Added boTheme/isDark, Themed stat cards (with emerald/amber bg-50→bg-\*-500/10), search icon, card grid, detail text, sync button, empty state
-   Verified: no BO_COLOR/BO_COLOR_BG references remain in any of the 6 files
-   Verified: lint passes with only pre-existing errors (page.tsx, ident-identification-screen.tsx)

Stage Summary:

-   All 6 files themed successfully
-   All BO_COLOR/BO_COLOR_BG imports removed from themed files
-   Sub-components (ExpandedDetails, ScheduledReportCard) have their own boTheme/isDark
-   Pattern matches dashboard reference exactly
-   Zero new lint errors introduced

---

Task ID: 4-c
Agent: theme-batch-3
Task: Add dark/light theme to 5 BO screen files (batch 3)

Work Log:

-   Read bo-dashboard-screen.tsx as reference pattern (boTheme from store, isDark ternary, conditional classes)
-   Read all 5 target files completely to identify all hardcoded color patterns
-   bo-analytics-screen.tsx (263 lines): Removed BO_COLOR/BO_COLOR_BG import, Added boTheme/isDark to BoAnalyticsScreen, Replaced outer container style={{ backgroundColor: BO_COLOR_BG }} with className, Replaced style={{ color: BO_COLOR }} with conditional classes, Themed KPI cards (icon bg, delta text, value text), Chart cards with dark-aware tooltip/grid/tick styles, Retention funnel bars (dark uses rgba slate-100), Pie chart legend text, Table cell text
-   bo-scores-screen.tsx (299 lines): Removed BO_COLOR/BO_COLOR_BG import, Added boTheme/isDark to BoScoresScreen, Moved RISK_CONFIG inside component for isDark access (emerald/amber/red badge bg→bg-XXX-500/15 in dark), Replaced outer container, Summary stat cards, Distribution chart with dark tooltip/grid, Search icon color, Table cells (name, zone, score bar bg, recommendation, date), Empty state text
-   bo-api-keys-screen.tsx (384 lines): Removed BO_COLOR/BO_COLOR_BG import, Added boTheme/isDark, Themed stat cards (total, active, requests), Created key banner (emerald bg→emerald-500/10 in dark), Search icon, Table cells (name, description, key mono, dates, status badges active→emerald-500/15, revoked→red-500/15, requests count, revoke hover→red-500/10), Empty state
-   bo-monitoring-ia-screen.tsx (379 lines): Removed BO_COLOR/BO_COLOR_BG import, Added boTheme/isDark, Moved SEVERITY_COLOR inside component for isDark access (critique/haute/moyenne/basse with dark variants), Themed KPI cards (emerald-50→emerald-500/15, amber-50→amber-500/15, red-50→red-500/10, gray-100→slate-700), Active badge (emerald-500/15), Chart bars (Jeu highlight uses slate-100 in dark, D1D5DB→475569), Model info rows (all text-gray-500→slate-400, style color→text-slate-100), System resources (metric label, progress bg), Error table (resolved/active badges, row bg for unresolved), Tooltip/cursor dark variants
-   bo-events-screen.tsx (281 lines): Removed BO_COLOR/BO_COLOR_BG import, Added boTheme/isDark, Moved LEVEL_CONFIG inside component for isDark access (INFO/WARN/ERROR/DEBUG badge bg→XXX-500/15 in dark, DEBUG border→slate-500), Themed level stat cards, Header live indicator (gray-400→slate-500 in dark), Filter checkbox border, Filter label text, Event list scrollbar color (D1D5DB→475569), Event rows (hover→slate-700, timestamp/source mono text→slate-500, message→slate-300), Empty state text
-   Verified: no BO_COLOR/BO_COLOR_BG references remain in any of the 5 files
-   Verified: lint passes with only pre-existing errors (page.tsx, ident-identification-screen.tsx)

Stage Summary:

-   All 5 files themed successfully
-   All BO_COLOR/BO_COLOR_BG imports removed from themed files
-   SEVERITY_COLOR and LEVEL_CONFIG moved inside components for isDark access
-   RISK_CONFIG moved inside component for isDark access
-   Pattern matches dashboard reference exactly
-   Zero new lint errors introduced

---

Task ID: 4-d
Agent: theme-batch-4
Task: Add dark/light theme to 6 BO screen files (batch 4)

Work Log:

-   Read bo-dashboard-screen.tsx reference pattern for isDark theming
-   Read all 6 target files completely
-   bo-communication-screen.tsx: Added boTheme/isDark, moved CHANNEL_CONFIG/STATUS_CONFIG inside component, replaced all style={{ color: BO_COLOR }} / style={{ backgroundColor: BO_COLOR_BG }}, themed cards, text colors, badge colors, scrollbar, bg-gray-50, text-gray-500/600/700/400
-   bo-cron-screen.tsx: Added boTheme/isDark, moved STATUS_CONFIG/RESULT_CONFIG inside component, replaced all BO_COLOR/BO_COLOR_BG style props, themed icon bg colors (emerald/sky/amber/red-100 → -500/15), text colors, cards, empty states
-   bo-config-institution-screen.tsx: Added boTheme/isDark to main component and SectionHeader sub-component (via isDark prop), replaced all BO_COLOR/BO_COLOR_BG, themed icon colors in inputs, text-gray-500/700, cards, label colors
-   bo-keiwa-screen.tsx: Added boTheme/isDark to main component and KeiwaTooltip sub-component (via isDark prop), moved TX_TYPE_CONFIG/TX_STATUS_CONFIG/ACCOUNT_TYPE_CONFIG inside component, themed chart (gridStroke/tickFill/dot stroke), cards, table text, scrollbar, badge colors
-   bo-marketplace-screen.tsx: Added boTheme/isDark, moved PRODUCT_STATUS_CONFIG/ORDER_STATUS_CONFIG inside component, replaced all BO_COLOR/BO_COLOR_BG, themed product cards, order/seller tables, stat cards, search icons, filter text
-   bo-livraison-screen.tsx: Added boTheme/isDark, moved STATUS_CONFIG inside component, replaced all BO_COLOR/BO_COLOR_BG, themed delivery cards, map placeholder (bg-gray-100 → bg-slate-700, bg-white → bg-slate-800), map marker chips, stat cards, filter/search icons
-   Removed all BO_COLOR/BO_COLOR_BG imports from all 6 files
-   All imports changed from `import { BO_COLOR, BO_COLOR_BG } from ...` to `import { useBackofficeStore } from ...`

Stage Summary:

-   All 6 files themed successfully
-   All BO_COLOR/BO_COLOR_BG imports removed
-   Static config objects moved inside components for isDark conditional access
-   Sub-components (SectionHeader, KeiwaTooltip) receive isDark via prop
-   Pattern matches dashboard reference exactly
-   Zero new lint errors introduced

---

Task ID: 4-a
Agent: theme-batch-1
Task: Add dark/light theme to 6 large BO screen files

Work Log:

-   Read and analyzed all 6 files (acteurs, enrolement, zones, missions, supervision, utilisateurs)
-   Applied theme transformations: added boTheme/isDark, replaced BO_COLOR inline styles with conditional Tailwind classes
-   Updated all hardcoded color classes with isDark conditionals
-   Fixed emojis: ⏳→Hourglass icon (acteurs), ⏱️→Timer icon (enrolement)

Stage Summary:

-   All 6 files themed successfully
-   All BO_COLOR inline styles removed
-   2 emojis replaced with Lucide icons

---

Task ID: 4-b
Agent: theme-batch-2
Task: Add dark/light theme to 6 medium BO screen files

Work Log:

-   Themed audit, rapports, moderation, mutations, contenus, institutions
-   Removed BO_COLOR/BO_COLOR_BG imports from all files
-   Moved config objects with colors inside components for isDark access
-   Applied consistent conditional class patterns

Stage Summary:

-   All 6 files themed successfully
-   Zero BO_COLOR references remaining

---

Task ID: 4-c
Agent: theme-batch-3
Task: Add dark/light theme to 5 smaller BO screen files

Work Log:

-   Themed analytics, scores, api-keys, monitoring-ia, events
-   Removed BO_COLOR/BO_COLOR_BG imports
-   Dark-aware Recharts tooltips, grids, and ticks
-   Moved config objects inside components for isDark access

Stage Summary:

-   All 5 files themed successfully

---

Task ID: 4-d
Agent: theme-batch-4
Task: Add dark/light theme to 6 remaining BO screen files

Work Log:

-   Themed communication, cron, config-institution, keiwa, marketplace, livraison
-   Removed BO_COLOR/BO_COLOR_BG imports
-   Dark-aware Recharts in keiwa
-   Fixed emoji: ⏰→Clock icon (cron)

Stage Summary:

-   All 6 files themed successfully
-   1 emoji replaced with Lucide icon

---

Task ID: 2
Agent: Main Orchestrator
Task: Implement MFA verification screen with OrbitOtp component and dark-themed BoAuthScreen

Work Log:

-   Created `orbit-otp.tsx` — reusable OTP input component with styled-jsx (no Tailwind)
    -   Configurable length (default 4, auth uses 6)
    -   51x51px dark boxes with subtle borders, blue glow on focus
    -   Hidden sr-only input for accessibility
    -   Orbit verification animation: SVG circle with dashed spinning stroke, digits orbiting around center
    -   30s resend countdown timer with "Renvoyer dans Xs" → "Renvoyer le code" button
    -   Callbacks: onComplete, onChange, onResend, resetKey for external reset
-   Rewrote `bo-auth-screen.tsx` — dark theme (#121319 background) with 3-step flow
    -   Step 1 (credentials): email/password fields, white submit button, MFA TOTP notice, demo quick-login
    -   Step 2 (MFA): fingerprint icon, OrbitOtp (6 digits), auto-submit 300ms after completion, back to credentials
    -   Step 3 (success): green checkmark pop animation, progress bar, auto-redirect 600ms
    -   Split layout: left branding panel (TLS 1.3, MFA TOTP, AES-256 badges), right form card
    -   Card: subtle gradient, 20px border-radius, max-width 370px
    -   Mobile responsive: left panel hidden, mobile logo shown, full-width card
    -   All styles via styled-jsx (no Tailwind) per spec
-   Fixed JSX comment syntax error (missing `*/` closing) in orbit-otp.tsx
-   Browser-tested all 3 steps on desktop (1280px) and mobile (375x812)

Stage Summary:

-   Produced: `src/components/backoffice/orbit-otp.tsx` (reusable OTP component)
-   Produced: `src/components/backoffice/bo-auth-screen.tsx` (rewritten dark MFA auth screen)
-   All flows verified: credentials → MFA → success → dashboard navigation
-   Back button from MFA properly resets OTP state
-   Mobile responsive layout confirmed via VLM analysis

---

Task ID: 3
Agent: Main Orchestrator
Task: Implement product-design skill system based on Vercel's agent-native design governance

Work Log:

-   Explored entire Jùlaba codebase (stores, screens, voice, auth, theming, components) to gather design evidence
-   Created `.agents/skills/product-design/` directory structure (SKILL.md, AGENTS.md, references/, exemplars/)
-   Wrote SKILL.md — operating contract, 5 request modes (Shape/Implement/Review/Copy/Harden), 7-step workflow, decision authority chain, review output format (P0-P3)
-   Wrote AGENTS.md — governance, load order, validation requirements, file map
-   Wrote 8 reference files:
    -   product-judgment.md: 5 core principles (marché-first, voice-primary, offline-first, 3 surfaces, soleil mode), 7 accepted decisions (PD-001 through PD-007)
    -   interface-quality.md: visual hierarchy, color system, spacing, touch targets, transitions, modals, loading states, accessibility, responsive, animations
    -   copy.md: canonical verbs table, destructive action copy, error messages, empty states, voice copy, FCFA formatting, backoffice terminology
    -   patterns.md: component library usage, screen component pattern, bottom nav pattern, card patterns, backoffice isDark pattern, state management, styling conventions, voice integration
    -   surfaces.md: routing table, cross-surface rules, per-surface rules summary
    -   surfaces-marchand.md: color system, layout, key screens, soleil mode spec, interaction patterns, state coverage
    -   surfaces-identificateur.md: color system, layout, key screens, interaction patterns, state coverage
    -   surfaces-backoffice.md: color system (light/dark/auth), layout structure, RBAC, theme pattern, auth exception, key screens, state coverage
    -   rules.md: 8 stable rules with IDs, scope, rationale, bad/good examples (no-emoji-in-ui, destructive-verb-noun, fcfa-format, backoffice-isdark-pattern, screen-enter-class, error-message-what-plus-what-to-do, voice-feedback-marchand, bottom-bar-clearance)
    -   glossary.md: 50+ French terms across actors, geography, enrollment, commerce, money, backoffice, voice, technical categories
    -   coverage-gaps.md: 10 gaps (high: resilience, BO forms, empty state illustrations; medium: toasts, table columns, GPS threshold, sync; low: marchand dark mode, animation easing, printer support)
-   Wrote root AGENTS.md — trigger conditions, architecture quick reference, file organization, key constraints
-   Wrote exemplar pr-orbit-otp-mfa.md — documents the OrbitOtp MFA auth screen decision with rationale, mistakes, and improvements
-   Implemented lint rule `julaba/no-emoji-in-jsx` — ESM module in tooling/lint-rules/ that detects emoji characters in JSXText nodes. Registered as `warn` in eslint.config.mjs. Found 45 existing emoji violations across 10 files (mostly identificateur screens).
-   Excluded tooling/ from ESLint ignores

Stage Summary:

-   Produced 14 new files in .agents/skills/product-design/
-   Produced 1 root AGENTS.md
-   Produced 1 ESLint rule (no-emoji-in-jsx) with 45 violations found
-   All rules traceable to product decisions with evidence
-   Coverage gaps documented for future work

---

Task ID: design-eng-integration
Agent: Main Orchestrator
Task: Integrate Emil Kowalski design engineering & animation review skills into Jùlaba product-design skill system

Work Log:

-   Fetched `emil-design-eng/SKILL.md` and `review-animations/SKILL.md` (+ STANDARDS.md) from GitHub
-   Created `references/animation-standards.md` — easing curves (--ease-out, --ease-in-out, --ease-drawer, --ease-spring), duration budgets per element type, frequency table, physicality rules, spring config, interruptibility, performance rules, transforms/clip-path, gestures, stagger, accessibility, per-surface personality guidance
-   Created `references/design-engineering.md` — core philosophy (taste is trained, unseen details compound, beauty is leverage), animation decision framework (4 questions), component building principles, performance rules, Sonner principles adapted to Jùlaba, Jùlaba-specific craft details (voice+motion coordination, OTP orbit justification, screen transitions, stagger for dashboard)
-   Created `references/animation-review.md` — ten non-negotiable standards, aggressive escalation triggers (14 items), remedial preference hierarchy (9 levels), required output format (findings table + verdict with 6 impact tiers), Jùlaba-surface exceptions table (6 accepted deviations with justifications)
-   Updated `references/interface-quality.md` — replaced weak 5-line Animations section with comprehensive Animations & Motion section routing to 3 new references, added Button & Press Feedback subsection, updated Transitions to warn against transition-all, added Motion & Accessibility subsection
-   Updated `SKILL.md` — added Motion Review request mode to modes table, added 3 new rows to reference routing table (animation decision, animation review, easing/duration/spring), added 3 lines to Jùlaba Product Design Standards about invisible details and animation decision framework
-   Updated `AGENTS.md` — added 3 new files to file map (design-engineering.md, animation-standards.md, animation-review.md)
-   Added 6 new rules to `references/rules.md`: rule/no-transition-all, rule/no-scale-zero, rule/no-ease-in-ui, rule/sub-300ms-ui, rule/gpu-only-animate, rule/framer-motion-transform-string
-   Closed CG-009 (Animation Easing Standards) in `references/coverage-gaps.md`
-   Updated root `AGENTS.md` — added "animation, motion, easing, transitions" to applies-to list, added "animation/motion reviews" to applies-to list
-   Added 4 custom easing CSS variables to `src/app/globals.css` (:root): --ease-out, --ease-in-out, --ease-drawer, --ease-spring

Stage Summary:

-   3 new reference files: animation-standards.md (240+ lines), design-engineering.md (170+ lines), animation-review.md (150+ lines)
-   6 new stable rules with IDs, scope, rationale, bad/good examples, and canonical sources
-   CG-009 closed — animation easing standards now fully defined
-   4 custom easing curves added to globals.css for project-wide use
-   Motion Review mode added to SKILL.md with dedicated output format and verdict criteria
-   All animation decisions now follow: 1) Should it animate? 2) Purpose? 3) Easing? 4) Duration?

---

Task ID: 2
Agent: Schema+Seed+API Agent
Task: Extend Prisma schema, create seed script, and create all backoffice/marchand API routes

Work Log:

-   Extended prisma/schema.prisma with 14 new models: BoEnrolment, BoAlert, BoInstitution, BoMutation, BoModerationReport, BoContent, BoCommunication, BoApiKey, BoDelivery, BoCronJob, BoCreditScore, BoKeiwaTransaction, BoKeiwaAccount, BoPlatformConfig
-   Added accountId back-relation on BoKeiwaTransaction for the one-to-many with BoKeiwaAccount
-   Pushed schema to SQLite via `bun run db:push`
-   Created prisma/seed.ts (~290 lines) — idempotent seed creating 7 users, 12 zones, 50 actors, 30 enrolments, 5 missions, 15 audit logs, 5 alerts, 20 products, 6 institutions, 5 mutations, 5 moderation reports, 8 contents, 5 communications, 6 API keys, 12 deliveries, 9 cron jobs, 12 credit scores, 10 Keiwa accounts, 12 Keiwa transactions, 5 platform configs
-   Added `"seed": "bun run prisma/seed.ts"` to package.json scripts
-   Created 22 backoffice API routes under src/app/api/backoffice/: dashboard, actors, enrolments, zones, missions, users, audit, alerts, institutions, mutations, moderation, contenus, communications, scores, api-keys, keiwa, deliveries, cron, config, marketplace, analytics, monitoring
-   Created 3 marchand API routes under src/app/api/marchand/: products (full CRUD), sales (list + create with items), expenses (list + create with category breakdown)
-   All routes use `import { db } from '@/lib/db'`, NextResponse.json(), try/catch, French error messages, proper HTTP status codes, pagination (page/limit)

Stage Summary:

-   14 new Prisma models added to schema (all existing preserved)
-   1 seed script with realistic Ivorian data for 20 entity types
-   25 API route files created (~1900 lines total)
-   ESLint: 0 new errors from this task (3 pre-existing errors in other files)
-   TypeScript: fixed BoZone \_count.actors error (no relation exists), replaced with groupBy approach

Files modified: prisma/schema.prisma, package.json
Files created: prisma/seed.ts, 25 API route files, agent-ctx/2-schema-seed-api-agent.md

---

Task ID: 3
Agent: seed-script-creator
Task: Create comprehensive seed script for all backoffice DB tables

Work Log:

-   Created prisma/seed.ts with seed data for all tables
-   Updated package.json with prisma seed config
-   Ran seed script successfully

Stage Summary:

-   All backoffice tables now have realistic seed data
-   BoUser: 7 accounts matching backoffice-comptes.md
-   BoActor: 28 actors, BoEnrolment: 18, BoZone: 8, BoMission: 7
-   BoAlert: 8 alerts, BoKeiwaAccount: 8, BoKeiwaTransaction: 35 (7-day spread)
-   BoPlatformConfig: 3 configs (national_target, institution, system_health)
-   BoSystemEvent: 54 events (24-hour spread for event monitor)
-   BoInstitution: 5, BoApiKey: 5, BoCronJob: 5, BoCommunication: 5
-   BoModerationReport: 5, BoMutation: 5, BoDelivery: 5, BoContent: 5
-   BoCreditScore: 5, AuditLog: 10
-   Script uses async function main() pattern, idempotent (deletes in reverse dependency order)
-   Seed config added to package.json under "prisma" key

---

Task ID: 4+7
Agent: api-routes-creator
Task: Create login, demo-accounts, and events API routes

Work Log:

-   Created /api/backoffice/login/route.ts (POST, authenticates against BoUser table)
-   Created /api/backoffice/demo-accounts/route.ts (GET, returns active accounts without passwords)
-   Created /api/backoffice/events/route.ts (GET, returns system events with level filtering)

Stage Summary:

-   3 new API routes created
-   Login checks email + password against DB, updates lastLogin
-   Demo accounts returns safe account info for quick-login UI
-   Events returns paginated, filterable system events from BoSystemEvent table

---

Task ID: fix-enrolment
Agent: Main Orchestrator
Task: Fix SWC/Turbopack parsing error in bo-enrolement-screen.tsx

Work Log:

-   Fixed orphaned `</div>` caused by a removed `<div className="flex items-center gap-3">` wrapper around the title `<h1>`
-   Replaced JSX comment `{/* ===== TITLE ===== */}` with the missing opening `<div className="flex items-center gap-3">` tag
-   The root `<div>` no longer closes prematurely, and the ternary expression (`enrolments.length === 0 && loading ? ...`) is now properly nested inside the root
-   Verified with `npx tsc --noEmit` — zero TypeScript errors for bo-enrolement-screen.tsx

Stage Summary:

-   Single structural fix: restored missing `<div className="flex items-center gap-3">` wrapper around the title, removing the JSX comment that occupied its place
-   No logic changes; only JSX structure restored
-   TS check passes cleanly

---

Task ID: backoffice-audit-phases-2-3
Agent: Main Orchestrator
Task: Backoffice UX audit — Phases 2 & 3 (suite de la Phase 1, commit 144fce2)

Work Log:

-   backoffice-store.ts: SIDEBAR_ITEMS → SIDEBAR_GROUPS (6 domaines: Pilotage, Opérations, Finance & Paiements, Contenus & Communication, Administration, Système); SIDEBAR_ITEMS dérivé par flatMap; ajout commandPaletteOpen/setCommandPaletteOpen et actorDetailRequestId/openActorDetail/clearActorDetailRequest (navigation cross-écran vers fiche acteur)
-   bo-icon-proxy.tsx (nouveau): BO_ICON_MAP + IconProxy partagés (icônes par nom, sérialisables)
-   bo-ui.tsx (nouveau): bibliothèque de composants harmonisés — BoPageHeader, BoFilterBar, BoErrorBanner, BoEmptyState, BoStatCard (thème via variantes dark:)
-   bo-command-palette.tsx (nouveau): recherche globale Ctrl+K/⌘K (cmdk) — navigation filtrée par RBAC, acteurs (ouverture fiche), enrôlements en attente, zones, action liste acteurs
-   bo-layout.tsx: sidebar rendue par groupes (labels en mode étendu, séparateurs en mode réduit, filtre RBAC par groupe), champ de recherche header remplacé par bouton palette avec kbd "Ctrl K", palette montée dans le layout
-   bo-acteurs-screen.tsx: fiche acteur Dialog → Sheet latéral droit (avec actions Suspendre/Réactiver en pied de sheet), ouverture depuis la palette via actorDetailRequestId, refacto BoPageHeader/BoFilterBar/BoStatCard/BoEmptyState/BoErrorBanner
-   Refactorisation des 22 autres écrans vers les composants bo-ui (headers unifiés, bannières d'erreur BoErrorBanner, états vides BoEmptyState, stats BoStatCard, barres de filtres BoFilterBar) — acteurs, enrolement, zones, missions, supervision, utilisateurs, audit, rapports, dashboard + 15 écrans API-driven (mutations, moderation, contenus, institutions, marketplace, livraison, communication, scores, analytics, keiwa, api-keys, cron, config-institution, monitoring-ia, events)
-   Titres en MAJUSCULES passés en casse normale française sur tous les écrans

Stage Summary:

-   4 nouveaux fichiers (bo-ui, bo-command-palette, bo-icon-proxy + rien d'autre), 26 fichiers modifiés
-   Phase 2 complète: sidebar par domaines, Ctrl+K, fiche acteur Sheet latéral
-   Phase 3 complète: composants harmonisés déployés sur les 24 écrans (complète aussi l'item Phase 1 "bannière erreur + empty state" à l'échelle du backoffice)
-   TypeScript: 0 nouvelle erreur (restent les 12 préexistantes: bo-communication CommStatus, stt.ts, examples/, ident-rapports)
-   next build: exit 0
-   ESLint cassé dans le dépôt (module tooling/lint-rules/no-emoji-in-jsx.mjs absent) — préexistant, non corrigé

---

Task ID: marchand-features-batch-1
Agent: Super Z
Task: Implémentation de 5 fonctionnalités marchand (file offline, création tontine, Keiwa, lecteur Academy, commandes fournisseurs) + CI

Work Log:

-   offline-db.ts: file d'attente réelle (localStorage FIFO cap 500), flushPendingSync avec lock module, conflits persistés (recordSyncConflict → /api/sync-conflicts/report), flushAllPendingSync (max 3 passes)
-   sync-handlers.ts (nouveau): 12 gestionnaires de rejeu — device-claim (409 toléré), sale, expense, product, product-update, merchant-update (404 toléré), tontine-contribution, supplier-order, recolte-create/update, commande-update, journal ; distinction transitoire (408/429/5xx/réseau) vs définitif (autres 4xx → SyncConflictError)
-   sync-flusher.tsx (nouveau): flush au retour réseau, focus/visibility, chargement avec file héritée ; monté dans page.tsx pour les 3 profils ; claim-device-session.ts enchaîne un flush après claim réussi
-   Migration 20260916000000_marchand_features.sql: legacy_tontines.client_id unique, legacy_keiwa_wallets, legacy_keiwa_transactions (ledger append-only), legacy_supplier_orders, fonctions legacy_keiwa_apply_operation (row lock FOR UPDATE — anti double-spend + anti lost-update, idempotente clientId, raise SOLDE_INSUFFISANT) et legacy_bo_content_increment_views (incrément atomique)
-   API: POST /api/marchand/tontines/create (créateur premier membre, idempotent), /api/marchand/keiwa GET/POST (RPC transactionnel, mapping SOLDE_INSUFFISANT→400), /api/marchand/contenus GET + /contenus/[id] GET (publiés seulement, remplace l'ancien appel BO en 401 permanent pour les marchands), /api/marchand/supplier-orders GET/POST/PATCH (total recalculé serveur, annulation en_attente seulement)
-   UI marchand: KeiwaScreen réelle (keiwa-screen.tsx — solde, dépôt/retrait/transfert avec chips montants, historique, en ligne seule assumée), MarcheScreen (Commander actif → modale quantité/total, section dernières commandes), CommandesScreen réelle (suivi + annulation + CTA Marché), TontinesScreen (modale création complète, en ligne seule car les cotisations référencent l'id serveur), AcademyScreen (endpoint marchand + navigation lecteur), academy-course-screen.tsx (Markdown, métadonnées, compteur vues, Écouter le début)
-   app-store: route 'academy-course' + academyCourseId/openAcademyCourse/closeAcademyCourse (non persisté)
-   Notifications: types tontine_creation, supplier_order, keiwa_transaction ; ENTITY_LABEL sync-conflicts: supplier-order
-   CI: .github/workflows/ci.yml (npm ci + lint + typecheck + vitest)
-   Tests réparés (préexistants en échec): gemma-model.test.ts (taille artefact réelle 584_417_280), piper-tts.test.ts (mock TtsSession + AudioContext au lieu de <audio>)
-   docs/OFFLINE.md réaligné: file réelle, triggers de flush, lignes tontine/Keiwa/Marché, section conflits corrigée (FIFO + poursuite après échec transitoire)
-   Vérifié: tsc 0 erreur, vitest 105/105, eslint exit 0, parcours navigateur réels (écrans + modales + états vides/erreur/soleil)

Stage Summary:

-   Les 5 placeholders marchand ("Bientôt disponible"/boutons désactivés) sont fonctionnels: Keiwa, création tontine, commandes fournisseurs, suivi commandes, lecture Academy
-   La file offline documentée mais stubée depuis la migration Supabase est réactivée et testée de bout en bout
-   Keiwa et création de tontine restent volontairement hors file (intégrité financière / dépendance id serveur) — documenté dans OFFLINE.md
-   Restes connus non traités (préexistants): /api/v1 non câblée, simpleHash, rate-limit mémoire, fichiers morts, double lockfile

---

Task ID: 18
Agent: Super Z
Task: Enrôlement — étape CNI recto/verso avec OCR pré-remplissage + design harmonisé des 5 étapes du wizard

Work Log:

-   Contexte : workspace réinitialisé (projet perdu), re-cloné depuis GitHub (akoun-dev/julaba @ 8417f09), bun install relancé
-   identificateur-store.ts : Dossier + cniRecto/cniVerso (data URL, locaux) + cniNumero + nni
-   document-ocr.ts : parseCniFields() — layouts étiqueté (NOM/PRENOMS/SEXE/NNI) et numéroté (1. NOM…), fallback NNI 10 chiffres, title-case des noms, extractCniNumber conservée
-   identificateur-sync.ts : payload + hasCniRecto/hasCniVerso/cniNumero/nni (les images restent locales, comme photoBase64)
-   ident-identification-screen.tsx restructuré en 5 étapes : 1=CNI (slots recto/verso ratio carte ID-1, OCR auto dès les deux faces, bannières succès/échec + ré-analyse, champs Nom/Prénom/Sexe/N°CNI/NNI modifiables, note confidentialité, passer) ; 2=Photo & Identité (fusion anc. 1+2, sexe déplacé depuis Détails, note « Pré-rempli depuis la CNI ») ; 3=Détails ; 4=Localisation ; 5=Autorisation
-   Design harmonisé « 1 à 5 » : stepper redesigné (cercles numérotés, connecteurs qui se remplissent, légende « Étape X sur 5 · Libellé » toujours visible), StepHero commun aux 5 étapes (sur-titre Étape X/5, titre, consigne), barre de progression X/5 au-dessus des CTA, ReviewRow CNI au récap
-   handleSubmit : photo → étape 2, auth → étape 5
-   Test nouveau : src/lib/vision/**tests**/document-ocr.test.ts (9 cas)
-   Captures : scripts/captures_enrolement.py (Playwright headless, parcours complet inscription ident 05 55 55 55 55/Awa/0000 → wizard) — OCR Tesseract validé en bout en bout dans le navigateur (CNI d'exemple générées par gen_cni_samples.py, lecture réelle Kone/Awa/F/CI0123456789/0123456789)
-   Captures livrées : 00-accueil, 01-etape1-cni-vide, 02-etape1-cni-scannee-ocr, 03-etape2-photo-identite, 04-etape3-details, 05-etape4-localisation, 06-etape5-autorisation (dans my-project/download/captures-enrolement/ + julaba/download/captures-enrolement/)
-   Vérifié : tsc 0 erreur, eslint 0, vitest 134/134

Stage Summary:

-   Le wizard de création de dossier suit le design numéroté 1→5 avec l'étape CNI en tête : scan recto/verso → OCR sur l'appareil → pré-remplissage modifiable (nom, prénom, sexe, N°CNI, NNI) → le reste du parcours vérifie/préserve
-   4 fichiers modifiés, 1 test ajouté (9 cas), 7 captures générées
-   Commit en attente de push (PAT à demander — ancien token révoqué)

---

Task ID: 42
Agent: Super Z (Orchestrateur multi-agents)
Task: Analyse complète du projet + mise en place du système de pilotage .ai/ (protocole multi-agents : AGENT 1 dev/architecture + AGENT 2 PM/QA)

Work Log:

-   RESET SANDBOX constaté à l'ouverture : /home/z/julaba disparu → re-cloné (PAT), bun install (924 pkgs, 11 s)
-   Découverte : HEAD = ce8aa12 (1 commit au-delà de 6c3f77d — session concurrente : quick-sale.ts + ventes vocales synchronisées) ; bfec4f8 (Task 40) déjà poussé
-   AGENT 1 (audit technique) : pipeline voix cartographié (14 modules voice/, 4 plugins natifs, 3 STT + 4 TTS), IA Gemma 3 1B LiteRT 100% locale (navigation only), 10 stores zustand, 75 routes API, 0 appel Supabase depuis les composants (CRUD conforme), duplications cartographiées (profile vs prod-profil ~200 l.), code mort identifié
-   AGENT 2 (inventaire fonctionnel) : 4 rôles, 8 workflows E2E documentés, 33 suites de tests, roadmap multilingue évaluée : B1 embarqué (90%, validation terrain pendante), B2 NLLB ABSENT (0 grep), B3 TTS bci ABSENT (signal notifyBciNarrationLimitOnce), B4/B5 ABSENTS
-   BASELINE revalidée : 480/480 tests verts, tsc 0 erreur, eslint 2 erreurs react-hooks/immutability dans vente-rapide-modal.tsx (introduites par ce8aa12) → BUG-001
-   Créé .ai/ (14 fichiers) : README, PROJECT_CONTEXT, ARCHITECTURE, REQUIREMENTS (roadmap B1-B5), TASKS.xlsx (registre central 34 tâches, 19 colonnes, QA skill passée : validate exit 0), TASKS.md miroir, AGENT1/2_STATUS, TEST_PLAN (scénarios QA B1-B5 dont garde « parseIntent jamais bci brut » et confirmations oui/non bilingues), WORKFLOWS (WF1-WF8), BUGS (BUG-001 + 8 points d'attention), REGRESSIONS (historique + anticipations CSP/routing), CHANGELOG + DADR-001/002/003, HANDOFF bidirectionnel
-   Décisions enregistrées : DADR-001 (NLLB suit le pattern kokoro-tts : opt-in+cache+progression+CSP), DADR-002 (BaouleVoiceEngine = module TS unifié, modèles lourds côté natif), DADR-003 (pas de couche repository immédiate, non bloquant)

Stage Summary:

-   Ordre d'exécution validé : BUG-001 → B2 (NLLB, cœur du pivot) → B3 (TTS bci) → B4 (chaîne) → B5 (engine) ; normalisation au fil de l'eau
-   Bloqué sur l'utilisateur : B1-010 benchmark téléphone réel (docs/BENCHMARK.md), SEC-402 révocation PAT ghp_EUGEmf… (P0)
-   Aucun code applicatif modifié (conformité protocole : analyse avant action)

---

Task ID: 43
Agent: Super Z (Orchestrateur — boucle autonome : AGENT 1 + AGENT 2)
Task: « vas-y » — exécution de l'ordre validé : BUG-001 → B2 (NLLB-200)

Work Log:

-   BUG-001 FERMÉ (b0a95e1) : cycle de callbacks vente-rapide-modal.tsx cassé via refs
    d'indirection synchronisées par useEffect (react-hooks/immutability ×2) ; lint 0, 480/480
-   B2-020 LIVRÉ : src/lib/voice/nllb-translation.ts — translateText bci_Latn↔fra_Latn
    (Xenova/nllb-200-distilled-600M q8), erreurs typées NllbError (7 codes) + messages FR,
    téléchargement OPT-IN avec progression agrégée multi-fichiers, Cache API 'transformers-cache',
    timeout 20 s, isNllbModelReady (ne télécharge JAMAIS implicitement), removeNllbModel ciblé,
    resolveParserInput = GARDE d'architecture (le parseur fr ne voit jamais de bci brut)
-   B2-022 : 21 tests de contrat (vitest) — garde, timeout, EMPTY_OUTPUT, ENGINE_ERROR,
    paires invalides, réutilisation instance, removeNllbModel ciblé, describeNllbError
-   B2-021 MESURES RÉELLES : q8 = variante la PLUS LÉGÈRE du repo HF (872 Mo total :
    encoder q8 400 Mo + decoder_merged q8 454 Mo + tokenizer 17 Mo) — q4 2,2 Go /
    int8 statique 1,8 Go / fp16 1,7 Go tous PIRES ; implication produit : opt-in obligatoire,
    jamais dans l'APK, Wi-Fi recommandé dans l'UI
-   PIÈGES CONTURNÉS : transformers.js v2 en Node cache DANS
    node_modules/@xenova/transformers/.cache/ (pas ./.cache du projet) ; téléchargement
    node fetch lent → pré-placement curl (-C -) ; CHARGEMENT IMPOSSIBLE DANS LE SANDBOX :
    OOM kill SIGKILL (~2,3 Go RAM, exit 137) → latence réelle à mesurer sur appareil
-   AGENT 2 : 501/501 tests verts (34 fichiers), tsc 0, eslint 0 ; registre TASKS.xlsx
    regénéré + validé (exit 0) ; changelog, statuses, handoff, bugs mis à jour
-   Push : b0a95e1 (BUG-001) puis d1a0153 (B2) sur origin/main

Stage Summary:

-   B2 = cœur du pivot LIVRÉ : la suite bci→[NLLB]→fr→IA→[NLLB]→bci a désormais son
    module de traduction testé + la garde anti-bci-brut ; prochaine tâche : B3-030
    (rapport évaluation moteurs TTS Baoulé offline AVANT intégration)
-   À faire par l'utilisateur : révocation PAT (P0) ; benchmark B1 + latence B2 sur
    téléphone réel (scripts/smoke-nllb.mjs prêt pour hôte ≥ 4 Go RAM)

---

Task ID: 44
Agent: Super Z (Orchestrateur — boucle autonome AGENT 1 + AGENT 2)
Task: B3-030 — évaluation des moteurs TTS Baoulé offline (rapport AVANT intégration)

Work Log:

-   Baseline revalidée en début de session : 501/501 tests (34 fichiers) · tsc 0 · eslint 0 ;
    push Task 43 (2f75930) confirmé sur origin/main via git fetch
-   SONDAGE HF COMPLET (API, tailles/licences exactes) :
    -   facebook/mms-tts-bci N'EXISTE PAS (MMS 1 107 langues, bci absent)
    -   rnjema-unima/mms-tts-bci-baseline = kit de fine-tuning (model card : « Model
        weights are not stored here » → poids = donor facebook/mms-tts-aka) — PAS un
        modèle baoulé entraîné ; aucun autre fine-tune bci publié sur HF
    -   Corpus google/WaxalNLP config bci_tts : 180 h TTS mono-locuteur (Univ. of
        Ghana) sous CC-BY-4.0 → entraînement licitement commercial POSSIBLE
    -   Port ONNX donor : onnx-community/mms-tts-aka-ONNX (fp32 114,28 Mo /
        fp16 58,16 Mo / q4f16 56,87 Mo ; pas de q8 — VITS dégrade en int8)
    -   Piper : 37 langues, pas de bci ; Kokoro : pas de bci ; eSpeak-NG : pas de bci
-   SMOKE RÉEL SANDBOX (JULABA_MMS_MODEL_DIR local + transformers.js 2.17.2 du
    projet, backend onnxruntime-node fp32) : chargement 0,9-1,3 s ; RTF moyen 0,33
    (4/4 synthèses WAV 16 kHz valides : 0,78-3,10 s ; latence 250-353 ms) ;
    samples versionnés dans .ai/eval-b3/samples/
-   PIÈGES CONTURNÉS (documentés dans les scripts) :
    1. port onnx-community sans tokenizer.json (requis transformers.js v2) →
       .ai/eval-b3/build_tokenizer_json.py reconstruit depuis vocab.json (schéma
       copié sur Xenova/mms-tts-fra : Lowercase + whitelist regex + apposition pad)
    2. re.escape() Python produit des échappements regex INVALIDES en JS flag u
       (\ interdit) → échapper uniquement \ ] ^ -
    3. transformers.js v2 local : env.localModelPath = base + id relatif (pas de
       chemin absolu direct), env.allowRemoteModels = false
-   DÉCOUVERTE ARCHITECTURE : vocab donor = 30 chars, une seule lettre à ton (á)
    → les diacritiques de tons baoulé (à/è/é/ǹ…) sortiraient du vocab → B3-031
    doit livrer un NORMALISATEUR ORTHOGRAPHIQUE bci (strip tons, garder ɛ/ɔ/’)
-   LICENCE : tout fine-tune VITS partant de MMS hérite CC-BY-NC-4.0 (pilote
    uniquement) ; voie production licite = voix Piper custom (runtime MIT) sur
    corpus CC-BY-4.0 (B3-034) ou accord Waxal/UNIMA
-   LIVRABLES VERSIONNÉS : .ai/EVAL_B3_TTS.md (rapport complet §1-9),
    .ai/eval-b3/{smoke-mms-akan.mjs, build_tokenizer_json.py, samples/4 wav}
-   REGISTRE : B3-030 → TERMINÉ (100 %, preuves embarquées) ; B3-031 redéfinie
    (moteur pilote MMS fp16 + normalisateur bci + branchement tata-tts + UI
    « voix pilote ») ; B3-033 (fine-tune VITS GPU, décision utilisateur) et
    B3-034 (Piper production) créées BACKLOG ; B3-032 élargie (écoute comparative)
    ; TASKS.xlsx regénéré (36 tâches) + validate exit 0 ; TASKS.md, CHANGELOG,
    AGENT1_STATUS, HANDOFF n°3 mis à jour
-   AUCUN CODE APPLICATIF MODIFIÉ (conformité REQ-B3a : évaluer AVANT intégration)

Stage Summary:

-   B3-030 FERMÉ : l'intégration B3-031 a désormais une base factuelle (moteur
    mesuré RTF 0,33, checkpoint provisoire fp16 58 Mo, normalisateur spécifié,
    licences tranchées) ; la voix baoulé réelle exige un entraînement (B3-033
    GPU ou B3-034 Piper) — décisions utilisateur requises, PAS bloquantes pour
    B3-031
-   Prochaine tâche boucle : B3-031 — src/lib/voice/mms-tts.ts (pattern DADR-001)
    -   normalisateur bci + remplacement de notifyBciNarrationLimitOnce
-   Utilisateur : écouter .ai/eval-b3/samples/\*.wav (plombage) ; décisions GPU
    B3-033/034 ; révocation PAT (P0) ; benchmark B1-010 sur téléphone réel

---

Task ID: 45 (suite Task 44, même session — B3-031)
Agent: Super Z (Orchestrateur — boucle autonome AGENT 1 + AGENT 2)
Task: B3-031 — moteur pilote TTS baoulé (mms-tts.ts + normalisateur bci + tata-tts + UI)

Work Log:

-   Lecture intégrale du pattern DADR-001 (kokoro-tts.ts, 555 l.) et de tata-tts.ts
    avant toute modification (protocole) ; mécanisme interne transformers.js v2
    vérifié dans node_modules : BrowserCache = caches.open('transformers-cache'),
    clé = URL HF exacte ({model}/resolve/main/{file}) → PRÉ-REMPLISSAGE possible
-   CRÉATION src/lib/voice/mms-tts.ts (~470 l.) :
    -   downloadMmsBciVoice : 5 petits fichiers HF + tokenizer.json GÉNÉRÉ
        (buildMmsTokenizerJson, port TS de build_tokenizer_json.py validé en smoke)
        -   model.onnx fp32 114 Mo (fp16 impossible : v2 ne connaît que quantized
            true|false ; documenté en tête) ; progression par Content-Length/reader ;
            cache.put sous les URL HF exactes → from_pretrained 100 % offline ensuite
    -   normalizeBciText : NFD + strip U+0300-036F (tons), ’/' unifiées, ʼ (U+02BC,
        DANS le vocab donor) préservé, ɛ/ɔ intactes (non décomposables),
        ponctuation/symboles → pauses, idempotent
    -   mmsBciSpeak : garde ready stricte (poids + tokenizer présents — un état
        à moitié téléchargé n'est pas « prêt »), timeout 30 s + 80 ms/char (cap
        120 s), AudioContext + onended + watchdog (contrat piper/kokoro), false
        jamais d'exception, JAMAIS de téléchargement depuis une narration
-   BRANCHEMENT tata-tts.ts : chemin bci en amont de tataSpeak quand
    ttsLanguage='bci' → isMmsBciVoiceReady → mmsBciSpeak(TEXTE BRUT) — jamais
    toSpeechText (montants français n'ont pas de sens en bci) ; repli =
    dispatchFrenchNarration (extraction à l'identique du dispatch historique,
    webspeech SYNCHRONE préservé) + signal une fois par session ; tataStop +
    mmsStop ; unlockTataAudio + unlockMmsAudio conditionné à la langue bci
-   UI : src/components/shared/bci-voice-card.tsx (composant PARTAGÉ — pas de
    nouvelle duplication NORM-301) inséré dans profile-screen.tsx (marchand,
    textColorClass=tc) et prod-profil-screen.tsx (producteur, sans prop) ;
    libellé honnête « pilote — qualité limitée » (mission : pas de promesse
    muette) ; isMmsSupported garde l'affichage
-   TESTS : mms-tts.test.ts NOUVEAU 25 cas (normalisateur 4, tokenizer 3,
    gardes 4, download 3, speak 3, remove 1, constantes 1) ; tata-tts.test.ts
    +6 (chemin bci, texte brut vs toSpeechText, repli sans installation,
    échec MMS → done unique via onend manuel, zéro coût en fr, tataStop)
-   PIÈGES CORRIGÉS EN ROUTE : fetchModelFile param optionnel avant requis
    (TS1016) ; apostrophe droite dans les chaînes de test (parse errors) ;
    vi.stubGlobal('window', undefined) PERSISTE entre tests (unstubGlobals
    off) → re-stub explicite ; les échantillons ɛ/ɔ SONT le comportement
    attendu (attentes initiales du test corrigées, pas le module) ;
    afterAll inutile — afterEach local dans le describe bci
-   VALIDATION : 526/526 tests (35 fichiers, +25) · tsc 0 · eslint 0 ·
    BUILD PROD OK (piège CSP Task 41 re-vérifié, wasm-unsafe-eval inchangé)
-   REGISTRE : B3-031 → VALIDATION 90 % (smoke appareil restant) ;
    TASKS.xlsx regénéré + validate exit 0 ; TASKS.md, CHANGELOG,
    AGENT1_STATUS, HANDOFF n°4 mis à jour

Stage Summary:

-   La narration baoulé existe : moteur opt-in complet, testé, buildé ;
    le chemin bci→fr→IA→fr→bci a TOUS ses maillons techniques (B2 NLLB +
    B3 TTS) — reste l'orchestrateur (B4-040), l'écoute native (B3-032) et
    la vraie voix baoulé (B3-033/034, décisions utilisateur)
-   Prochaine tâche boucle : B4-040 (orchestrateur) puis B4-041 (oui/non
    bilingues) ; smoke device B3 à regrouper avec B1-010 (téléphone réel)
-   Utilisateur : PAT (P0) ; benchmark B1 ; écoute samples ; décisions GPU

---

Task ID: 46
Agent: Super Z (Orchestrateur — boucle autonome AGENT 1 + AGENT 2)
Task: B4-040 — orchestrateur conversation bci→fr→IA→fr→bci

Work Log:

-   SCAN : découvert que resolveParserInput (garde B2-022) n'était PAS branchée
    en production — parseIntent recevait le transcript brut des modales, et
    tataSpeak recevait du français même en session bci (la voix MMS l'aurait
    lu avec des phonèmes akan) = le trou exact que B4-040 doit combler
-   CRÉATION src/lib/voice/conversation.ts (~150 l.), nœud central de la chaîne :
    -   resolveConversationInput : session fr → pass-through strict (zéro
        régression, aucun appel traducteur) ; session bci → traduction
        OBLIGATOIRE via resolveParserInput (échec = chaîne arrêtée AVANT
        parseIntent, NllbError typée, jamais de bci brut au parseur)
    -   narrateResponse : session fr → tataSpeak direct (dispatch synchrone
        préservé) ; session bci → NLLB fra→bci puis tataSpeak avec le texte
        baoulé BRUT (contrat B3-031) ; échec traduction → tataSpeakWeb
        (court-circuite le chemin MMS : le français n'atteint JAMAIS la voix
        akan) + translationError explicite dans le résultat ; ne lève jamais
    -   seams de test (setConversationNllbForTests / resetConversationForTests)
-   CÂBLAGE voice-modal.tsx + prod-voice-modal.tsx : handleTranscript
    (transcript → orchestrateur → parseur ; échec → erreur affichée + narrée
    -   auto-close) + 22 sites de narration migrés tataSpeak → narrateResponse
-   DÉCISION documentée : en session bci, intent.rawTranscript porte la
    traduction française (findCatalogEntry + descriptions sync = français
    côté données) — validée en passation n°5 (AGENT 2 à confirmer)
-   TESTS : conversation.test.ts NOUVEAU 13 cas (pass-through, garde B2-022
    ×2, langue inconnue, routage bci, repli hors-MMS, non-levée, seams)
-   VALIDATION : 539/526+13 tests (36 fichiers) · tsc 0 · eslint 0 ·
    BUILD PROD OK (CSP wasm-unsafe-eval inchangée)
-   REGISTRE : B4-040 → VALIDATION 90 % (E2E = B4-042 AGENT 2 ; smoke appareil
    avec B1-010) ; TASKS.xlsx regénéré + validate exit 0 · audit clean ;
    TASKS.md, CHANGELOG, AGENT1_STATUS, HANDOFF n°5 mis à jour

Stage Summary:

-   La chaîne conversationnelle complète existe techniquement : dictée bci →
    NLLB fr → parseur/IA fr → NLLB bci → TTS bci, avec erreurs explicites à
    chaque maillon et zéro régression française
-   Reste B4 : B4-041 (confirmations oui/non bilingues — patterns natifs ɛhè,
    robustesse réseau), B4-042 (E2E mocks, AGENT 2)
-   Session fr inchangée dans les faits : tout pass-through, 32 tests
    tata-tts verts, les 505 autres tests non-voix intacts

---

Task ID: 47
Agent: Super Z (Orchestrateur — boucle autonome AGENT 1 + AGENT 2)
Task: B4-041 — confirmations oui/non bilingues + robustesse réseau

Work Log:

-   CRÉATION src/lib/voice/confirmations.ts : parseConfirmation bilingue
    fr + baoulé — liste PILOTE documentée (oui : ɛhɛ/ɛhè/ɔ/ɔɔ/o/oo/ehe ;
    non : ao/a o — formes les plus attestées des lexiques baoulé, à confirmer
    par locuteur natif en B3-032, module extensible) ; normalizeConfirmationText
    (NFD + strip tons U+0300-036F, ’ → ', ponctuation en espaces) ;
    hors vocabulaire → null → re-parse comme nouvelle commande (historique)
-   PIÈGES CORRIGÉS EN ROUTE : ponctuation INTERNE (ɛhɛ, d'accord) → replace
    global en espaces (pas seulement trailing) ; phrases deux-mots fr
    (c'est ça / c'est bon) testées sur twoFirst AVANT le token simple ;
    « a o » (non) testé AVANT « o » (oui) — ordre significatif + testé
-   CÂBLAGE des 2 modales : branches confirm (regex 100 % fr → parseConfirmation)
-   ROBUSTESSE RÉSEAU (REQ-B4c) : fetchJsonWithTimeout (10 s, AbortController)
    dans conversation.ts ; les 2 fetch de voice-modal (dépense, commande
    fournisseur) ne peuvent plus rester suspendus — échec explicite → file
    offline existante (« en attente de synchronisation »)
-   TESTS : confirmations.test.ts NOUVEAU 39 cas + conversation.test.ts +4
    (borne 10 s, Response transmise, timeout → erreur explicite, propagation)
-   VALIDATION : 582/582 (37 fichiers) · tsc 0 · eslint 0 · BUILD PROD OK
-   REGISTRE : B4-041 → VALIDATION 90 % ; TASKS.xlsx regen + validate exit 0 ;
    TASKS.md, CHANGELOG, AGENT1_STATUS, HANDOFF n°6 mis à jour

Stage Summary:

-   REQ-B4b couverte : un « ɛhɛ » confirme, un « ao » annule, en session bci
    comme en fr ; liste pilote honnête, extensible, point d'entrée natif B3-032
-   REQ-B4c couverte : borne réseau 10 s en pleine conversation + échecs
    explicites à chaque maillon (NLLB typé, STT cartographié, TTS watchdog)
-   Le bloc B4 est fonctionnellement complet côté AGENT 1 — reste B4-042
    (E2E mocks, AGENT 2). Prochaine tâche boucle : B5-050 (baoule-engine.ts)

---

Task ID: 48
Agent: Super Z (Orchestrateur — boucle autonome AGENT 1 + AGENT 2)
Task: B5-050 — façade unifiée BaouleVoiceEngine (contrat API)

Work Log:

-   CRÉATION src/lib/voice/baoule-engine.ts — FAÇADE PURE sur B1→B4 (aucune
    logique dupliquée : voice-service / nllb-translation / mms-tts /
    conversation restent les sources de vérité) :
    -   getBaouleEngineStatus / isBaouleEngineReady : sondes sans effet de bord
    -   initializeBaouleEngine : charge le STT natif bci, NE TÉLÉCHARGE JAMAIS,
        état exact des maillons manquants (installations opt-in pointées)
    -   createBaouleTranscriptionSession : STT bci offline (contrat STTSession),
        session inerte à erreur explicite hors coque native
    -   translateBaouleToFrench / prepareBaouleParserInput : garde B2-022,
        mapping NllbError → BaouleEngineError (messages FR préservés)
    -   speakBaoule : délègue narrateResponse (ne lève jamais)
    -   installBaouleTranslator / installBaouleVoice : OPT-IN explicite
    -   BaouleEngineError 7 codes + describeBaouleEngineError (pattern Task 41)
-   SCORIES CORRIGÉES EN ROUTE : fallback absurde dans mapNllbError, ternaire
    inutile installBaouleVoice, import dynamique superflu → import statique ;
    TS2345 test (STTCallbacks exige onResult) → callbacks minimaux valides
-   TESTS : baoule-engine.test.ts NOUVEAU 16 cas (sondes, initialize sans
    téléchargement — assertions download\* non appelés —, session STT, garde,
    mapping, speak fr/bci/repli, installs)
-   VALIDATION : 598/598 (38 fichiers) · tsc 0 · eslint 0 · BUILD PROD OK
-   REGISTRE : B5-050 → VALIDATION 90 % (branchement B5-051 + smoke B5-052
    restants) ; TASKS.xlsx regen + validate exit 0 ; TASKS.md, CHANGELOG,
    AGENT1_STATUS, HANDOFF n°7 mis à jour

Stage Summary:

-   Le contrat unifié REQ-B5a existe : un seul point d'entrée pour B1→B4 avec
    erreurs dédiées — B5-051 (branchement stt-factory + modales) peut démarrer
-   Roadmap B1→B5 : plus que B5-051 (branchement), B5-052 (smoke APK AGENT 2),
    B4-042 (E2E AGENT 2) + validations utilisateur (B1-010, B3-032/033/034)

---

Task ID: 49
Agent: Super Z (Orchestrateur — boucle autonome AGENT 1 + AGENT 2)
Task: B5-051 — branchement façade stt-factory + modales (entrée unique)

Work Log:

-   baoule-engine.ts : ré-export fetchJsonWithTimeout + CONVERSATION*NETWORK*
    TIMEOUT_MS (la façade reste l'entrée UNIQUE de la chaîne baoulé côté UI)
-   stt-factory.ts : route bci de createSmartSingleShotSTT →
    createBaouleTranscriptionSession (délégation VoiceService — comportement
    strictement identique, point d'entrée unifié) ; route fr INCHANGÉE
-   voice-modal.tsx + prod-voice-modal.tsx : migration vers la façade —
    prepareBaouleParserInput / speakBaoule / describeBaouleEngineError
-   PIÈGE CORRIGÉ : stt-routing.test.ts FAIL au chargement (« No registerPlugin
    export on @capacitor/core mock ») — la façade introduit native-tts dans la
    chaîne d'import des tests de routage ; mock complété (registerPlugin +
    WebPlugin), zéro changement de logique de test (21/21 verts)
-   VALIDATION : 598/598 (38 fichiers) · tsc 0 · eslint 0 · BUILD PROD OK
-   REGISTRE : B5-051 → VALIDATION 90 % ; TASKS.xlsx regen + validate exit 0 ;
    TASKS.md, CHANGELOG, AGENT1_STATUS, HANDOFF n°8 mis à jour

Stage Summary:

-   ROADMAP AGENT 1 B1→B5 INTÉGRALEMENT CÂBLÉE : stt-factory et les 2 modales
    passent par BaouleVoiceEngine — un seul point d'entrée, erreurs unifiées,
    non-régression française prouvée (32 tata-tts + 21 stt-routing/factory)
-   Reste côté agents : B4-042 (E2E mocks) + B5-052 (smoke APK) = AGENT 2 ;
    reste côté utilisateur : B1-010, B3-032/033/034, SEC-402, INF-401
-   Prochaine action AGENT 1 : NORM-302 (code mort) / DOC-306 en attendant
    les validations

---

Task ID: 50
Agent: Super Z (Orchestrateur — boucle autonome AGENT 1 + AGENT 2)
Task: NORM-302 — suppression du code mort

Work Log:

-   Vérification préalable 0 importeur pour chaque candidat (rg sur src/ +
    scripts/ + config) : src/lib/supabase/browser.ts (createSupabaseBrowserClient
    jamais importé), src/components/identificateur/ident-top-bar.tsx,
    db/custom.db (vestige Prisma), examples/websocket/ (2 fichiers, jamais
    référencés), dep z-ai-web-dev-sdk (aucun import dans src/)
-   Suppression : git rm ×5 ; package.json ligne z-ai retirée + bun install
    (bun.lock synchronisé, 1 paquet retiré)
-   Précaution : z-ai dans tests/python-runtime-container.sh = nom d'image
    Docker (z-ai-python-deploy-runner) — SANS rapport avec le paquet, conservé
-   VALIDATION : 598/598 · tsc 0 · eslint 0 · BUILD PROD OK · CSP intacte
-   REGISTRE : NORM-302 → TERMINÉ 100 % ; TASKS.xlsx regen + validate exit 0 ;
    TASKS.md (Task 50, comptes mis à jour : 17 terminées), CHANGELOG,
    AGENT1_STATUS mis à jour

Stage Summary:

-   Dépôt allégé : un composant mort, un client Supabase mort, un .db binaire,
    des exemples hors build et une dépendance jamais importée en moins
-   Prochaine tâche boucle : DOC-306 (mise à jour AGENTS.md — 10 stores,
    pipeline voix réel)

---

Task ID: 51
Agent: Super Z (Orchestrateur — boucle autonome AGENT 1 + AGENT 2)
Task: DOC-306 — mise à jour AGENTS.md

Work Log:

-   Audit AGENTS.md vs réalité : « 7 stores » → 10 réels (gemma-model-store,
    network-store, voice-language-store manquants) ; « Voice: Web Speech API »
    complètement obsolète depuis Tasks 31-46
-   AGENTS.md aligné : ligne State (10 stores nommés), ligne Voice (STT natif
    VoiceService sherpa FR + Omnilingual bci via stt-factory ; TTS tata-tts +
    Piper/Kokoro opt-in + voix MMS bci pilote ; NLLB + façade BaouleVoiceEngine ;
    Web Speech = repli web fr uniquement ; pointer vers .ai/ARCHITECTURE.md),
    arborescence voice/ détaillée (STT/TTS/NLU/chaîne baoulé/wake-word)
-   Doc seule : zéro impact runtime — baseline 598/598 inchangée
-   REGISTRE : DOC-306 → TERMINÉ 100 % ; TASKS.xlsx regen + validate exit 0 ;
    TASKS.md (Task 51 : 18 terminées), CHANGELOG, AGENT1_STATUS mis à jour

Stage Summary:

-   FILE AGENT 1 VIDÉE : toute la roadmap B1→B5 + normalisation prioritaire
    est livrée. Reste AGENT 2 : B4-042 (E2E mocks) + B5-052 (smoke APK).
    Reste UTILISATEUR : B1-010 (benchmark device), B3-032 (écoute natif),
    B3-033/034 (GPU/production), SEC-402 (PAT — P0), INF-401 (déploiement).
    Backlog arbitré : NORM-301/303/304/305

---

Task ID: 52
Agent: Super Z (Orchestrateur — rôle AGENT 2, QA)
Task: B4-042 — tests E2E de la chaîne conversation baoulé (mocks) + verdicts registre

Work Log:

-   CRÉATION src/lib/voice/**tests**/baoule-chain-e2e.test.ts (AGENT 2) —
    mocks aux SEULES frontières externes (pont natif STT, modèle NLLB via
    seams, moteurs TTS) ; tous les maillons métier RÉELS (baoule-engine,
    conversation, localIntent, confirmations) :
    1. Tour complet : STT bci → transcript → trad fr obligatoire →
       parseIntent vente (2000 F, tomate) → confirmation « always » →
       parseConfirmation('ɛhɛ') = yes → speakBaoule → tataSpeak texte brut bci
    2. « ao » → annulation narrée en bci
    3. Garde de bout en bout : traducteur absent → BaouleEngineError,
       parseIntent JAMAIS atteint (verrou demandé par AGENT 2 le 2026-09-18)
    4. Repli explicite : fra→bci impossible → tataSpeakWeb hors MMS
    5. Non-régression fr : pass-through strict, oui/non inchangés,
       narration française directe
-   Correction en route : assertion sonde (les probes traducteur/voix lisent
    le Cache API RÉEL → false en sandbox, même avec seams actifs) — alignée
    sur la réalité ; type Function interdit lint → signatures typées
-   VALIDATION : 603/603 (39 fichiers) · tsc 0 · eslint 0 · BUILD PROD OK
-   VERDICTS AGENT 2 : B4-042 → TERMINÉ 100 % ; B5-052 → BLOQUÉ (appareil
    requis, volet contrat couvert) ; B2-021/B3-031/B4-040/B4-041/B5-050/
    B5-051 → VALIDATION 90 % confirmés (device requis)
-   REGISTRE : TASKS.xlsx regen + validate exit 0 ; TASKS.md (Task 52 :
    19 terminées, à faire = INF-401 seule, bloquées = 3), CHANGELOG,
    AGENT2_STATUS (tableau validations + verdicts + remontées) mis à jour

Stage Summary:

-   ROADMAP « BAoulé PHASE PILOTE » INTÉGRALEMENT LIVRÉE CÔTÉ AGENTS :
    B2 traduction · B3 moteur+évaluation · B4 orchestration+confirmations+E2E ·
    B5 façade+branchement · NORM-302 · DOC-306
-   Tout ce qui reste exige un APPAREIL (B1-010, B2-021 latence, B3-031 smoke,
    B3-032 écoute natif, B5-052 smoke APK), une DÉCISION utilisateur
    (B3-033/034 GPU, INF-401 déploiement) ou une ACTION sécurité (SEC-402 PAT)

---

Task ID: 53
Agent: Super Z (Orchestrateur — AGENT 1, audit — dépôt /home/z/julaba)
Task: VOCAL-601 — audit vocal « vente rapide » (retour utilisateur : « j'ai l'impression qu'il casse »)

Work Log:

-   Audit statique complet du parcours vocal VenteRapideModal, comparé point
    par point à voice-modal (chaîne à jour) → .ai/AUDIT_VOCAL_VENTE_RAPIDE.md
-   CAUSE RACINE : la modale n'a jamais été migrée vers la chaîne multi-moteurs
-   P0-1 : session STT = createSingleShotSTT (Web Speech brut) hors factory ;
    sur APK (WebView sans Web Speech) start() = no-op silencieux (stt.ts:92)
    → « J'écoute... » infini sans erreur ; gate isAnySTTAvailable() au lieu de
    canAttemptSTT() → vocal indisponible si Sherpa pas déjà chargé ;
    VoiceService (Task 32) et route Baoulé (B5-051) contournés
-   P0-2 : unitPrice = product?.priceUnit || floor(amount/qty) (ligne 49) écrase
    le montant DICTÉ dès que le produit existe au stock (« tomates 2000 » avec
    priceUnit 500 → vente 500 FCFA annoncée+enregistrée) ; « X à Y » → extract
    Amount prend le prix unitaire comme total (3 tomates à 500 → 500 au lieu
    de 1500) ; vente rapide n'affiche pas la confirmation → faux montants
    directs en caisse
-   P1 : race wake-word (cleanup du close-effect relance le listener à
    l'OUVERTURE — pause exécutée pendant l'await initSherpaModel → session
    créée après la pause → micro de fond actif pendant la modale) ;
    completeQuickSale fetch sans timeout (processing figé) + stock décrémenté
    avant verdict ; aucun watchdog d'écoute ; sessions STT dupliquées
    (abort jamais appelé avant recréation → fuite micro)
-   P2 : intents non métier (« oui » → erreur texte vide + tataSpeak('') ;
    « stop » ne ferme pas ; navigation/consultation annoncés sans effet) ;
    confirmation trop ferme (toute erreur STT → « bonne journée » + close) ;
    result.synced ignoré ; dead code (pendingConfirmRef, state error,
    AMOUNT_PATTERNS) ; « Daccord » ×3 ; survente écrêtée en silence ;
    pas de barge-in ; bci ignoré (fr-FR figé)
-   Registre : VOCAL-601 (audit, TERMINÉ) + VOCAL-602/603 (P0, A_FAIRE) +
    VOCAL-604 (P1) + VOCAL-605 (P2) — xlsx regen + validate (41 tâches) ;
    TASKS.md (Task 53 : section 6 audit, synthèse, ordre d'exécution) ;
    CHANGELOG
-   ZÉRO code modifié (audit seul) — baseline 603/603 · tsc 0 · lint 0 inchangée

Stage Summary:

-   Le « il casse » s'explique par 2 P0 prouvés au code : spinner infini sur
    APK (modale hors factory STT) et montants faussés par le prix catalogue
-   Prochaines tâches boucle : VOCAL-602 + VOCAL-603 (P0, même fichier) →
    VOCAL-604 → VOCAL-605 ; confirmation smoke device du P0-1 (B1-010/B5-052)

---

Task ID: 54
Agent: Super Z (Orchestrateur — AGENT 1 — dépôt /home/z/julaba)
Task: VOCAL-602/603/604/605 — corrections audit vocal vente rapide (SANS build APK, demande utilisateur)

Work Log:

-   VOCAL-602 : stt-factory.ts + startSmartSingleShotSTT (web+WebSpeech =
    création/start SYNCHRONES — activation utilisateur ; natif = factory
    async VoiceService→Sherpa ; web sans WebSpeech = onError explicite ;
    abort avant résolution = aucun démarrage) ; modale : porte canAttempt
    STT, watchdog 15 s, génération + abort avant toute nouvelle session
-   VOCAL-603 : quick-sale.ts + planQuickSale (total = montant DICTÉ, prix
    unitaire en décours) + QuickSaleItem.total ; localIntent.ts : chiffres
    finaux AVANT mots (« trois sacs de riz 2000 » = 2000, plus 3) + « X à Y »
    sans devise = prix unitaire → total = X×Y (« 3 tomates à 500 » = 1500,
    plus 500 ; capture jusqu'à 2 mots intermédiaires, atQty ≤ 999) ;
    appliqué AUX DEUX modales (voice-modal.tsx:85 avait le même bug) ;
    annonce du montant réellement enregistré
-   VOCAL-604 : wake-word.ts \_paused (état — annule un start en vol, fixe
    les 4 modales) ; http.ts nouveau (fetchJsonWithTimeout extrait de
    conversation.ts, ré-export compat) ; completeQuickSale : fetch borné
    10 s, stock APRÈS verdict seulement, stockShort retourné ; modale :
    synced annoncé (« en attente de synchronisation »)
-   VOCAL-605 : handleSale route oui (nouvelle écoute, fini l'erreur vide) /
    no+cancel (ferme) / navigation+back (ferme puis navigue — cast Screen
    Route) / consultation (total réel caisse-store) ; routeConfirmResponse
    dans confirmations.ts (bilingue, ré-analyse) ; erreur micro en confirm
    → clavier oui/non (vente déjà enregistrée — dite) ; toggle voix↔clavier
    préserve le contexte confirm ; dead code retiré (pendingConfirmRef,
    state error, AMOUNT_PATTERNS) ; « Daccord » → « D'accord » ×3
-   Tests +25 : quick-sale.test.ts (11 : 4 scénarios audit §P0-2 + survente
    -   timeout fake-timers + stock après verdict), start-smart-stt.test.ts
        (5), wake-word-pause.test.ts (3), confirmations.test.ts (+6)
        → 628/628 (42 fichiers) · tsc 0 · eslint 0 · BUILD PROD OK
-   Registre : VOCAL-602/603/604/605 → VALIDATION 90 % (xlsx regen + validate,
    41 tâches) ; TASKS.md (Task 54 : synthèse 10 en validation, section 6,
    ordre d'exécution), CHANGELOG, AGENT1_STATUS
-   Worklogs double écriture + commit + push (fetch préalable, PAT masqué)
-   AUCUN build APK (demande utilisateur expresse)

Stage Summary:

-   Les 2 P0 de l'audit sont corrigés et testés : plus de spinner infini sur
    APK (chaîne multi-moteurs + watchdog), plus de montant volé par le prix
    catalogue (dans les 2 modales) — + 2 P1 et 4 P2
-   Reste pour VAL 100 % : smoke device (B1-010/B5-052) — notamment « vente
    rapide au micro » sur l'APK et montants dictés au stock existant

---

Task ID: 55
Agent: AGENT 1 (dev/archi)
Task: « assure toi que le mot de reveil est correctement implémenté » — vérification complète de la chaîne mot de réveil + corrections (VOCAL-606)

Work Log:

-   Chaîne vérifiée de bout en bout : wake-word.ts → stt-factory (createSmartContinuousSTT — auto-relance après chaque résultat final OK) → wake-word-manager (montage auth + rôles OK, réveil = setVoiceAutoRecord + openVoiceModal OK) → 4 modales (pause/resume) → app-store (voiceEnabled && wakeWordEnabled)
-   4 défauts trouvés et corrigés (rapport .ai/AUDIT_MOT_DE_REVEIL.md) :
    -   F1 (P1) : double resume à la fermeture de modale (body + cleanup d'effet) = deux startWakeWordListener concurrents → deux sessions dont une orpheline à l'écoute → compteur de génération \_startGen dans startWakeWordListener (le supplanté avorte ce qu'il vient de créer) ; stop bump aussi la génération
    -   F2 (P1) : resumeWakeWord ignorait le réglage wakeWordEnabled (fermer une modale rallumait le micro de fond désactivé) → setWakeWordEnabled(bool) nouvelle API pilotée par WakeWordManager (false au démontage/logout)
    -   F3 (P1) : pauseWakeWord n'annulait ni le timer « retour à l'écoute » (10 s armé par une détection) ni l'état 'detected' — modale ouverte >10 s = micro de fond ressuscité en pleine vente → pause annule \_resetTimer + état inactive depuis listening ET detected + garde \_paused dans le timer ; chemin de récupération sans modale conservé (F3b testé)
    -   F4 (P2) : stop (logout) pendant un start en vol → session zombie après logout → génération
-   Cleanups conditionnels alignés (resume seulement si la modale ÉTAIT ouverte) : voice-modal.tsx, prod-voice-modal.tsx, open-caisse-modal.tsx (même motif audité VOCAL-604)
-   Tests : +8 (wake-word-lifecycle.test.ts : F1/F2/F2b/F3/F3b/F4 + flux détection + faux positifs) ; beforeEach wake-word-pause.test.ts adapté à la nouvelle contract setWakeWordEnabled
-   Registre : VOCAL-606 (VALIDATION 90 %, P1, parent VOCAL-601) → 42 tâches (xlsx regen + validate OK) ; TASKS.md (Task 55 : 11 en validation, section 6, ordre d'exécution), CHANGELOG, AUDIT_MOT_DE_REVEIL.md
-   Validation : 636/636 (43 fichiers, +8) · tsc 0 · eslint 0 · build prod OK
-   AUCUN build APK (demande utilisateur expresse)

Stage Summary:

-   Le mot de réveil est maintenant un cycle de vie fiable : une seule session à tout instant (génération), le réglage coupé est respecté (plus de micro fantôme après fermeture de modale), la pause tue le timer de ré-armement (plus de micro de fond au milieu d'une vente vocale), logout sans session zombie
-   Reste terrain : « Julaba » dit sur l'APK + vente vocale >10 s (rejoint B1-010/B5-052)

---

Task ID: 56
Agent: AGENT 1 (dev/archi)
Task: « je veux exactement ce meme style et design pour la premiere vue (numero) » — maquette utilisateur reproduite à l'identique (UI-701)

Work Log:

-   Maquette analysée (/home/z/my-project/upload/pasted_image_1789761082627.png) : fond crème, pill « Mode marché actif », « Aide vocale », avatar cerclé orange + badge boutique, pill caisse autonome, titre sombre + sous-titre orange espacé, carte « Connexion à votre espace » (verrou orange, champ pill orange, drapeau CI +225, micro rond), CTA gradient « Continuer → », carte Tata « Écouter », lien délégué, barre d'écoute sombre
-   auth-screen.tsx — étape « name » refondue : barre supérieure (statut + aide vocale rejouant l'instruction Tata + sélecteur de rôle conservé), héros cerclé, carte connexion (drapeau CI en CSS — règle no-emoji, +225 chip, saisie formatée en paires via formatPhoneDisplay, disabled sur chiffres réels phoneDigits, micro rond orange si micro dispo), CTA gradient, tataCard réutilisée (icône Play, titre une ligne), lien délégué (Tata explique vocalement), barre d'écoute sombre fixe pendant la dictée (croix = stopListening) ; fond #FAF1E6 conditionnel (name seulement)
-   Fonctionnel intact : normalizeAuthPhone (espaces retirés à la soumission), dictée STT (parseVoicePhone → submitPhone), note micro indisponible, erreurs, soleilMode, autoFocus, Entrée
-   Rendu vérifié navigateur headless (viewport 400×850) : 3 captures (onboardé, vide, saisie « 07 08 45 12 34 ») ; lint 0 (warning emoji corrigé par drapeau CSS) · tsc 0 · 636/636 · build prod OK
-   Registre : UI-701 (VALIDATION 90 %, P2) → 43 tâches ; TASKS.md (Task 56), CHANGELOG, double worklog
-   AUCUN build APK (demande utilisateur expresse)

Stage Summary:

-   La première vue (numéro) est maintenant conforme au pixel près à la maquette fournie, avec la dictée vocale Tata conservée et mise en valeur (micro rond orange + barre d'écoute sombre)
-   Reste terrain : dictée du numéro sur appareil (rejoint B1-010/B5-052)
    Task ID: 45
    Agent: Super Z (Orchestrateur)
    Task: Seed — ajout de 6 comptes de test identificateur dans supabase/seed.sql

Work Log:

-   Demande utilisateur : ajouter des comptes de test identificateur au seed
-   Analyse préalable : roster dans legacy_bo_identificateurs (provisionnement BO,
    migration 20260917120000), PIN créé sur l'appareil (jamais en base), lookup
    /api/identificateur/auth/lookup refuse is_active=false sans distinction
-   Ajouté 6 comptes ident-test-000005..000010 (JID-0005..JID-0010, zones app
    ZONES réelles, téléphones 0540000005..0010 à 10 chiffres) dont 1 DÉSACTIVÉ
    (Bakary Touré, JID-0010, is_active=false) pour tester le refus de connexion
-   ON CONFLICT do update idempotent, cohérent avec le bloc ident-demo existant
    (les 4 comptes démo inchangés — référencés par legacy_bo_objectifs + auth.users)
-   Vérifié statiquement : unicité ids/agent_code/phones, apostrophe N''Guessan
    échappée ; CLI supabase absente du sandbox → supabase db reset NON rejoué
    (à faire par l'utilisateur ; test:rls nécessite Supabase local)
-   Gates rejoués : vitest verts · tsc 0 · eslint 0

Stage Summary:

-   supabase/seed.sql : 10 identificateurs provisionnés au total (4 démo + 6 test)
-   Rien d'autre modifié — aucun code applicatif touché

---
Task ID: 57
Agent: AGENT 1 (dev/archi)
Task: « Comportement conversationnel de Tata Nanti Lou » — résumé vocal du jour, fin de la formule « Bonne journée » systématique, fin de conversation explicite (VOCAL-607)

Work Log:
- SCAN : « Bonne journée » localisé (vente-rapide-modal no/cancel ×2, ouvertures caisse hors périmètre) ; « Résumé du jour » = modale visuelle sans dicté (home-screen) ; ventes individuelles = serveur /api/marchand/sales + file offline (offline-db) ; consultation de voice-modal mentait (« Consultation en cours... »)
- localIntent.ts : intent 'end' (c'est tout / j'ai fini / j'ai terminé / au revoir / plus rien / c'est bon pour aujourd'hui / à demain / bonne soirée / j'arrête…) détecté AVANT cancel, « plus rien » retiré du cancel ; export TATA_GOODBYE « D'accord, à bientôt et bonne journée ! »
- tata-phrases.ts (nouveau, pur) : formatSaleConfirmation (« Vente enregistrée : 2 sacs de riz pour 25 000 francs. » + notes sync/stock) + buildDayTotalText (consultation) ; montants « 25 000 francs » verbalisés par toSpeechText, espace ICU U+202F normalisée
- day-summary.ts (nouveau) : collectTodaySales = serveur (fetchJsonWithTimeout 6 s) + file offline fusionnés, totalAmount enregistré fait loi sur la ligne (dicté 25 000 ≠ 3×8 334), repli agrégats caisse ; buildDaySummarySpeech = dicté complet, plafond honnête 12 lignes puis « et N autres ventes », total réel complet, 0 vente → message dédié, JAMAIS d'invention
- vente-rapide-modal.tsx : confirmation détaillée sans formule de fin + ré-écoute (hint « Dites la vente suivante ou "c'est tout" ») ; end → goodbye + fermeture ; no/cancel → goodbye (fini « Bonne journée ! ») ; consultation → buildDayTotalText
- voice-modal.tsx : mêmes confirmations détaillées (2 branches vente) ; end → goodbye + fermeture (wake word reprend) ; consultation = vrai total du jour
- home-screen.tsx : tuile « Résumé du jour » ouvre la modale ET dicte (intro pendant le chargement puis résumé) ; bouton « Écouter le détail des ventes » dans la modale
- Logique d'enregistrement des ventes intacte (quick-sale, stock, caisse, file offline)
- Tests : +40 (tata-phrases 10 · day-summary 14 · intent end 16 dans localIntent.test.ts) ; 676/676 (45 fichiers) · tsc 0 · eslint 0 · build prod OK
- Registre : VOCAL-607 (VALIDATION 90 %, P1, parent VOCAL-601) → 44 tâches (xlsx regen + validate OK) ; TASKS.md (Task 57), CHANGELOG
- AUCUN build APK (demande utilisateur expresse)

Stage Summary:
- Tata est conversationnelle : elle confirme avec les détails (produit, quantité, montant), attend l'instruction suivante, et réserve « bonne journée » aux fins explicites ; le résumé du jour dicte les ventes RÉELLES (serveur + offline, repli agrégats) sans jamais inventer
- Reste terrain : dicté du résumé sur appareil (rejoint B1-010/B5-052)

---
Task ID: 58
Agent: AGENT 1 (dev/archi)
Task: « Je veux aussi que Tata dicte aussi les dépenses du jour dans ce résumé » — extension du résumé vocal du jour aux dépenses réelles (VOCAL-608)

Work Log:
- SCAN : résumé VOCAL-607 localisé (day-summary.ts collectTodaySales + buildDaySummarySpeech, tuile home-screen) ; dépenses = serveur /api/marchand/expenses (GET filtre DÉJÀ startDate/endDate) + file offline (entity 'expense', payload amount/category/description) + agrégat todayExpenses du caisse-store (compte déjà les dépenses en file)
- day-summary.ts : DayExpenseLine + champs optionnels expenses/expenseCount/expenseTotal sur DaySummaryData (dicté VOCAL-607 inchangé quand absents) ; fetchServerTodayExpenses (borné 6 s) + queueTodayExpenses ; collectTodaySales collecte ventes ET dépenses (Promise.allSettled ×3), repli dépenses INDÉPENDANT (serveur → file → agrégat ; jamais file + agrégat cumulés : double comptage évité, symétrique ventes)
- Libellé dicté : description réelle enregistrée fait loi, sinon libellé FR de la catégorie (EXPENSE_CATEGORY_LABELS aligné écran Dépenses), sinon catégorie brute — JAMAIS fabriqué
- buildDaySummarySpeech : depensesPart + ventesPart séparés — ventes puis « Tu as aussi dépensé 1 000 francs pour Transport et 500 francs pour Aliment. Au total, tes dépenses s'élèvent à 1 500 francs. » ; aucune dépense dite explicitement ; bilan vide couvrant les deux « aucune vente ni dépense aujourd'hui » ; ventes vides + dépenses réelles → « aucune vente » + dicté dépenses (jamais de vente de consolation) ; plafond 12 lignes puis « et N autres dépenses », total réel complet JAMAIS tronqué
- home-screen.tsx : intro « Un instant, je regarde tes ventes et tes dépenses du jour. » + catch aligné — aucune logique d'enregistrement touchée (lecture seule)
- Tests : +9 (day-summary 14 → 23 : dicté combiné, dépenses seules, bilan vide, aucune dépense, repli agrégats, plafond 15, serveur + filtre jour + libellés description→FR→brute, fusion file, dépenses file jamais ventes mais bien dictées) ; 685/685 (45 fichiers) · tsc 0 · eslint 0 · build prod OK
- Registre : VOCAL-608 (VALIDATION 90 %, P1, parent VOCAL-607) → 45 tâches (build_tasks_xlsx.py regen OK) ; TASKS.md (Task 58), CHANGELOG
- AUCUN build APK (demande utilisateur expresse)

Stage Summary:
- Le résumé vocal du jour dicte maintenant ventes PUIS dépenses, toutes deux issues des données réelles (serveur + file offline + repli agrégats), sans jamais inventer une ligne ou un montant
- Reste terrain : smoke du résumé ventes+dépenses sur appareil (rejoint B1-010/B5-052)

---
Task ID: 59
Agent: AGENT 1 (dev/archi)
Task: « Tata annonce le solde de caisse (ventes − dépenses) en fin de résumé » — VOCAL-609

Work Log:
- SCAN : buildDaySummarySpeech appelé uniquement par home-screen (tuile Résumé du jour) + tests ; le solde = extension du dicté pur, aucun autre flux affecté
- day-summary.ts : soldePart(data) — gate champs dépenses (rétrocompat VOCAL-607), solde = total ventes − expenseTotal ; positif/nul « Ton solde de caisse pour aujourd'hui est de X francs. » ; négatif « Attention, tes dépenses dépassent tes ventes de X francs. » (jamais « moins X francs » lu mal par le TTS) ; ajouté EN TOUTE FIN du dicté (ventes + dépenses + solde) ; jour totalement vide → pas de solde ; fond de caisse exclu de la formule (demande utilisateur — le bouton « balance » de l'accueil reste la caisse complète avec fond, documenté en code)
- buildDaySummarySpeech refactorisé en assemblage de parts (ventes/dépenses/solde), commentaires + JSDoc mis à jour
- Tests : +4 (day-summary 23 → 27 : solde en fin via endsWith, ventes=dépenses → 0 francs, rétrocompat sans champs → aucun solde, repli agrégats 12 000 − 2 750 = 9 250) ; attentes existantes enrichies (dicté combiné, aucune vente+dépenses, aucune dépense, repli dépenses, grande journée) ; 689/689 (45 fichiers) · tsc 0 · eslint 0 · build prod OK
- Registre : VOCAL-609 (VALIDATION 90 %, P2, parent VOCAL-608) → 46 tâches (build_tasks_xlsx.py regen OK) ; TASKS.md (Task 59), CHANGELOG
- AUCUN build APK (demande utilisateur expresse)

Stage Summary:
- Le résumé vocal du jour se termine par le solde de caisse ventes − dépenses, calculé depuis les données réelles ; cas négatif et jour vide traités honnêtement
- Reste terrain : smoke du résumé complet (ventes + dépenses + solde) sur appareil (rejoint B1-010/B5-052)

---
Task ID: 60
Agent: AGENT 1 (dev/archi)
Task: « ajuster la formulation du dicté » — formulation orale du résumé du jour (VOCAL-610)

Work Log:
- SCAN : VOCAL-609 (53ab748) déjà poussé et en VALIDATION ; la demande cible le STYLE du dicté complet (ventes + dépenses + solde) — tournures « Au total, tu as réalisé … pour un montant de », « Au total, tes dépenses s'élèvent à », « Ton solde de caisse pour aujourd'hui », « Tu as aussi dépensé » orphelin sans vente — zéro changement de fond demandé et livré
- day-summary.ts : ventesPart « En tout, ça fait N vente(s) pour X francs. » + repli agrégats « Aujourd'hui, tu as fait N ventes pour X francs. » ; depensesPart(data, afterSales) — « Tu as AUSSI dépensé » seulement après des ventes, total « Tes dépenses font X francs. » (repli agrégats aligné) ; soldePart « Ton solde de caisse est de X francs. » (fini « pour aujourd'hui ») + « zéro franc » si solde nul ; négatif inchangé ; JSDoc + exemple d'attendu mis à jour
- Tests : chaînes exactes des 27 tests existants alignées + 2 gardes VOCAL-610 (day-summary 29 : bannissement « pour un montant de »/« s'élèvent »/« pour aujourd'hui », transition « aussi » réservée aux ventes) ; 691/691 (45 fichiers) · tsc 0 · eslint 0 · build prod OK
- Registre : VOCAL-610 (VALIDATION 90 %, P2, parent VOCAL-609) → 47 tâches (build_tasks_xlsx.py regen OK) ; TASKS.md (Task 60), CHANGELOG
- AUCUN build APK (demande utilisateur expresse)

Stage Summary:
- Le dicté du résumé du jour parle désormais un français oralement naturel (« En tout, ça fait 3 ventes pour 34 500 francs. … Tes dépenses font 1 500 francs. Ton solde de caisse est de 33 000 francs. ») sans jamais changer une donnée
- Reste terrain : smoke du résumé complet sur appareil (rejoint B1-010/B5-052)

---
Task ID: 61
Agent: AGENT 1 (dev/archi)
Task: VOCAL-611 — solde dicté « Il te reste X francs en caisse » (formulation choisie par l'utilisatrice)

Work Log:
- SCAN : VOCAL-610 (a8e01e9) déjà poussé et en VALIDATION ; retour utilisateur citant la formulation « Il te reste X francs en caisse » → appliquée à la phrase de solde (VOCAL-609), zéro changement de fond
- day-summary.ts : soldePart — positif « Il te reste X francs en caisse. » (fini « Ton solde de caisse est de X francs », plus proche de la parole qu'un « solde » administratif, toujours DERNIÈRE phrase) ; nul « Il ne te reste plus rien en caisse. » (naturel à l'oreille, fini « zéro franc » plaqué) ; négatif inchangé « Attention, tes dépenses dépassent tes ventes de X francs. » (« Il te reste » n'a pas de sens en dessous de zéro) ; JSDoc + exemple d'attendu mis à jour ; gate rétrocompatibilité VOCAL-607 et jour vide → pas de solde INCHANGÉS
- Tests : attentes exactes alignées (8 occurrences « Ton solde de caisse » → « Il te reste … en caisse ») + 3 gardes VOCAL-611 (day-summary 32 : solde positif formulation demandée en fin de dicté + bannissement de l'ancienne tournure, solde nul naturel, solde négatif honnête sans « Il te reste ») ; 694/694 (45 fichiers) · tsc 0 · eslint 0 · build prod OK
- Registre : VOCAL-611 (VALIDATION 90 %, P2, parent VOCAL-610) → 48 tâches (build_tasks_xlsx.py regen OK) ; TASKS.md (Task 61), CHANGELOG
- AUCUN build APK (demande utilisateur expresse)

Stage Summary:
- La phrase de solde du résumé du jour dit « Il te reste 33 000 francs en caisse. » (et « Il ne te reste plus rien en caisse. » si nul) — registre oral choisi par l'utilisatrice, formule VENTES − DÉPENSES et tous les invariants conservés
- Reste terrain : smoke du résumé complet sur appareil (rejoint B1-010/B5-052)

---
Task ID: 62
Agent: AGENT 1 (dev/archi)
Task: STK-801 — audit + plan du système de stock (cahier des charges utilisateur 48 sections) — SANS code

Work Log:
- SCAN : cahier des charges « implémentation complète du système de stock » (règle absolue vente refusée si stock insuffisant, mouvements = source de vérité, garantie PostgreSQL, offline idempotent, unités CI, vocal Tata) + méthode imposée (audit → plan → implémentation, ne pas commencer à modifier le code)
- PHASE 1 AUDIT (3 explorations parallèles lecture seule) : DB (92 tables, 2 générations legacy actif / moderne orphelin, RLS intégral, RPC create_sale transactionnelle SANS appelant, conventions 1 objet = 1 fichier) · front (stock_qty décrémenté client-side en 3 points écrêté à 0, stores, dépenses, profils detaillant/semi_grossiste/grossiste) · vocal (13 intents sans stock, unités limitées, écrêtage non bloquant, pipeline prêt pour intents supplémentaires)
- PHASE 2 PLAN : .ai/PLAN_STOCK.md (7 décisions D1-D7, schéma merchant_stock_units/prices/balances/movements + purchases + transfers + business_partners, CHECK quantity_base >= 0, UNIQUE(merchant_id, operation_id), RPC avec erreurs métier JSON, backfill OPENING_BALANCE, refus strict stock insuffisant, intents stock + unités locales, offline operation_id + conflits, UI simple, tests vitest + pgTAP concurrence, ordre STK-802..812, points de décision à confirmer)
- Registre : +12 tâches STK-801 (TERMINÉ) et STK-802..812 (A_FAIRE, P0 pour STK-805) → 60 tâches (build_tasks_xlsx.py regen OK) ; TASKS.md (section 7 + Task 62 + ordre d'exécution), CHANGELOG
- ZÉRO fichier de code applicatif modifié (méthode §47) · AUCUN build APK

Stage Summary:
- Audit + plan livrés : le stock deviendra un registre de mouvements append-only garanti par PostgreSQL (jamais négatif, vente refusée si insuffisant), intégré progressivement au flux marchand actif sans destruction
- Prochaine étape : validation utilisateur du plan (§2.12 points de décision), puis STK-802..805 (fondation DB → RPC → service/API → refus strict P0)

---
Task ID: 62 (suite)
Agent: AGENT 1 (dev)
Task: PHASE 3 — implémentation du système de stock, fondation SQL (STK-802 migrations + STK-803 RPC transactionnelles) — suite directe du plan STK-801 commité (778c104)

Work Log:
- Re-lecture du plan commité (.ai/PLAN_STOCK.md) + conventions migrations (supabase/migrations/README.md) + contrat vente actuel (api/marchand/sales/route.ts : idempotence client_id, sous-totaux recalculés serveur, change écrêté) + modèle RPC create_sale moderne (20260908001730) + tests pgTAP existants (rls.sql, 176 assertions).
- STK-802 — 9 migrations additives (1 objet = 1 fichier, préfixe 2026091909*) : business_partners, merchant_product_units, merchant_product_prices, merchant_stock_balances (CHECK >= 0), merchant_stock_movements (append-only, 14 types signés, UNIQUE(merchant_id, operation_id), trigger anti-rewrite), merchant_purchases, merchant_purchase_items, merchant_stock_transfers, merchant_stock_transfer_items + fonction merchant_backfill_opening_balances() idempotente. RLS activé sans policy (tier service_role).
- STK-803 — 4 RPC security definer (revoke public / grant service_role) : merchant_record_sale (FOR UPDATE tri product_id, refus INSUFFICIENT_STOCK payload JSON, contrat vente actuel préservé, double écriture D3), merchant_record_purchase (coût moyen pondéré, dépense liée optionnelle), merchant_record_movement (UNKNOWN_STOCK sur sortie inconnue, reason obligatoire), merchant_adjust_to_count (delta tracé INVENTORY_COUNT).
- supabase/tests/stock.sql : 71 assertions pgTAP (scénario complet refus/exact/zéro/idempotence/append-only/coût moyen/comptage). Correction en cours de route : errcode du trigger append-only 23505 → P0001 ; plan() 73 → 71 recompté.
- Gates : tsc 0 · eslint 0 · vitest 694/694 (45 fichiers, aucun TS modifié). pgTAP non exécutable en sandbox (pas de CLI supabase/docker) — à jouer via bun run test:rls.
- Registre : build_tasks_xlsx.py STK-802/803 → VALIDATION 90 %, xlsx régénéré (60 tâches) ; TASKS.md (synthèse 19/10/6/3 + lignes STK-802/803 + Task 62 suite + ordre d'exécution 16) ; CHANGELOG.md entrée Task 62 suite.

Stage Summary:
- Livré : fondation SQL complète du système de stock — 15 fichiers SQL + 1 fichier pgTAP, 100 % additif, aucun changement de comportement applicatif (la bascule est STK-804/805).
- Invariants respectés : stock jamais négatif garanti par CHECK ≥ 0 + refus serveur ; mouvements = source de vérité append-only ; idempotence (merchant_id, operation_id) ; anciennes données conservées ;aucun build APK.
- Décisions notables : backfill crée la balance EXACT pour tout produit actif (stock 0 inclus) mais le mouvement OPENING_BALANCE seulement si stock > 0 ; produit sans balance = non suivi (vente encaissée sans mouvement, D7) ; premier achat met un produit sous suivi ; adjust_to_count d'un produit UNKNOWN part de before=0 ; legacy stock_qty arrondi (round) lors de la double écriture.
- Prochaine étape : STK-804 (StockService + API stock + bascule POST /api/marchand/sales sur la RPC) puis STK-805 (refus strict client + vocal + réécriture quick-sale.test.ts) ; application en base (supabase db push) au moment de la bascule.

---
Task ID: 62 (suite)
Agent: AGENT 1 (dev)
Task: PHASE 3 — couche applicative du système de stock : STK-804 (StockService + API + bascule route ventes sur la RPC) + STK-805 (refus strict stock insuffisant P0) — suite directe de la fondation SQL STK-802/803 (7586b3f)

Work Log:
- Re-lecture des contrats avant écriture : 4 migrations RPC (merchant_record_sale : FOR UPDATE + refus INSUFFICIENT_STOCK payload JSON + double écriture D3 ; record_purchase : coût moyen pondéré ; record_movement : UNKNOWN_STOCK + reason obligatoire ; adjust_to_count : delta tracé), PLAN_STOCK.md (D1-D7, §2.4 §2.6), quick-sale.ts (écrêtage :114-123), caisse-screen.tsx (:139-146), voice-modal.tsx, vente-rapide-modal.tsx, stock-store.ts (updateProduct = PATCH absolu), validation/marchand.ts, offline-db.ts + sync-handlers.ts (rejeu 'sale' → même payload, 4xx = conflit définitif), legacy_sales.client_id UNIQUE.
- Verrou technique levé : merchant_stock_movements.operation_id est UUID alors que les clientIds clients sont « sale-<ts>-<rand> » → operationUuid() dérive un UUID DÉTERMINISTE (md5 hex → format 8-4-4-4-12, même technique que le backfill opening:) : rejeu offline → même UUID → idempotence RPC ; pré-check client_id du route conservé pour les ventes pré-bascule.
- STK-804 — src/lib/stock/stock-service.ts (nouveau) : wrappers RPC + parseStockRpcError (message=code + details=JSON → StockBusinessError) + operationUuid + roundQuantity(14,3). Routes nouvelles (zod + requireDeviceOwner + mapping INSUFFICIENT_STOCK/UNKNOWN_STOCK → 422 avec payload) : GET /api/marchand/stock/balance (auto-backfill OPENING_BALANCE au 1er accès si marchand a des produits mais 0 balance), GET/POST /api/marchand/stock/movements, POST /api/marchand/stock/count, POST /api/marchand/stock/backfill, POST/GET /api/marchand/purchases. POST /api/marchand/sales BASCULE sur merchant_record_sale : pré-check client_id conservé, operation_id dérivé, réponse identique (items re-lus de legacy_sale_items), GET inchangé, erreurs métier 422/400, REPLI legacy 2-inserts si PGRST202 (migrations non appliquées en base) → aucune vente bloquée avant bun run supabase:push (bascule réelle = push DB). +4 schémas zod.
- STK-805 — refus à 3 niveaux : (1) pré-vérification LOCALE (completeQuickSale + panier entier caisse-screen) → refusal {code, product, available, requested}, rien envoyé/décrémenté/encaissé ; (2) SERVEUR autorité : 422 INSUFFICIENT_STOCK fait foi (stock local périmé), JAMAIS en file (4xx définitif, aligné offline-db) ; autres 4xx définitifs aussi, seuls 408/429/5xx → file ; (3) phrases imposées formatStockRefusal (tata-phrases.ts) « Tu as seulement 10 kilos de tomates en stock. Je ne peux pas enregistrer une vente de 15 kilos. » / « Tu n'as plus de stock de X. » — unités parlées (kg→kilo(s), sac, bassine, fût…, singulier/pluriel), jamais d'unité inventée ; parlées par Tata (voice-modal, vente-rapide-modal, caisse). Décrément local = delta adjustLocalStock (nouveau dans stock-store, projection SANS PATCH réseau — plus jamais de valeur absolue calculée client, D3) APRÈS verdict favorable ; vente exacte (=) autorisée ; article non suivi inchangé (D7).
- Tests : quick-sale.test.ts RÉÉCRIT (contrat demandé : survente REFUSÉE — fetch jamais appelé, file jamais, stock/caisse intacts ; stock nul ; vente exacte −3 ; refus serveur périmé ; 4xx définitif ; succès/offline/timeout/file-KO) ; +17 tests stock-service ; +9 tests phrases refus (tata-phrases.test.ts).
- Gates : vitest 725/725 (46 fichiers, +31) · tsc 0 · eslint 0 · build prod OK (6 routes API compilées). Corrections en cours de route : TS2783 clé code dupliquée (spread ...b) ×4 ; test « stock local périmé » recalé (pré-check local agit en premier → local doit avoir ASSEZ de stock pour tester le refus serveur).
- Registre : build_tasks_xlsx.py STK-804/805 → VALIDATION 90 % (résultats réels), TASKS.xlsx 60 tâches régénéré ; TASKS.md (synthèse 21/21/8/3 + lignes STK-804/805 + Task 62 suite + ordre d'exécution 17) ; CHANGELOG.md entrée Task 62 suite.

Stage Summary:
- Livré : le système de stock est vivant côté applicatif — StockService central (zéro logique de stock en route), 6 routes API marchand, bascule de la vente sur la RPC transactionnelle PostgreSQL, refus strict P0 avec formulations imposées, décrément local en delta après verdict.
- Invariants respectés : le serveur est l'autorité (le client ne re-vérifie pas, il pré-vérifie pour l'UX) ; stock jamais négatif (CHECK ≥ 0 + FOR UPDATE, actif dès le db push) ; idempotence double (client_id pré-check + operation_id dérivé) ; mouvements = source de vérité ; zéro suppression de comportement (repli legacy PGRST202) ; données réelles ; FCFA entiers ; AUCUN build APK.
- Décisions notables : repli legacy si RPC absente (déploiement avant db push = comportement historique, jamais de vente bloquée) ; auto-backfill OPENING_BALANCE au 1er GET balance (marchand sans balances) ; 4xx définitifs jamais en file offline (quick-sale + caisse alignés sur offline-db) ; ajustement stock local en delta (adjustLocalStock) au lieu du PATCH absolu historique.
- Action requise au déploiement : bun run supabase:push (migrations STK-802/803 → active la garantie PostgreSQL et le refus strict serveur) puis bun run test:rls (71 pgTAP) — CLI non disponible dans la sandbox.
- Prochaine étape : STK-806 (unités locales + conversions + affichage commercial « 2 sacs + 13 kg » + seuils) puis STK-807 (intents vocaux stock) et STK-808 (offline operation_id + conflits + refresh balances).

---
Task ID: 62 (suite — validation QA)
Agent: AGENT 2 (PM/QA) + AGENT 1 (correctif)
Task: Validation indépendante QA de STK-804/805 avant commit/push

Work Log:
- AGENT 2 (sous-agent QA, lecture seule) : gates réexécutées (725/725 · tsc 0 · eslint 0) ; contrôles a-f : refus 3 chemins (PARTIEL), idempotence (CONFORME), repli PGRST202 (CONFORME), régressions (AUCUNE), phrases imposées (CONFORMES à la fonction), registre (COHÉRENT).
- Verdict : PASS CONDITIONNEL — 1 anomalie majeure M1 : voice-modal.tsx branche vente avec produit reconnu (executeIntent) ignorait result.refusal → message générique au lieu de la phrase imposée.
- AGENT 1 : M1 corrigé (miroir exact de la branche déjà conforme — formatStockRefusal parlée, auto-close 6 s) ; re-greffe des 3 gates : 725/725 · tsc 0 · eslint 0.
- Mineures actées et non bloquantes : m1 élision « de oignons » (acté en test), m2 AGENT1_STATUS.md antérieur, m3 décompte synthèse pré-existant, m4/m5 arrondis legacy à traiter avec les décimales STK-806/807.

Stage Summary:
- STK-804/805 : CODE_TERMINÉ + QA PASS — prêtes au commit/push. La garantie PostgreSQL s'activera au db push (action documentée dans le registre).

---
Task ID: 70
Agent: AGENT 1 (dev)
Task: Effet d'écoute de Tata aligné sur la page d'authentification (logo Tata)

Work Log:
- Demande utilisateur : « l'effet écoute de Tata soit comme celui de la première page auth de connexion mais avec le logo de Tata, après fais une capture »
- Analyse : l'effet signature de l'auth = bouton micro circulaire `bg-[#D2622A]` + `animate-pulse` + halo `ring-4 ring-[#D2622A]/25` ; le modal vocal (`voice-modal.tsx`) n'avait qu'un cercle pâle `bg-[#C66A2C]/20`
- voice-modal.tsx : le cercle central de Tata adopte l'effet auth à l'écoute — `bg-[#D2622A]` + `ring-4 ring-[#D2622A]/25` + `shadow-[#D2622A]/40` + `animate-pulse`, avec le logo `/icon-only.png` (état au repos inchangé `bg-white/10`, transition 300 ms)
- Capture d'écran réelle : serveur dev + connexion compte de seed Awa KONE (0701020304 / PIN 1234, caisse ouverte 5 000 F) → bouton Tata → état « écoute » figé par un `SpeechRecognition` factice injecté (aucune erreur STT pendant la capture) → 2 captures (414×896)
- Gates : vitest 901/901 (56 fichiers) · tsc 0 · eslint 0
- Commit `954bc0f` poussé origin/main ; captures livrées dans download/ (tata-effet-ecoute.png, tata-effet-ecoute-2.png)

Stage Summary:
- L'effet d'écoute du modal vocal est désormais identique à celui de la page d'authentification : cercle orange vif pulsant avec halo, portant le logo de Tata — captures réelles à l'appui

---
Task ID: 71
Agent: Super Z (principal — orchestrateur multi-agents)
Task: Cahier des charges « Mode Marché » 48 sections (volets restants après le chantier stock) — audit → plan → implémentation → fusion UNION avec le commit parallèle `0b209d4`.

Work Log:
- PHASE 1 AUDIT (2 agents parallèles lecture seule + vérifications directes) : 13 manques restants (§4-8 activation/config/session marché, §15 fournisseurs, §18 points de vente, §21-22 crédits, §26-28 alertes/intents, §34 indicateur, §40 écran, §46 doc) + 12 fondations réutilisables (offline-db FIFO, 18 handlers, network-store unique, modales globales, geolocation plugin présent, conventions zustand) — rapport dans `.ai/PLAN_MARKET_MODE.md` §1.
- PHASE 2 PLAN : 12 tâches MODE-9xx + 8 décisions D1-D8 (état local, session = contexte pas vérité, zéro duplication UI, geo pattern biometric, marchés provisoires assumés, offline jamais une erreur, périmètres séparés, conventions persist). Spec `.ai/SPECS/SPEC-MODE-901.md`.
- PHASE 3 (tests d'abord, rouge vérifié, +39) : store, geo (natif→web jamais throw), connectivité 4 états, builders session marché, compteur de flush, migration `merchant_market_sessions`, route upsert idempotent client_id, handler offline, branchement caisse unidirectionnel (`caisse-link.ts`), `closeSession(countedCash?)`, `CloseDayModal` extraite + montée globale, écran §40 + modale d'activation + narration + tuile accueil, `docs/MARKET_MODE.md`.
- INCIDENT-006 (push rejeté) : l'utilisateur a poussé `0b209d4` (même volet, implémentation parallèle). Fusion UNION — conservé de l'utilisateur : écran (métriques/actions/config/langue Tata fr-bci/bientôt-dioula-sénoufo-bété/bouton Synchroniser), store `julaba-market-mode` + câblages, test store ; conservé de l'incrément : session marché §7-8 complète, moteur geo jamais-throw (leur `captureMarketLocation` réimplémenté par-dessus), CloseDayModal globale ; retiré (supplanté) : mon store/écran/activation/markets/connectivité/strip. Réparé : `market-mode-screen.tsx:47` destructuration tronquée (champ « Nom du marché » cassé à l'exécution, inerte pour tsc) + boucle React infinie `useStockStore((s)=>s.getLowStockProducts())` (dérivation useMemo hors sélecteur).
- E2e navigateur post-fusion : activation sur l'écran utilisateur → ouverture caisse 5 000 F → entité `market-session` open en file (marketName/pas de GPS/locationMode corrects) → clôture caisse comptée → même clientId.
- Gates finaux : vitest **918/918 (59 fichiers)** · tsc 0 · eslint 0 · build prod OK. Commits `48980b0` (incrément rebasé) + `89afefc` (fusion) — push OK (`0b209d4..89afefc`).

Stage Summary:
- Le Mode Marché est FONDÉ : écran utilisateur conservé + session de journée marché offline-first (contexte marché/position/caisse de départ/clôture) upsertée idempotemment, indicateur réseau discret, doc §46.
- Registres à jour : PLAN_MARKET_MODE + SPEC annotés fusion, TASKS.md/xlsx (12 lignes MODE), CHANGELOG, INCIDENTS (006), worklog.
- Prochaines actions recommandées : MODE-906 (crédits/remboursements P1), MODE-907 (fournisseurs), MODE-908 (points de vente), MODE-909 (annulation), MODE-910 (stats/alertes), MODE-912 (smoke Android §44 — rejoint B5-052), `bun run supabase:push` pour la table `merchant_market_sessions` + pgTAP.

---
Task ID: 72
Agent: Super Z (principal)
Task: Effet d'écoute de Tata aligné sur la page d'authentification pour « Ouvrir ma caisse »

Work Log:
- Demande utilisateur : « enchaîne et fais un ui(vocal) : effet d'écoute de Tata aligné sur la page d'authentification pour "Ouvrir ma caisse" »
- Repérage : surface réelle d'ouverture = OpenCaisseModal (ouverte depuis l'accueil) ; la modale locale `showOpenDay` du home-screen est du code mort (jamais montée) ; `VoiceAmountInput` porte aussi une ouverture de caisse (panneau « Ouvrir la caisse » du caisse-screen)
- open-caisse-modal.tsx : cercle Tata aligné sur la signature auth (même motif que le Task 70) — à l'écoute `bg-[#D2622A]` + `ring-4 ring-[#D2622A]/25` + `shadow-[#D2622A]/40` + `animate-pulse` (avant : cercle pâle `bg-[#C66A2C]/20` sans halo) ; bouton micro aligné auth : orange vif + halo, le micro pulse au lieu du spinner Loader2 (import retiré)
- voice-amount-input.tsx : même signature sur son bouton micro (fond de caisse / prix produit)
- Capture réelle : dev server + STT factice injecté + connexion Awa KONE (0701020304 / PIN 1234) → « Ouvrir ma caisse » → écoute auto (annonce → invite → micro) → 2 captures 414×896 dans download/ (tata-ecoute-ouvrir-caisse.png, -2.png)
- Incident mineur : push rejeté — commit parallèle utilisateur `3afae7b` (« annoncer l'écoute avant l'invite ») touchant le même fichier ; zones disjointes → rebase propre sans conflit, gates re-vérifiés post-fusion
- Gates : vitest 918/918 (59 fichiers) · tsc 0 · eslint 0
- Commit `4c59f34` poussé origin/main

Stage Summary:
- L'ouverture de caisse parle le même langage visuel que l'auth et le modal vocal : cercle orange vif pulsant avec halo, portant le logo de Tata — micro qui pulse, plus de spinner. Captures réelles à l'appui.
- La modale gagne aussi l'annonce « Je t'écoute. » avant l'invite (commit parallèle 3afae7b conservé tel quel).

---
Task ID: 73
Agent: Super Z (principal)
Task: Effet d'écoute de Tata aligné sur la page d'authentification — vente rapide (+ état des lieux « dépenses »)

Work Log:
- Demande utilisateur : enchaîner sur le même alignement pour les autres micros (vente rapide, dépenses)
- Cartographie exhaustive : `isListening` dans marchand = auth-screen, voice-modal, open-caisse-modal, voice-amount-input (toutes déjà alignées) + vente-rapide-modal (dernière surface à l'ancien motif) ; les autres occurrences `#C66A2C/20` sont décoratives ; `depenses-screen.tsx` n'a AUCUN micro (saisie clavier + tataSpeak de feedback) → rien à aligner côté dépenses
- vente-rapide-modal.tsx : cercle Tata → signature auth (bg-[#D2622A] + ring-4 ring-[#D2622A]/25 + shadow + animate-pulse ; état succès CheckCircle2 inchangé) ; 5 barres d'onde → #D2622A ; bouton micro → orange vif + halo + micro pulsant (spinner Loader2 retiré, import nettoyé)
- Capture réelle : dev server + STT factice + connexion Awa KONE → « Vente rapide » → écoute auto → 2 captures 414×896 (download/tata-ecoute-vente-rapide.png, -2.png) — cercle, onde et micro tous en #D2622A
- Gates : vitest 918/918 (59 fichiers) · tsc 0 · eslint 0
- Commit `05104e0` poussé origin/main

Stage Summary:
- TOUTES les surfaces d'écoute vocale du parcours marchand partagent désormais la même signature visuelle auth : auth, modal vocal, ouverture de caisse, vente rapide (et les champs VoiceAmountInput). La chaîne est fermée.
- Dépenses : pas de saisie vocale aujourd'hui — si l'on veut un micro « j'ai dépensé 3 000 francs pour le transport », c'est une NOUVELLE fonctionnalité (rejoint le cahier Mode Marché §16), pas un alignement.

---
Task ID: 74-b
Agent: AGENT 74-b (dev)
Task: MODE-906 — « Crédits clients + remboursements » (cahier Mode Marché §9/§21-22/§27-28) — offline-first, tests d'abord

Work Log:
- Reprise d'un incrément non commité présent dans le dépôt : audit ligne par ligne (spec, migrations, routes, handlers, store, phrases, intents, UI, notifications), complétion des manques (docs/registres), correction zéro sur le code (gates déjà vertes) — NE COMMIT PAS (revue/commit orchestrateur)
- Spec .ai/SPECS/SPEC-MODE-906.md ; migrations ÉCRITES (NON appliquées — pas de CLI) : 20260919130000 (legacy_sales.payment_method défaut 'especes' + CHECK fermé idempotent) et 20260919130100 (merchant_credit_ops append-only UNIQUE(merchant_id, operation_id) + RPC merchant_record_credit_op SECURITY DEFINER : verrou FOR UPDATE, idempotence sans retouche du solde, refus REPAYMENT_EXCEEDS_DEBT avec détail solde) — écart assumé : merchant_id/partner_id en TEXT car business_partners.id est text
- Validation : createPartnerSchema + createCreditOpSchema (client_id min 8, montants FCFA entiers > 0 max 100 M) + paymentMethod optionnel sur createSaleSchema (défaut 'especes')
- Routes API : /api/marchand/partners (GET scopée limit 200 clampé ; POST upsert idempotent client_id — 200 connu / 201 créé / 23505 → relecture → 200) ; /api/marchand/credit-ops (POST : partenaire résolu par partnerClientId, création à la volée si partnerName, RPC, repli PGRST202 INSERT+UPDATE avec relecture solde avant UPDATE et même refus, 42P01 → 503 transitoire ; GET 50 dernières ops avec nom partenaire)
- Offline : handlers 'merchant-partner' et 'credit-op' dans sync-handlers.ts (rejeu verbatim jsonRequest, 4xx définitif = conflit rapporté puis retiré de la file, 503/5xx = conservé)
- Phrases pures credit-phrases.ts (tutoiement, zéro emoji, formatMontantParle) : « C'est enregistré. Adjoua te doit maintenant 5 000 francs. », dette de A à B / « ne te doit plus rien », refus honnête, « Tes clients te doivent X francs en tout, sur N crédits. » — TESTS D'ABORD (rouge vérifié par la mission, verts au run)
- credits-store.ts ('julaba-credits-store', persist + partialize minimal, journal append-only cap 200) : recordCredit (partenaire créé/récupéré, saleClientId propagé, file 'credit-op', notification crédit best-effort), recordRepayment (dépassement → refusal REPAYMENT_EXCEEDS_DEBT SANS mutation ni file), selectors totalOutstandingCfa / clientsWithDebt (tri décroissant) / partnerByName (casse+accents), operationClientId() = crypto.randomUUID — TESTS D'ABORD
- Voix : localIntent.ts — credit_block réorienté (aide caisse + dictée), NOUVEAUX intents credit_doit (« Adjoua me doit 5 000 francs », lettres comprises) et credit_paye (« Adjoua m'a payé les 3 000 francs », apostrophes ' et ', accents é/è, casse libre, noms 1-3 mots) — jamais de vente/stock captés (garde + tests) ; voice-modal.tsx : confirmation orale obligatoire (pendingConfirmRef) « Je note que Adjoua te doit 5 000 francs. Je confirme ? » → oui → store + phrase, dépassement → phrase honnête, « non » → « Je n'ai rien noté. »
- UI : credits-screen.tsx (total dû, clients avec dette + « Noter un paiement », « Nouveau crédit », historique récent, état vide avec aide « Vendez à crédit depuis la caisse, ou dites : Adjoua me doit 5 000 francs », lucide BookOpen/HandCoins, zéro emoji) ; route 'credits' (app-store + openCreditsScreen + case page.tsx + narration) ; QuickAction « Mes crédits » (market-mode-screen) + tuile accueil (home-screen, à côté de Dépenses) ; caisse : sélecteur Espèces/Mobile Money/Crédit/Autre (défaut Espèces), Crédit → nom client requis + suggestions + montant reçu masqué + recordCredit(saleClientId) + vente payment_method 'credit' + phrase ; quick-sale.ts 3e paramètre optionnel { paymentMethod } (défaut 'especes', inchangé) ; route ventes : payment_method dans l'insert legacy SEULEMENT si ≠ 'especes' (compat avant/après migration)
- Notifications : catégorie 'credit' (types + libellé ; hors périmètre affichable → préférence non définie = « on »), builders creditRecordedInput / repaymentReceivedInput, déclenchés best-effort dans le store
- Doc : docs/MARKET_MODE.md §8bis crédits (modèle, sync, idempotence, refus, phrases, caisse, notifications) + registres à jour ; .ai/PLAN_MARKET_MODE.md MODE-906 → livré ; rapport détaillé dans agent-ctx/74-b-mode-906.md
- Gates : vitest 956/956 (62 fichiers — baseline 918 + 38 nouveaux, 3 fichiers, aucun test existant modifié) · tsc 0 · eslint 0

Stage Summary:
- Le crédit clients est vivant et 100 % offline-first : grand livre append-only garanti (RPC verrou FOR UPDATE, idempotence (merchant_id, operation_id)), dettes jamais négatives (refus local ET serveur), vente à crédit liée par saleClientId, caisse 4 modes de paiement, écran Mes crédits, dictée vocale confirmée avant écriture, notifications crédit — l'offline n'est jamais une erreur
- Action requise au déploiement : bun run supabase:push (migrations 20260919130000 + 20260919130100) puis bun run test:rls — avant le push, le repli PGRST202 (op + solde, même refus) et le 503 transitoire (table absente) gardent le comportement offline-first intact
- Reste hors périmètre : vente vocale à crédit avec panier stock, échéanciers/relances, annulation d'op (MODE-909), fournisseurs (MODE-907)

---
Task ID: 74-c
Agent: AGENT 74-c (dev)
Task: MODE-907 — « Fournisseurs » (cahier Mode Marché §15) — annuaire + rattachement aux achats (client + vocal) + crédit fournisseur en affichage seul — offline-first, tests d'abord

Work Log:
- Fondations MODE-906 réutilisées SANS duplication : table business_partners (kind 'fournisseur'), route /api/marchand/partners (GET ?kind=fournisseur + POST upsert idempotent), handler offline 'merchant-partner', store credits-store (upsertPartner acceptait déjà kind — vérifié, étendu proprement : location/products + newPartnerClientId exporté), RPC merchant_record_purchase (validait déjà p_supplier_id). ZÉRO migration nouvelle (décision : localisation/produits = champs structurés LOCAUX, voyagent composés dans note serveur « Localisation : … · Produits : … » — aucune perte, aucune colonne, aucun risque d'insert avant push).
- Spec .ai/SPECS/SPEC-MODE-907.md (FR, décisions verrouillées reprises).
- Tests ÉCRITS D'ABORD (rouge vérifié : 16 échecs / 17 verts sur les 3 nouveaux fichiers) : src/lib/voice/__tests__/purchase-supplier.test.ts (phrase du cahier « j'ai acheté 20 kilos de tomates à 15 000 francs chez Koné » → qty 20/kg/tomates/15 000/Koné ; noms 1-3 mots, casse conservée, ponctuation ; pas de capture si « chez » en milieu de phrase ou >3 mots ; NON-RÉGRESSION sans « chez » : 15000 contigu, 24000 « le sac », vente/production jamais captées ; payload supplierClientId/supplierName absents si pas de fournisseur ; confirmation «, chez Koné » vs phrase existante inchangée) ; src/app/api/marchand/purchases/__tests__/route-supplier.test.ts (schéma min 8/min 2 ; résolution supplierClientId→id via Supabase mocké : connu → RPC, inconnu+supplierName → création à la volée kind 'fournisseur', inconnu seul → 422 « Fournisseur inconnu », 23505 → relecture, 42P01 → 503, supplierId direct compat sans requête ; GET ?supplierId= et ?supplierClientId= filtrés, fournisseur jamais synchronisé → liste vide honnête, sans filtre → historique complet) ; src/lib/market-mode/__tests__/fournisseurs-store.test.ts (newPartnerClientId, upsertPartner kind fournisseur en file 'merchant-partner', défaut 'client' inchangé, location/products locaux + note composée + pas de fuite des champs structurés dans le payload, édition sans re-file, FIFO 'merchant-partner' AVANT 'stock-purchase', partnerByName).
- Validation : createPurchaseSchema + supplierClientId (min 8 max 64) + supplierName (min 2 max 80) — priorité supplierClientId = logique de route (supplierName ne sert qu'au secours de création).
- Route achats purchases/route.ts : resolveSupplierId (client_id + merchant → business_partners.id, création à la volée idempotente, 422/409/503/500) ; POST : supplierId direct prioritaire (compat), sinon résolution ; supplierName SEUL ni résolu ni créé (aucune clé d'idempotence appareil — achat part sans fournisseur, documenté) ; GET : ?supplierId= et ?supplierClientId= (résolu pareil ; partenaire absent → {purchases:[],count:0} JAMAIS l'historique complet).
- Parseur vocal localIntent.ts : PURCHASE_SUPPLIER_RE (« chez <1-3 mots> » ancré fin de phrase, casse libre, accents/apostrophes, antériorité du transcript ORIGINAL pour la casse du nom) ; la queue est RETIRÉE du flux montant + espace des milliers normalisée (ground truth vérifié AVANT : « à 15 000 francs » sans chez = amount 0 quirk préexistant → NON touché ; avec chez → 15 000 honnête) ; intent.supplier + responseText « …, chez Koné, c'est bien ça ? ».
- voice-stock.ts : StockPurchaseIntentFields.supplier + buildStockPurchasePayload({supplierClientId}) → payload supplierClientId + supplierName (clés absentes sinon — payload historique byte-identique) ; apiPath/offlineEntity inchangés.
- voice-modal.tsx branche achat (purchase et restock) : si fournisseur capté → credits-store.upsertPartner({kind:'fournisseur', clientId connu ou newPartnerClientId, name}) AVANT buildStockPurchasePayload (file FIFO 'merchant-partner' < 'stock-purchase' — rejeu offline : fournisseur créé avant l'achat) puis supplierClientId dans le payload ; confirmation formatPurchaseConfirmation(+supplier) « Achat enregistré : …, chez Koné. » UNIQUEMENT si fournisseur capté — sinon phrases existantes inchangées. Création APRÈS la résolution de quantité : quantité invalide → aucun partenaire créé.
- tata-phrases.ts : formatPurchaseConfirmation gagne supplier? (clause «, chez X » uniquement si présent — tests non-régression).
- Écran src/components/marchand/fournisseurs-screen.tsx « Mes fournisseurs » : liste (nom, téléphone · localisation, badge crédit ambre si balance < 0 = le marchand doit), « Nouveau fournisseur » (modale bas : nom requis, téléphone, localisation, produits texte libre — maxLength calibrés ≤ note 200), détail (fiche + « Modifier la fiche » + historique d'achats GET ?supplierClientId= : chargement/erreur honnête « au retour de la connexion »/vide, max-h-96 julaba-scroll), état vide avec aide exacte du cahier (« Dites : j'ai acheté 20 kilos de tomates à 15 000 francs chez Koné »), lucide Truck/Phone/MapPin/Pencil/User/History, zéro emoji, boutons h-12/h-14 min-h-11, aria-labels, pattern soleilMode de credits-screen.
- Route 'fournisseurs' : app-store (ScreenRoute + openFournisseursScreen même motif qu'openCreditsScreen), page.tsx (import + case + narration « Mes fournisseurs. Voici ton annuaire et tes achats de marchandises. »), QuickAction « Mes fournisseurs » (Truck) sur l'écran Mode Marché, tuile accueil (Truck, violet, à côté de « Mes crédits »).
- Livrable 8 tranché par l'audit des appelants : AUCUN formulaire clavier de POST purchases côté client (seuls voice-modal et le rejeu 'stock-purchase') — réception des commandes = PATCH supplier-orders serveur (legacy_supplier_orders.supplier texte libre, NE PAS migrer, dette technique consignée) → documenté : seuls le vocal et l'API portent le fournisseur.
- Doc : docs/MARKET_MODE.md §8ter « Fournisseurs (§15 — MODE-907) » + diagramme §2 + tests §10 (992/992, 65 fichiers) + §11 restant ; .ai/PLAN_MARKET_MODE.md MODE-907 → livré ; agent-ctx/74-c-mode-907.md.
- Gates FINALES : vitest 992/992 (65 fichiers — baseline 956/956 + 36 nouveaux/3 fichiers [15 parseur-payload-confirmation + 13 route + 8 store], zéro test existant modifié ni cassé) · tsc 0 · eslint 0. Serveur dev : non démarré par l'agent (consigne) — vérification runtime navigateur non faite ; écran calqué sur credits-screen (pattern validé), tsc/eslint verts. (Correction reprise 74-c : le décompte « 62 nouveaux » était erroné — 36 est le compte exact, 956 + 36 = 992.)

Stage Summary:
- L'annuaire fournisseurs est vivant et offline-first : création/édition locale (file 'merchant-partner' idempotente), achat vocal « chez Koné » crée le fournisseur AVANT l'achat (FIFO) et rattache l'achat via supplierClientId résolu serveur (création à la volée en filet), historique d'achats par fournisseur, crédit fournisseur AFFICHÉ (badge si balance < 0) mais jamais écrit — paiements fournisseurs hors périmètre assumé.
- Décisions notables : localisation/produits locaux + note composée (zéro migration) ; supplierName seul ignoré (pas d'idempotence) ; non-régression du parseur garantie phrase par phrase (le quirk « 15 000 » espacé sans chez reste tel quel — préexistant, consigné).
- Reste hors périmètre : paiements aux fournisseurs (sémantique des signes à repenser), migration legacy_supplier_orders, formulaire clavier d'achat (inexistant), réconciliation serveur → local de l'annuaire, smoke navigateur/appareil.

---
Task ID: 74-d
Agent: AGENT 74-d (dev)
Task: MODE-908 — « Points de vente multiples » (cahier Mode Marché §18) — offline-first, tests d'abord

Work Log:
- Fondations MODE-906/907 réutilisées SANS duplication : conventions routes upsert idempotent client_id (partners/credit-ops), queuePendingSync + registerSyncHandler, stores persist partialize minimal (D8), motif insert legacy conditionnel de payment_method dans la route ventes.
- Spec .ai/SPECS/SPEC-MODE-908.md ; migrations ÉCRITES (NON appliquées — pas de CLI) : 20260919140000 (table merchant_selling_points : id uuid pk default gen_random_uuid(), merchant_id, client_id text UNIQUE, name, kind fermé boutique/marche/autre défaut 'autre', archived_at, created_at + index (merchant_id, created_at desc) + RLS activée) et 20260919140100 (legacy_sales.selling_point_client_id text nullable + index) — commentaires d'en-tête français, compat avant/après push.
- Validation : createSellingPointSchema (clientId min 8 max 64, name 2-60, kind défaut 'autre', archivedAt? ISO) + createSaleSchema étendu (sellingPointClientId? min 8, sellingPointName? min 2 max 60 — OPTIONNELS : payload historique identique sinon).
- Tests ÉCRITS D'ABORD (rouge vérifié : 5 échecs / 2 verts) : selling-points-store.test.ts (18 — Boutique auto-créée au 1er usage et stable, add/rename/archive avec file 'selling-point', archivage JAMAIS une suppression + idempotent + libère la sélection, setActive refuse un archivé sans file, tout archivé → recréation, sans marchand = pas de file, builder activeOrDefault jamais null), route-selling-points.test.ts (11 — 201 / 200 + UPDATE name/kind sans jamais NULLer archived_at / archivedAt voyage / 23505 → relecture → 200 / 42P01 → 503 / 400 zod / GET scopé limit clampé), route-selling-point.test.ts (7 — résolution client_id → id dans l'insert legacy SEULEMENT si résolu, clé absente sinon, 42P01 toléré, RPC merchant_record_sale jamais alimentée), quick-sale-selling-point.test.ts (3 — payload étiqueté, payload historique sans clés, journal avec snapshot).
- Store src/lib/market-mode/selling-points-store.ts ('julaba-selling-points', partialize minimal) : addPoint (UUID, pas d'auto-activation), renamePoint, archivePoint (idempotent, libère la sélection si actif), setActive (REFUS si archivé ; préférence APPAREIL → pas de file — aucune colonne is_active), activePoint() (Boutique auto-créée/recréée — jamais de liste vide bloquante) ; file 'selling-point' à chaque mutation qui change les données serveur ; sans merchantId : mutation locale OK sans file. Builder pur selling-point.ts (types + isPointArchived + activeOrDefault → { clientId, name } jamais null).
- Route /api/marchand/selling-points (GET+POST) : conventions zod 400 + requireDeviceOwner + createSupabaseAdminClient ; POST upsert idempotent (connu → UPDATE name/kind + archived_at SI fourni → 200 ; inconnu → 201 ; 23505 → relecture → 200 ; 42P01 → 503) ; GET scopé merchant_id, created_at desc, limit 200 clampé, 42P01 → 503. Handler offline 'selling-point' (rejeu verbatim ; FIFO : le point part AVANT la vente qui le référence).
- Étiquetage des ventes : route sales déstructure les 2 champs optionnels et legacyInsertSale résout sellingPointClientId → merchant_selling_points.id (try/catch — inconnu/42P01 → pas de colonne, vente JAMAIS bloquée) et écrit selling_point_client_id SEULEMENT si résolu ; RPC merchant_record_sale NON modifiée (écart documenté, même motif A1 que payment_method). quick-sale.ts : QuickSaleOptions + sellingPointClientId/sellingPointName (passés par ARGUMENTS, sens unique — quick-sale n'importe jamais le store) ; payload ne change que si fourni ; addTodaySale reste à 1 argument sans point (4 tests existants préservés — 1 itération de correction dans MON code). caisse-store : todayPoints (agrégat clientId + snapshot name + amountCfa + count) via addTodaySale(amount, point?) — journal offline persisté, remis à zéro chaque jour.
- Émetteurs : caisse-screen (getState().activePoint() au moment de la vente → payload + journal), vente-rapide-modal et voice-modal (2 sites) passent le point actif en options de completeQuickSale — zéro import croisé nouveau (le store n'importe qu'app-store + offline-db, comme credits-store).
- Écran src/components/marchand/points-vente-screen.tsx « Mes points de vente » : carte point actif, liste en activité (badge kind, actif en surbrillance, Vendre ici / Renommer / Archiver), archivés en section repliée, modales bas ajout (nom + 3 kinds) et renommage, erreurs honnêtes, tataSpeak sobre, lucide Store/MapPin/Archive/Pencil, zéro emoji, gros boutons min-h-11/h-12/h-14, pattern soleilMode de credits-screen. Route 'points-vente' (PIÈGE respecté : 'marche' déjà prise) — app-store (ScreenRoute + openPointsVenteScreen), page.tsx (import + case + narration). Accès : QuickAction « Points de vente » (Store) sur l'écran Mode Marché + carte journée (nom du point actif cliquable) ; dérivation UI useMemo + activeOrDefault (INCIDENT-006 : jamais d'objet neuf dans le sélecteur), Boutique créée via effet de montage.
- Doc : docs/MARKET_MODE.md §8quater « Points de vente multiples (§18 — MODE-908) » + diagramme §2 (entité 'selling-point', 22 handlers) + §10 (1031/1031, 69 fichiers) + §11 restant ; .ai/PLAN_MARKET_MODE.md MODE-908 → livré ; agent-ctx/74-d-mode-908.md.
- Gates FINALES : vitest 1031/1031 (69 fichiers — baseline 992/992 + 39 nouveaux/4 fichiers, zéro test existant modifié ni cassé) · tsc 0 · eslint 0. Serveur dev non démarré (consigne) — vérification runtime navigateur non faite ; écran calqué sur credits-screen (pattern validé), tsc/eslint verts.

Stage Summary:
- Les points de vente sont vivants et offline-first : « Boutique » existe toujours (auto-créée au premier usage), le point actif est visible sur la carte journée et gérable dans l'écran dédié (ajout, renommage, archivage — jamais de suppression), et chaque vente (caisse, vente rapide, vente vocale) est étiquetée par son point : payload optionnel résolu serveur en merchant_selling_points.id dans l'insert legacy (jamais bloquant), journal local du jour agrégé par point avec snapshot du nom pour les stats offline.
- Décisions notables : setActive = préférence appareil (pas de file) ; sellingPointName voyage sans être stocké serveur (aucune colonne) ; l'upsert ne désarchive jamais par accident (archived_at jamais NULLé) ; pas d'auto-activation d'un nouveau point (choix explicite « Vendre ici »).
- Action requise au déploiement : bun run supabase:push (migrations 20260919140000 + 20260919140100) puis bun run test:rls — avant le push, les ventes étiquetées partent sans colonne (résolution « inconnue » tolérée) et la file offline conserve tout.
- Reste hors périmètre : stock par point, transferts entre points, réconciliation serveur → local de la liste, désarchivage, smoke appareil (MODE-912).

---
Task ID: 74-f
Agent: AGENT 74-f (dev)
Task: MODE-910 — « Résumé enrichi + tableau de bord stats + alertes » (cahier Mode Marché §23/§25/§26) — offline-first, réutilisation pure, tests d'abord

Work Log:
- PÉRIMÈTRE VERROUILLÉ respecté : aucune nouvelle route, aucune migration, aucun nouvel intent — réutilisation pure de day-summary, ventes-jour (agrégateurs partagés), credits-store (MODE-906), selling-points (MODE-908), notifications.
- Tests D'ABORD (rouge vérifié : 6 échecs / 3 verts sur l'extension day-summary ; module day-stats absent au premier run) puis implémentation : src/lib/voice/__tests__/day-summary.test.ts EXTENDU (+9, aucune assertion supprimée — diff +104/-0), src/lib/market-mode/__tests__/day-stats.test.ts NOUVEAU (14), src/lib/notifications/__tests__/credit-events.test.ts NOUVEAU (7 — garde non-régression sur les builders crédit livrés en 74-b, verts d'emblée par construction).
- Résumé enrichi (§23) : buildDaySummarySpeech(data, stockAlerts?) — 2e paramètre optionnel Array<{ name, level: 'low' | 'out' }> (type exporté DayStockAlert) ; la lib reste PURE (jamais de lecture store — le caller construit via getLowStockProducts). Phrases en FIN de dicté, épuisés d'abord, max 1 ligne par catégorie : « Attention : tomates est épuisé. » / « Attention : 2 produits sont épuisés : tomates et huile. » / « Attention : 1 produit est presque épuisé : riz. » / « Attention : N produits sont presque épuisés : a, b et c. » (liste max 3, « et » final) ; noms vides ignorés ; journée vide quand même alertée. ARBITRAGE DOCUMENTÉ : la limite globale de 12 lignes du détail reste RESPECTÉE — les lignes stock (≤ 2) consomment le budget du détail VENTES (« et N autres ventes » honnête, total réel complet toujours dicté) ; détail des DÉPENSES et totaux jamais amputés ; sans alertes = dicté STRICTEMENT inchangé (non-régression MODE-909 couverte).
- Branchement callers (audit d'abord) : un SEUL chemin de dicté du résumé existe — speakDaySummary de home-screen (tuile « Résumé du jour » + bouton « Écouter le détail des ventes » de la modale) → passe stockAlerts construits au moment du dicté via useStockStore.getState().getLowStockProducts() (level = stockQty <= 0 ? 'out' : 'low'). Décisions non-forçage documentées : le QuickAction « Résumé du jour » du market-mode-screen ouvre cette même modale (couvert par le même chemin) ; l'intent consultation du voice-modal garde sa réponse COURTE (buildDayTotalText, contrat VOCAL-607 — un « combien j'ai vendu ? » ne doit pas déclencher un dicté de 12 lignes) ; CloseDayModal ne dicte pas de résumé.
- Carte « Ma journée en chiffres » (§25) dans market-mode-screen (sous la grille de métriques « Aujourd'hui ») : Ventes du jour (nb), Chiffre d'affaires (formatFCFA), Comparé à hier « En hausse de X % » / « En baisse de X % » (TrendingUp/TrendingDown, SI DISPONIBLE seulement), Crédits en cours (totalOutstandingCfa du credits-store MODE-906), « N point(s) de vente actif(s) » (au-delà de la Boutique seule déjà visible sur la carte point de vente). NOUVEAU module PUR src/lib/market-mode/day-stats.ts : buildDayStats (écrêtage entiers, variation null si hier inconnu/nul), yesterdayRevenueFromServerSales (route ventes existante, annulées exclues MODE-909, via buildVentesSummary), yesterdayRevenueFromSession (repli LOCAL : session marché clôturée HIER persistée), yesterdayUtcRange (dayRangeUtc/todayDateStr/shiftDateStr — même définition du jour que le BO). Offline-first : rendu immédiat depuis les sources locales (agrégats caisse, crédits, points, session), raffinement collectTodaySales + fetch hier en tâche de fond — JAMAIS bloquant, JAMAIS d'erreur affichée, absence de données = zéro/variation absente honnête ; dérivations useMemo HORS sélecteurs zustand (INCIDENT-006 respecté : sélecteurs → données, dérivation via getState dans useMemo à dépendances).
- Alertes (§26) : constat — stock (notifyStockLevel), crédit (catégorie 'credit' + builders), sync (syncQueued/syncCompleted) EXISTAIENT déjà : rien réinventé. (a) décision MODE-906 VÉRIFIÉE et DOCUMENTÉE : 'credit' a un libellé mais reste hors NOTIFICATION_CATEGORIES (périmètre affichable figé à 12 par preferences.test.ts) — préférence non réglable = « on » par défaut (effectiveCategoryPref), décision NON forcée et désormais figée par test. (b) builders crédit désormais couverts (creditRecordedInput/repaymentReceivedInput : catégorie, titres « Crédit enregistré »/« Paiement enregistré »/« Dette soldée », montants FCFA U+202F, actionRoute 'credits', aucun emoji).
- Doc : docs/MARKET_MODE.md nouveau §8sexies (résumé enrichi + carte stats + alertes + hors périmètre), §2 (day-stats dans les pures partagées), §10 (1126/1126 — 76 fichiers + détail MODE-910), §11 registre ; .ai/PLAN_MARKET_MODE.md MODE-910 → livré Task 74-f ; rapport agent-ctx/74-f-mode-910.md.
- Gates FINALES : vitest 1126/1126 (76 fichiers — baseline 1096/1096 + 30 nouveaux, 1 fichier étendu + 2 nouveaux, zéro assertion existante modifiée) · tsc 0 · eslint 0. dev.log consulté : sain, aucune erreur liée.

Stage Summary:
- Le résumé du jour dit maintenant ce qui va manquer demain (épuisés d'abord, presque épuisés ensuite) sans jamais dépasser les 12 lignes, la carte « Ma journée en chiffres » donne ventes/CA/variation/crédits/points de vente depuis les sources locales avec raffinement silencieux — l'offline reste une valeur honnête, jamais une erreur ; les alertes crédit/stock/sync étaient vivantes et sont désormais gardées par des tests.
- Hors périmètre v1 documenté : graphe par heure à l'écran marché (revenueByHour prêt côté agrégateur), export, relances crédit planifiées (pattern futur = scheduler tontine), smoke Android (MODE-912, appareil requis).
- NE COMMIT PAS / NE PUSH PAS (consigne).

---
Task ID: 74 (synthèse orchestrateur — 74a + 74b..74f)
Agent: Super Z (principal) + agents full-stack délégués (74b..74f, revue/gates/commit orchestrateur)
Task: « Enchaîne tout le reste » — unification de TOUTES les écoutes + Mode Marché complet (MODE-906..910)

Work Log:
- 74a : audit exhaustif des surfaces d'écoute (2 agents lecture seule + vérifications) → 5 correctifs — TOUTES les écoutes (marchand, producteur, auth PIN/téléphone, indicateur partagé) partagent la signature #D2622A + halo ring-4 + pulse, zéro spinner (f160a37)
- 74b MODE-906 crédits : délégation full-stack (1er appel timeout → incrément partiel récupéré et complété par reprise) ; revue orchestrateur (RPC, refus store, intents, branchement voix) ; vitest 956/956 (454353b)
- 74c MODE-907 fournisseurs : même pattern reprise (timeout → incrément audité, 1 erreur de décompte corrigée) ; annuaire + « chez Koné » vocal + résolution route ; 992/992 (e77e944)
- 74d MODE-908 points de vente : store local-first + vente étiquetée par arguments sens unique + écran ; 1031/1031 (6762618)
- 74e MODE-909 annulation : reprise (timeout → RPC déjà complète ; ventes-screen complété, 5 erreurs typecheck corrigées) ; 1096/1096 (db6029c)
- 74f MODE-910 résumé enrichi + carte stats + alertes : lib pure + agrégateurs réutilisés ; 1126/1126 (d99c80a)
- 2 commits utilisateur parallèles absorbés par rebase sans conflit (fe9ec7b doc comptes ; d84d6bb audio Android)
- Registres synchronisés (TASKS.md tableau + synthèse Task 74, CHANGELOG session Tasks 72-74) ; xlsx non régénéré cette session (script absent du dépôt — à régénérer au prochain passage)

Stage Summary:
- Le cahier « Mode Marché » est COMPLET côté code : MODE-901..911 tous livrés — crédit clients (dette jamais négative, local d'abord), fournisseurs, points de vente, annulation non destructive, stats/alertes enrichis ; +208 tests (918 → 1126) ; offline-first et idempotence respectés partout ; l'offline n'est jamais une erreur.
- Restes : MODE-912 smoke Android 16 étapes (appareil requis — avec l'utilisateur), bun run supabase:push (6 migrations) + test:rls, paiements fournisseurs (sémantique signes), réconciliation serveur→local des annuaires, régénération TASKS.xlsx.

---
Task ID: 76 (complément — re-synchronisé après reset sandbox)
Agent: Super Z (principal)
Task: ui(marche) — accueil Mode Marché refondu selon la maquette utilisateur (commit 4fbe98b, réalisé avant reset, entrée recréée ici)

Stage Summary:
- market-mode-screen.tsx réécrit selon la maquette : bandeau d'état (horloge/batterie réelle), carte jaune « Vente sans internet » + badge « N à envoyer », carte point de vente (initiales + étal + marché) avec pastille langue, ACTION VOCALE PRINCIPALE « Dites votre vente à Tata » (grand bouton PARLER #D2622A + 3 exemples « Essayer » → openVoiceModal), dernière action enregistrée (journal caisse), tuiles argent en caisse / produits bientôt épuisés. Gates 1126/1126 · tsc 0 · eslint 0. Livré et poussé AVANT le reset (4fbe98b).

---
Task ID: 77
Agent: Super Z (principal)
Task: feat(voix) — intégration du Dioula (dyu_Latn), même logique que le Baoulé

Work Log:
- Codes confirmés via API HF : dyu_Latn (NLLB/FLORES-200) ; facebook/mms-tts-dyu existe en PyTorch mais SANS port ONNX exploitable par la pile → narration dyu = française signalée explicitement (1x/session), écoute + traduction complètes
- L'Omnilingual ASR (1 600 langues) couvre déjà le dioula : extension de CODE, pas de nouveau modèle. Un seul téléchargement NLLB (≈ 872 Mo) sert bci↔fra ET dyu↔fra
- Chaîne étendue : nllb-translation (dyu_Latn + garde B2-022 généralisée), voice-language-store ('dyu'), voice-service (DIOULA_NOT_READY_MESSAGE + DIOULA_CONTINUOUS_UNAVAILABLE_MESSAGE + routage web/natif), stt-factory (normalizeVoiceLanguage dyu* + routes single-shot/continu), baoule-engine (createBaouleTranscriptionSession({ lang }) + translateDioulaToFrench), conversation (resolveConversationInput dyu + narrateResponse dyu → français), tata-tts (notifyDioulaNarrationLimitOnce)
- VoiceServicePlugin.java : initialize/transcribe acceptent 'dyu' sur le MÊME moteur omnilingual (idempotence bci↔dyu sans rechargement, transcribeOmni paramétré par langue, statusObject dyu)
- UI : VoiceLanguageSelector (Français / Baoulé β / Dioula β), voix-settings (libellés), market-mode-screen + market-mode-store (Dioula disponible), bci-voice-card (NB dioula documenté)
- 12 nouveaux tests (dioula-integration.test.ts) ; conversation.test.ts typage élargi ('fr'|'bci'|'dyu')

Stage Summary:
- Gates : vitest 1138/1138 (77 fichiers) · tsc 0 · eslint 0 ; commit 330d13b poussé origin/main (PAT neuf fourni par le propriétaire, credential store local hors dépôt)
- Limites honnêtes documentées : pas de voix TTS dyu (pas de port ONNX) — narration française signalée ; écoute continue dyu refusée (push-to-talk uniquement, comme bci)

---
Task ID: 82
Agent: Super Z (principal)
Task: MODE-914 — voix dioula opt-in (recherche Task 81 validée : « la qualité me convient, enchaîne l'intégration complète »)

Work Log:
- Recherche (Task 81, hors dépôt) : facebook/mms-tts-dyu PyTorch sans port ONNX officiel ; port transformers.js PRODUIT (optimum-cli, torch 2.5.1 — 2.14 casse l'export VITS) et PROUVÉ (2 WAV 16 kHz, RMS ≈ 4000, échantillons validés) ; licence CC-BY-NC-4.0
- Hébergement : GitHub Release voix-dyu-mms-v1 (114 221 861 octets, sha256 dac02270…) ; GitHub SANS CORS (vérifié curl deux sauts) ; Supabase Storage refusé (413 > 50 Mo plan gratuit) → route proxy STREAMING /api/voix/dyu-model (same-origin, Content-Length transmis, RAM constante : 230 Mo après un envoi 114 Mo, sha256 servi = sha256 source)
- mms-tts.ts généralisé DEUX voix (config par voix, état par voix) : bci strictement inchangé (contrats tests préservés : 6 fetches, clés onnx-community/mms-tts-aka-ONNX, mmsBciSpeak/normalizeBciText) + dyu : petits fichiers EMBARQUÉS (mms-dyu-assets.ts : config/vocab/tokenizer_config/special_tokens/added_tokens), tokenizer.json généré — le Replace insère le pad avant chaque caractère = entrelacement add_blank des VITS MMS (qualité Python reproduite), normalizeDyuText (vocab 32 symboles SANS chiffres → pauses ; ŋ ɔ ɛ ɲ préservées), clés de cache HF VIRTUELLES julaba-voices/mms-tts-dyu-onnx (404 bruyant plutôt que poids divergents), poids via /api/voix/dyu-model
- tata-tts.ts : chemin dyu SYMÉTRIQUE du chemin bci (texte BRUT → mmsDyuSpeak ; voix non installée/échec → signal 1×/session + chaîne française) ; unlockTataAudio débloque MMS pour bci OU dyu
- conversation.ts : narrateResponse dyu = translateToDyu (NLLB fra→dyu, même modèle 872 Mo) → tataSpeak texte dioula BRUT ; échec traduction → tataSpeakWeb + translationError (jamais de français dans la voix dyu) ; SpokenReply.spokenIn étendu 'dyu' + dyuText
- UI : dyu-voice-card.tsx (carte « Voix dioula (bêta) » ~114 Mo : progression, erreurs, suppression) ; voix-settings.tsx (notices dyu dynamiques installée/non, test conscient de l'installation via isMmsDyuVoiceReady au clic) ; test-phrase.ts (VOICE_TEST_PHRASE_DYU = « I ni ce ! N ye Tata ye. An bɛ se ka baara kɛ. » + VOICE_TEST_PHRASE_DYU_FALLBACK français) ; bci-voice-card NB dioula actualisé
- Tests : +24 (normalizeDyuText, download dyu 1 fetch/7 clés, mmsDyuSpeak gardes + nominal, remove dyu, tataSpeak chemin dyu 5, narrateResponse dyu 3, test-phrase réécrit 5, dioula-integration 2 mis au nouveau contrat)
- Validation : vitest 1166/1166 (78 fichiers) · tsc 0 · eslint 0 · build OK (route ƒ /api/voix/dyu-model) · proxy E2E : 114 Mo servis 15 s, sha256 identique · preview live 200

Stage Summary:
- La voix dioula RÉELLE (facebook/mms-tts-dyu) est intégrée en opt-in : carte ~114 Mo dans Voix & Langue, « Tester la voix » prononce du dioula quand elle est installée, les réponses de conversation sont traduites fra→dyu (NLLB) et narrées hors ligne ; l'honnêteté de repli est conservée (voix absente = français expliqué 1×/session)
- Restes : smoke voix dyu sur appareil (MODE-912/B5-052) ; décision licence production dyu (équivalent B3-033/034) ; NLLB (872 Mo) toujours sans carte de téléchargement UI — requise pour les réponses dioula, à offrir à l'utilisateur en réglages

---

## Task 83/84 (2026-09-20) — vérification NLLB + traduction baoulé réelle (B2-023)

**Consigne utilisateur** : « Passons l'implémentation du Bété » sur la foi d'un tableau externe (Qwen) — vérification factuelle demandée puis validée : « valides A+B, j'enchaîne directement » (A = honnêteté immédiate, B = port du finetune baoulé).

### Task 83 — vérification + P0 baoulé découvert
- Preuves téléchargées/inspectées (tokenizer facebook 17,3 Mo + Xenova + carte modèle + FLORES-200 + papier Omnilingual table A1) : NLLB-200 = 202 codes exacts — `dyu_Latn` ✓, **`bci_Latn` ✗ ABSENT** (l'hypothèse fondatrice du dépôt était fausse), `bte_Latn`/`ksy_Latn` ✗. Omnilingual ASR couvre bci/dyu mais pas bte. MMS-TTS : aucune voix bété (bte/btg/btj/bqv vides).
- P0 : la chaîne vocale baoulé échouait à chaque phrase à la traduction (« Source language code "bci_Latn" is not valid », transformers.js tokenizers.js:3347) — tests verts car loader mocké, smoke réel jamais exécuté.
- Commit `203d641` (A) : registre NLLB_MODELS vérifié, readiness/download par langue, messages français honnêtes, reclassification de l'erreur brute, notice baoulé + pied de page corrigés. Rebasing sur `14a9193` (commit utilisateur parallèle).

### Task 84 — port ONNX du finetune baoulé (option B)
- Modèle : `GaindeNdiaye/nllb-baoule-v1` (2ADT Consulting) — NLLB-600M + token `bci_Latn` (id 256204) init `aka_Latn`, ~143k paires bibliques + quotidien baoule.ci ×10, CC-BY-NC-4.0, chrF++ quotidien 18,2 (bci→fr) / 10,4 (fr→bci). Sonde qualité bf16 AVANT portage (gate) : nombres 5/5 fra→bci, « n'tɔn tomate gua nu » structuralement correct — utilisable domaine étroit, bêta assumée.
- Contournements sandbox (OOM kernel ~2,5 Go, 137 répétés) : parts bf16 (encoder/decoder/shared), squelettes ONNX sans poids (`export_params=False` — params en inputs nommés), injection streaming + quantisation int8 par tranches, chaînes `DynamicQuantizeLinear + MatMulInteger` (zéro DQ d'initialiseur : ORT repliait 3,7 Go en fp32 au chargement), If-merge au gabarit Xenova (branches sans initializers propres, dédoublonnage lm_head≡embed par empreinte sha256), tri topologique Kahn, tokenizer patché v2 (merges listes→chaînes, `add_prefix_space` ajouté — Metaspace v2 ignore `prepend_scheme` seul).
- Bugs de conversion corrigés par bissection numérique (embed puis add puis LN puis q/k/v puis MMI int32, chaque étape comparée à torch) : dims perdues bf16→fp32 (tenseurs aplatis), ordre topologique, alias Identity, **collision de clés FICHIERS encodeur/décodeur** (le dict écrasait les poids encodeur par le décodeur — cause du premier « un homme, une femme »).
- Résultats runtime (onnxruntime-node, cross-process encodeur→hidden.json→décodeur) : « kun ñun nsan nnan nnun » → « un trois quatre cinq » ; « Mo » → « Merci » ; « Je vends des tomates au marché » → « n'tɔn tomate gua nu » (identique bf16) ; « Le prix est deux cents francs » → « À tà dà n'su ». fra→bci nombres partiels (2/5) — faiblesse connue du finetune.
- Hébergement : GitHub Release `nllb-baoule-v1` (8 assets, 893 Mo, sha256 vérifiés) + proxy same-origin `/api/voix/nllb-baoule-v1/resolve/main/[...path]` (params Promise Next 15).
- Intégration : registre NLLB_MODELS + `NLLB_BCI_MODEL_ID`/`NLLB_BCI_MODEL_SIZE_MB` (893 Mo), cartes `NllbModelCard` (baoulé bêta qualité limitée / dioula 872 Mo — la carte NLLB manquante depuis MODE-914), notices à jour, baoule-engine orienté 'bci'.
- Gates : vitest **1171/1171 (78 fichiers)** · tsc 0 · eslint 0 · build OK.
- Restes : smoke appareil (B5-052 — charge 2 sessions NLLB sur téléphone), validation native des traductions (bêta), décision licence production (CC-BY-NC).

---

## Task 85 (2026-09-20) — MODE-915 : « le test de voix ne fonctionne pas » — diagnostic complet + légende du test

Agent : Super Z (principal)

Contexte : remontée terrain « le test dans Langue de la voix ne fonctionne pas, la voix
baoulé et dioula ne fonctionnent pas ». Sandbox réinitialisé (3e fois) au passage :
repo re-cloné (akoun-dev/julaba, HEAD d2157d0 retrouvé intact), preview reconstruite.

Work Log:
- DIAGNOSTIC EN VRAI (navigateur headless, parcours complet intro → 0701020304 →
  PIN 1234 → profil → Voix & Langue) : les DEUX chaînes fonctionnent sur le build courant —
  voix dioula téléchargée via proxy (114 221 861 octets, ~15 s) puis phrase dioula réelle
  synthétisée MMS ONNX (« Écoute… » → « Tata vous parle ! ») ; voix baoulé pilote
  téléchargée depuis HF (114 Mo) puis synthèse MMS OK ; zéro erreur console.
- Cause racine de la PERCEPTION « ne fonctionne pas » : l'écran ne disait ni quelle voix
  allait parler (avant le test) ni laquelle avait parlé (après) ; la readiness était figée
  au montage (notice « à installer » persistante après installation — et l'inverse si le
  navigateur avait évicté la voix : l'utilisateur entendait le repli français SANS savoir pourquoi).
- Correctif MODE-915 (honnêteté, jamais de repli silencieux) :
  • spoken-chain.ts (nouveau) : notifySpokenChain/getLastSpokenChain — chaque moteur se
    déclare au moment où il S'ENGAGE à parler (mms-tts : uniquement après synthèse réussie,
    avant lecture ; tata-tts : webspeech/native/kokoro/piper) ;
  • test-phrase.ts : getVoiceTestCaption(lang, 'avant'|'lecture'|'succes', readiness,
    spokenChain) — légende écrite véridique (pointe vers la carte d'installation quand
    la voix manque ; au succès, la chaîne RÉELLE fait foi : « Lu avec la voix dioula
    (hors ligne) » vs « Lu avec la voix française : la voix dioula n'a pas pu être utilisée ») ;
  • voix-settings.tsx : readiness dyu+bcd sondée au montage PUIS toutes les 4 s (fin des
    notices figées), légende data-testid=voice-test-caption sous le bouton de test,
    re-sonde au clic.
- Vérifications navigateur post-correctif (build prod) : cycle complet dyu capturé
  (« Lecture en cours… » → « Lu avec la voix dioula (hors ligne). » → retour avant) ;
  bci sans voix → « Voix baoulé pilote non installée dans ce navigateur : le test sera
  dit en français. Installe la voix pilote ci-dessous (~114 Mo). » basculé à chaud (<4 s)
  après suppression de la voix.
- Gates : vitest 1179/1179 (79 fichiers, +13) · tsc 0 · eslint 0 · build OK.

Stage Summary:
- MODE-915 TERMINÉ. Les chaînes bci/dyu étaient fonctionnelles ; c'est l'EXPLICabilité qui
  manquait. Restes inchangés : smoke appareil (B5-052/MODE-912), décision licence CC-BY-NC,
  validation native des traductions.

---

## Task 86 (2026-09-20) — MODE-916 : « des échantillons de voix pour valider ; pour le baoulé, elle parle français ; 893 Mo téléchargés mais rien »

Work Log:
- PUSH débloqué : PAT GitHub fourni → MODE-915 (3412385) poussé sur origin/main
  (d2157d0..3412385). L'APK de test de l'utilisateur ne contenait ni les légendes MODE-915
  ni le push — l'APK doit être reconstruit depuis origin/main.
- Diagnostic complet de la remontée terrain (3 causes distinctes) :
  1) les 893 Mo = carte TRADUCTION baoulé (NLLB_BCI_MODEL_SIZE_MB, finetune
     GaindeNdiaye porté ONNX q8 : encoder 418 + décodeur 475) — elle sert à COMPRENDRE
     et répondre en baoulé, elle ne fait PAS parler Tata ; la VOIX = carte « Voix baoulé
     pilote » séparée (~114 Mo, donor akan) ;
  2) même voix pilote installée, la phrase de test bci était la phrase historique
     FRANÇAISE lue par la voix pilote (régime MODE-913 assumé) → l'utilisateur entendait
     du français et concluait « elle parle français / ça ne marche pas » ;
  3) la sonde bci au clic du test n'était pas attendue (isMmsBciVoiceReady().then()
     non awaité) → la phrase pouvait être décidée sur un état périmé.
- ÉCHANTILLONS DE VOIX (demande explicite) : 8 WAV 16 kHz générés au sandbox avec les
  MÊMES modèles que l'app — tokenizer.json générés par la même fonction
  buildMmsTokenizerJson, mêmes normalisateurs bci/dyu, poids identiques (release
  GitHub voix-dyu-mms-v1 + HF onnx-community/mms-tts-aka-ONNX) :
  • 4 échantillons voix dioula RÉELLE (phrase de test de l'app + 3 segments) ;
  • 4 échantillons voix baoulé pilote lisant des textes baoulé produits par le
    finetune nllb-baoule-v1 (traductions fra→bci de phrases de marché).
  Livraison : download/voix-echantillons/ (LISEZMOI.txt + manifeste-echantillons.json).
- PREMIÈRE PREUVE de la chaîne baoulé via tokenizer transformers.js (B2-023 n'avait
  validé qu'onnxruntime brut) : le pipeline v2 complet OOM-kille le sandbox (2,9 Go
  RSS — la v2 n'expose aucune session option, arène ORT non désactivable) → boucle de
  génération ORT directe CONFORME à la v2 écrite (past_key_values longueur nulle
  [1,16,0,64] × 12 couches, use_cache_branch bool, réutilisation du cache ENCODER du
  pas précédent, forced BOS au 1er pas, EOS=2, max 128 tokens) + tokenizer transformers.js
  (NllbTokenizer, bci_Latn id 256204 spécial vérifié). Vitesse : 0,4–0,7 s/phrase q8.
- Traductions obtenues (qualité bêta assumée, chrF++ finetune 10,4 fr→bci) :
  « Bonjour ! Je suis Tata Nanti Lou. » → « Yo! N ti Baba Nanti Lou. » ;
  « Tu m'entends bien ? » → « A ti min nuan? » ; « Le kilo de tomates coûte mille
  francs. » → « Tomate kilo kun ti frank akpi. » ; « J'ai vendu trois sacs de riz
  aujourd'hui. » → « Ndɛkɛn n yoli nzue ba nsan atɛ. » ; « Combien coûte ce panier de
  gombo ? » → « ?Oka basket nga ti ônga? » ; aller-retour bci→fra OK (« Je suis le
  père de Lou » — Baba=père : le modèle retraduit le nom, corrigé dans la phrase produit).
- Correctif MODE-916 (test-phrase.ts + voix-settings.tsx + tests) :
  • VOICE_TEST_PHRASE_BCI = « Yo! N ti Tata Nanti Lou. A ti min nuan? » (traduction
    du finetune, nom propre TATA conservé — décision produit documentée) ;
  • VOICE_TEST_PHRASE_BCI_FALLBACK (explication française symétrique dyu : nomme la
    langue, l'écoute qui marche, la réponse française, la voix à installer) ;
  • getVoiceTestPhrase : régime bci = régime dyu — voix installée → phrase en baoulé
    lue par la voix pilote ; absente → explication française. La phrase historique
    française ne parle PLUS jamais en session baoulé (fr strictement inchangée) ;
  • légendes bci mises à jour (« Le test dira la phrase en baoulé… » / « le test
    s'expliquera en français ») ;
  • voix-settings.tsx : sonde bci AWAITED au clic, notices bci différenciées
    « ENTENDRE (voix pilote ~114 Mo) ≠ COMPRENDRE (traduction ~893 Mo) », description
    de la carte Traduction baoulé corrigée (« Cette carte ne fait PAS parler Tata »).
- Gates : vitest 1181/1181 (79 fichiers, +2) · tsc 0 · eslint 0.

Stage Summary:
- MODE-916 TERMINÉ : en session baoulé, le test de voix dit maintenant UNE phrase
  baoulé (avec la voix pilote) ou s'explique honnêtement en français (sans elle) —
  fin de la confusion « elle parle français ».
- Échantillons livrés pour validation produit (dioula réel + baoulé pilote avec textes
  du finetune) — la voix baoulé reste un donor akan « qualité limitée » assumé.
- Restes : écoute des échantillons par le produit, reconstruction de l'APK (push fait),
  smoke appareil B5-052/MODE-912, décision licence CC-BY-NC, validation native.

---

Task ID: 87
Agent: Super Z (principal)
Task: MODE-917 — « Améliore encore la voix Dioula et Baoulé » : qualité d'écoute mesurée

Work Log:
- Périmètre établi sur constats objectifs (sortie VITS brute mesurée au sandbox) :
  silence de tête/queue ~0,3-0,6 s par phrase ; niveau inconstant (crêtes 0,76-0,78
  selon la phrase) ; ponctuation filtrée par la whitelist du tokenizer → aucune
  vraie pause entre phrases ; `rate` des voix MMS IGNORÉ silencieusement ; les
  chiffres MUETS en dioula (vocab sans chiffres : « 5000 » → trou silencieux) et
  mutilés en baoulé (vocab sans 0-1/4-9 — seuls « 2 » et « 3 »).
- Contrainte vérifiée : les graphs ONNX dyu/bci n'exposent que input_ids/
  attention_mask (aucune entrée de durée) → pas de vitesse VITS possible ; le
  pipeline transformers.js v2 n'accepte aucun kwarg rate — rate module désormais
  les PAUSES (jamais de playbackRate qui décalerait la tonalité).
- audio-postprocess.ts (pur, 18 tests) : trimSilence (seuil adaptatif relatif à la
  crête, marge 50 ms), normalizePeak (cible 0,85, gain plafonné ×8, réduction si
  trop fort), applyFades (12/30 ms anti-clic), concatWithPauses (220 ms),
  buildSpokenUtterance (segments muets rejetés), splitSpeechSegments (ponctuation
  forte, décimales préservées, segments sans lettres rejetés).
- spoken-numbers.ts (pur, 17 tests dont conformité vocab) : numérales JULA
  sourcées et croisées (coastsystems Dyula : kelen/fila/saba/naani/looru/wɔɔrɔ/
  woronfila/seegi/kɔnɔtɔ/tan ; omniglot : mugan 20, bi X dizaines, waa 1000 ;
  thèse HAL : kɛmɛ 100) jusqu'à 999 999 999 ; BAOULÉ 1-10 sourcées (omniglot +
  baoule.ci + desmotsetdeslangues ; 8 = mɔsuɛ, « c » absent du vocab akan) ;
  centaines/milliers baoulé NON SOURCÉES → non converties (on n'invente pas) ;
  runs > 7 chiffres (téléphones) jamais convertis.
- mms-tts.ts : speakWithMms réécrite — synthèse PAR PHRASE (découpage →
  chiffres→mots → normalisation → synthèse par segment), post-traitement,
  assemblage avec pauses modulées par rate ; contrat tout-ou-rien conservé
  (moindre segment en échec → false → repli français, jamais de narration
  partielle) ; sortie VITS muette désormais = échec (jamais jouée muette) ;
  en-tête MODE-917 documenté.
- PREUVE RÉELLE (modèles du sandbox, script scripts/mode917-preuve.mjs, modules
  TS réels importés par Node 24 — zéro dérive) : 8 WAV A/B dans
  download/voix-echantillons/mode917/ + mesures.json. Mesures : silence de tête
  0,344 → 0,052 s (dyu), 0,295 → 0,052 s (bci) ; crête 0,758-0,783 → 0,85
  homogène ; « An bɛ sara 5000 F ye » : AVANT « An bɛ sara F ye » (trou),
  APRÈS « waa looru » énoncé ; « 3 kilo de riz » → « nsan kilo de riz ».
- Gates : vitest 1222/1222 (80 fichiers, +41) · tsc 0 · eslint 0 · build OK.

Stage Summary:
- MODE-917 TERMINÉ : rythme naturel (pauses réelles), Tata ~0,3 s plus réactif,
  niveau sonore homogène et remonté, prix/quantités énoncés dans les deux
  langues, rate utile (pauses). Checkpoints inchangés (timbre : pilote akan
  « qualité limitée » et MMS dyu réels), contrats de repli inchangés.
- Échantillons A/B prêts pour validation produit (LISEZMOI.txt inclus).
- Restes : écoute des A/B par le produit, reconstruction APK, smoke appareil
  B5-052/MODE-912, décision licence CC-BY-NC, validation native (numérales
  jula/baoulé comprises des locuteurs), bci ≥ 11 non converti (pas de source).

---
Task ID: 88
Agent: Super Z (principal)
Task: MODE-918 — « Passons à l'intégration du Bété » : verdict factuel à neuf + sonde HF inédite + docs/LANGUES.md

Work Log:
- Sandbox à nouveau réinitialisé (4e fois) au démarrage : /home/z/julaba absent, preuves
  verify-nllb/ perdues. Dépôt identifié via PAT (API GitHub /user → akoun-dev, PAT VALIDE)
  puis re-cloné (public, HEAD 4d7b162 = MODE-917 poussé). PAT jamais écrit dans un fichier
  (clone sans credential, push one-shot).
- Re-vérification factuelle à neuf (preuves régénérées) : tokenizer.json officiel
  facebook/nllb-200-distilled-600M re-téléchargé (17,3 Mo, vocab 256 204) — 202 codes
  langue EXACTS (regex ^[a-z]{3}_[A-Z][a-z]{3}$) ; sur les 4 codes du tableau externe
  (Qwen) re-collé par l'utilisateur : dyu_Latn SEUL PRÉSENT ; bci_Latn, bte_Latn,
  ksy_Latn ABSENTS (spp_Latn aussi absent). ksy (ISO 639-3) = Khisa (langue gur
  Ghana/Bénin) — PAS le sénoufo.
- SONDE HF INÉDITE (jamais faite) : API Hugging Face models+datasets, requêtes
  « bete », « Bété », « bte_Latn » → ZÉRO modèle/dataset bété pertinent (aucun finetune
  NLLB, aucun Whisper, aucun corpus public) ; facebook/mms-tts-bte/btg/btj/bqv
  inexistantes ; facebook/mms-tts-spp (Supyire, sénoufo Mali/Burkina) EXISTE mais sans
  modèle de traduction et variété non ivoirienne.
- Ressource utilisateur enregistrée : blog desmotsetdeslangues.eklablog.com
  « BETE » (récupéré via proxy interne — DNS direct bloqué) : langue kru, centre-ouest
  CI, alphabet complet (ɛ ɔ ɩ ʋ gb kp bh ny…), mini-lexique thématique → appoint
  lexical pour un FUTUR corpus, pas un jeu d'entraînement.
- Livraison : docs/LANGUES.md (nouveau) — matrice fr/bci/dyu (ASR/MT/TTS), correction
  du tableau faux (3 codes sur 4), verdict Bété/Sénoufo NON INTÉGRABLES aujourd'hui
  (problème de données, pas de code), voie Bété en 5 étapes (corpus ~143k paires →
  finetune bte_Latn → port ONNX q8 recette Task 84 → voix donor → registre
  NLLB_MODELS), ressources enregistrées. L'UI actuelle n'offre que fr/bci/dyu —
  aucune entrée Bété à activer.
- Registres : .ai/TASKS.md (+MODE-918), .ai/CHANGELOG.md (Task 88), worklog ci-présent.

Stage Summary:
- Bété/Sénoufo : dossier factuellement clos une seconde fois, avec cette fois la
  preuve qu'AUCUN artefact bété n'existe sur HF (la voie baoulé — finetune — est
  reproductible mais exige d'abord un corpus qui n'existe pas publiquement).
- docs/LANGUES.md devient la référence anti-régression pour toute nouvelle demande
  de langue.
- Restes inchangés : écoute des échantillons A/B (MODE-916/917), reconstruction APK,
  smoke appareil B5-052/MODE-912, décision licence CC-BY-NC, validation native.

---
Task ID: 89
Agent: Super Z (principal)
Task: MODE-919 — « Audit interface marchand + intégration voix (tout correctement branché ?) »

Work Log:
- Méthode : 2 agents d'inventaire statique en parallèle (27 composants marchand ;
  28 modules voix) avec vérification programmatique des imports + tsc global ;
  lecture ciblée des zones à risque ; smoke E2E navigateur sur build production
  (NODE_OPTIONS 2000, pm2 ecosystem — preview live 200).
- E2E réel : intro → « Passer l'introduction » → 0701020304 → Continuer → PIN 1234
  → accueil Awa → Mode Marché (session déjà active, Synchroniser disabled offline)
  → Voix & Langue (3 radios + 4 cartes + notices exactes) → test voix :
  sans voix système (headless) l'erreur honnête « Aucune voix installée… » s'affiche ;
  légendes bci/dyu réactives vérifiées en live (polling 400 ms :
  « Voix baoulé pilote non installée… test s'expliquera en français » / dyu idem) ;
  MES PRODUITS OK ; ZÉRO erreur page sur tout le parcours.
- 3 BUGS RÉELS découverts dans la chaîne voix, corrigés :
  V1 nllb-translation.ts — isModelCached « au moins un fichier » = prêt → sonde
  STRICTE (config+tokenizer+encoder q8+decoder_merged q8, mêmes gabarits d'URL
  que le chargement) : fin des cartes « installée » sur téléchargement partiel
  et du re-téléchargement silencieux en pleine conversation (+2 tests) ;
  V2 mms-tts.ts — putInCache avalait les échecs cache.put (quota) → le
  téléchargement vérifie la persistance RÉELLE avant true, sinon false → erreur
  honnête de la carte (+1 test quota) ;
  V3 tata-tts.ts — tataSpeakWeb : notice bci-only potentiellement fausse
  (« voix pilote non disponible » quand c'était la traduction) et RIEN en dyu →
  notice honnête unique 1×/session selon la langue (« traduction ou voix X
  n'a pas pu être utilisée »), silencieuse en fr.
- Tests adaptés : nllb-translation.test.ts (helper cacheModeleComplet, mock
  Cache API fidèle string|Request, nouveau contrat sonde stricte) ;
  mms-tts.test.ts (+test quota) ; mock match string-compatible.
- Rapport complet : .ai/AUDITS/AUDIT-002-2026-09-20-marchand-voix.md —
  verdict branchement CONFORME + 7 recommandations (écrans voix-seuls
  tontines/keiwa/fidélité/protection-sociale, réception fournisseur non câblée,
  code mort home-screen/app-store/route register, deleteProduct hors doctrine
  offline, tailles en dur, routes sans consommateur, diagnostics voix non exposés).
- Registres : .ai/TASKS.md (+MODE-919), .ai/CHANGELOG.md, worklog ci-présent.
- Gates : vitest 1224/1224 (81 fichiers, +2) · tsc 0 · eslint 0 · build OK.

Stage Summary:
- L'audit confirme le branchement complet (statique + runtime) ; les 3 bugs voix
  découverts sont corrigés et couverts par tests. Recommandations UX/dette
  listées pour arbitrage produit (aucune correction imposée).
- Restes inchangés : écoute des échantillons A/B, reconstruction APK,
  smoke appareil B5-052/MODE-912, décision licence CC-BY-NC, validation native.
- FUSION (rebase) : pendant l'audit, 2 commits utilisateur parallèles sont arrivés
  sur origin/main (e6170a2 centralisation réglages/diagnostics + voice-config,
  52badec préchauffage modèles + cache des traductions) — touchant les mêmes
  fichiers. Conflit unique tata-tts.ts résolu (clamp centralisé conservé + notice
  honnête conservée). Le warmup distant s'appuie sur les sondes : la sonde
  stricte V1 le rend plus sûr (aucun chargement sur cache partiel).
  CORRECTIF AU PASSAGE : le test « rate 0,75 → pause 293 ms » d'e6170a2 était
  rouge dès l'origine (attendu 4680 échantillons = 292,5 ms au lieu de 4688 =
  293 ms produits par le code, conformes au nom du test) — arithmétique corrigée.
  Gates revalidés APRÈS fusion : vitest 1224/1224 · tsc 0 · eslint 0.

## Task 90 — 2026-09-20 — MODE-920 : correction intégrale de l'audit UI marchand+producteur (32 constats)

Demande : « Regarde cette audit corrige tout et ne t'arrete pas sans avoir
finir » — rapport d'audit UI externe (32 constats UI-MP-001→032 : 1 P0,
8 P1, 13 P2, 10 P3) + écarts de processus.

Work Log:
- P0 honnêteté d'état (UI-MP-001/014 + famille, 8 SITES) : tout refus 4xx
  définitif retombait dans la file offline puis était annoncé « en attente
  de synchronisation » — rejeu voué à l'échec, contredit à l'oral. Patron
  canonique caisse-screen appliqué partout : 408/429/5xx → file ; autre
  4xx → parlé + haptic('error') + JAMAIS en file. Sites : transferts
  (envoi/réception/annulation), stock-screen, voice-modal (dépense,
  mouvement, commande fournisseur), dépenses-screen, tontines.
- UI-MP-002/024 : « FCFA FCFA » supprimé (6 sites dont un AFFICHÉ) ;
  phrases parlées sur formatMontantParle() ; imports formatFCFA →
  @/lib/utils dans les composants.
- UI-MP-007 : playBeep('success')+haptic('success') retiraient la tête de
  executeIntent (signal « c'est bon » AVANT le verdict) → helpers
  signalSuccess/signalPending/signalError émis aux ~25 points terminaux
  réels ; lecture d'info = haptic('light') ; navigation = bip succès.
- UI-MP-003 : 15 modales migrées vers Radix Sheet/Dialog (caisse prix/
  panier/paiement/succès, close-day, vente-rapide, open-caisse, modales
  voix marchand+producteur, credits ×2, points-vente ×2, home ×2,
  fournisseurs, transferts ×2) — rôle dialog, aria-modal, piège de focus,
  Échap, restitution du focus.
- UI-MP-017/020a : close-day-modal réécrite (Dialog, croix Fermer,
  Confirmer→Compter ma caisse, Valider→Enregistrer le fond de caisse,
  OK→Fermer, pauseWakeWord/resumeWakeWord — plus de modale voix empilée
  pendant la clôture).
- UI-MP-032 : VoiceListeningIndicator retiré des modales (un seul overlay) ;
  conservé pour auth ; fond tokenisé --voice-indicator-bg ; bouton stop
  déjà 44px.
- UI-MP-019 : role="status" aria-live="polite" sur les états des 4 modales
  vocales + DialogTitle sr-only.
- UI-MP-004 : announceProducteurAction() (nouveau src/lib/voice/
  producteur-actions.ts) — accepter/refuser commande, livraison, récolte,
  carnet annoncés + vibrés.
- UI-MP-016 : « Accepter/Refuser la commande » (Verbe+Objet) + AlertDialog
  de confirmation nommant l'acheteur et la conséquence.
- UI-MP-006/029 : aria-label sur la validation d'action rapide (dérivé de
  l'action et du produit) et déplacement du nom du bouton Modifier sur le
  Button.
- UI-MP-005 : h-9 w-9 → h-11 w-11 (~35 boutons, 15 fichiers) + boutons
  +/- du panier h-8 → h-11 + input prix panier h-11 avec aria-label.
  Exceptions décoratives conservées (icône Mic market-mode, container auth).
- UI-MP-008 : soleil = marchand OU producteur dans page.tsx ; application
  non gardée de IdentScreenRouter supprimée (fin de la double implémentation).
- UI-MP-009 : soleil couvert sur transferts, vente-rapide (bump texte,
  surface sombre assumée), onboarding, market-mode, prod-bottom-bar (FAB
  et labels grossissent).
- UI-MP-010 : pastilles dépenses en bg-*-100/text-*-800 (≥4,5:1), indigo
  supprimé, bleu → teal, `color` en teintes 700 pour accents.
- UI-MP-011/012/013 : variables CSS --vl-marchand*/--vl-prod*/--prod-dark/
  --prod-dim/--voice-indicator-bg dans globals.css ; constantes
  VOICE_LISTENING_COLOR(_PROD) dans design-tokens.ts ; 22 littéraux
  #D2622A remplacés ; modale vocale producteur en VERT ; import mort
  PROD_COLOR (prod-stock) supprimé et teintes tokenisées ; doublon
  MARCHAND_COLOR (home-screen) supprimé.
- UI-MP-015 : décision produit — réglage « Thème : sombre » retiré de
  l'UI et classe dark plus appliquée (un réglage qui ment est pire qu'un
  réglage absent) ; chantier DET-UI-015 ouvert.
- UI-MP-018/025 : safe-area sur market-mode (pt/pb max()) et prod-recoltes
  pb-40 → jeton commun.
- UI-MP-021/022 : voice-amount-input énonce formatMontantParle + role=alert ;
  keiwa sur fetchJsonWithTimeout (2 appels) + role=alert solde insuffisant.
- UI-MP-023/027/028/030/031 : chart ventes duration-200 ease-out (la classe
  était saine — l'audit citait un artefact d'affichage), libellés ≥12 px,
  « TRANSFERTS » → « Transferts », squelettes transferts, libellé d'action
  keiwa stable + aria-busy (spinner interdit respecté).
- UI-MP-026 : gate global @custom-variant hover (@media hover:hover) en
  Tailwind v4.
- Référentiel : surfaces-producteur.md CRÉÉ ; AGENTS.md (Applies to + File
  Organization) et surfaces.md (4 surfaces) mis à jour ; surfaces-marchand.md
  amendé (signaux au verdict, surface sombre des modales vocales assumée).
- Registres : TASKS.md (+MODE-920), CHANGELOG.md (Task 90), TEAM_STATUS.md
  (baseline resynchronisée 1224/1224/81 fichiers — était 901/901),
  PROJECT_CONTEXT.md (2 chiffres resynchronisés), DEBT_REPORT.md
  (DET-005 à jour + DET-UI-015).
- Fausse piste écartée : les greps « erchantPhone/erchantId » matchaient
  l'intérieur de [merchantPhone]/[merchantId] — aucun fichier corrompu
  (vérifié rg échappé + Read + tsc).

Stage Summary:
- 32/32 constats traités + cause racine (référentiel producteur) fermée.
- Gates finaux : vitest 1224/1224 (81 fichiers) · tsc 0 · eslint 0 ·
  build prod OK.
- Décisions produit tranchées et documentées : soleil étendu au producteur,
  modales vocales restent sombres, réglage sombre retiré, 4xx = définitif
  (liste blanche transitoire 408/429/5xx).
- Restes inchangés : smoke appareil B5-052/B1-010/B3-032, reconstruction
  APK, décision licence CC-BY-NC, conversion sombre (DET-UI-015).

## Task 95 — MODE-922 : parité coopérative (audit complet + correctif P0), 21/09/2026

- Audit 2 agents (backend + frontend) de l'implémentation MODE-921 vs inventaire julaba-app : constat majeur = migration 20260920100000 cassée (index sur colonne `actif` inexistante → 42703 ; remote = tables sans colonne, runtime `.eq('actif', true)` en échec), `/liste` sans garde, UI recherche téléphone absente, notifications marchand absentes, distribution non liée au besoin, marchand sans accès stock commun.
- Correctif : migration idempotente `20260921000000` (actif + backfill + trigger dérivé + index unique partiel uniq_coop_membre_actif + FK besoin_id) ; migration originelle corrigée pour resets frais ; routes membres (409 anti-course, notifications), liste gardée, store (chargerAnnuaire(merchantId)), écrans (ajout par téléphone, stock commun marchand + retour, distribution liée besoinId→livre, voir-tout).
- Tests : pgTAP supabase/tests/cooperative.sql (58 checks) ; +3 vitest. Gates : 1251/1251 · tsc 0 · eslint 0.
- Dette : DET-COOP-001..005 (claim sans secret P1, marché coopératif MODE-923, trésorerie déclarative, idempotence note, nbMembres).
- Push : commit MODE-922 sur origin/main (PAT one-shot, jamais persisté).

## Task 96 — MODE-930 : onboarding, étape littératie vocale (micro auto + guidage adapté), 21/09/2026

- Demande produit : ajouter une étape d'onboarding déterminant si la personne
  sait lire et écrire, micro activé AUTOMATIQUEMENT, réponse vocale parmi
  « Oui / Non / Un peu », puis logique de guidage adaptée vers l'étape suivante.
- Implémentation :
  - Étape `litteratie` insérée en 3e position (après « Tout à la voix ») dans
    onboarding-screen.tsx (variante compacte, icône BookOpen, narration dédiée
    annonçant que le micro va s'allumer tout seul).
  - Composant `src/components/marchand/litteratie-step.tsx` : armement auto du
    micro à la FIN de la narration (détection true→false de la prop
    narrationEnCours — jamais d'écoute pendant que Tata parle ; armement
    600 ms si voix coupée/bloquée), bouton d'écoute #D2622A + ring-4 +
    animate-pulse (pattern contractuel, zéro spinner), 3 boutons tactiles
    Oui/Un peu/Non (repli permanent ≥48 px), garde-fou silence 15 s, bouton
    « Réessayer le micro », transcript non compris affiché tel quel, session
    STT abortée au démontage (aucun micro fantôme), role=status + aria-live.
  - Module pur `src/lib/litteratie.ts` : parseLitteratieReponse
    (normalisation NFD tons + apostrophes, variantes orales FR + interjections
    baoulé pilotes ɛhɛ/ao héritées de confirmations.ts ; « un peu » testé
    AVANT oui/non — réponse mixte = guidage le plus aidant ; trigramme
    « pas du tout » ; JAMAIS de reconnaissance implicite → null) et
    guidanceLitteratie (oui = parcours standard · un_peu/non = Mode Soleil
    activé + guidage vocal assuré · non = bouton « Activer la voix de Tata »
    proposé si la voix était coupée — jamais de bascule forcée).
  - app-store : `litteratieNiveau` ('oui'|'un_peu'|'non'|null, null = jamais
    demandé) + setLitteratieNiveau, ajouté au partialize persist.
  - Le guidage parlé coupe l'écoute AVANT de parler (tataStop → tataSpeakWeb,
    délai 350 ms pour laisser passer le beep de succès) ; la voix n'est jamais
    forcée : le bouton dédié laisse l'utilisateur décider.
- Tests : src/lib/__tests__/litteratie.test.ts — 34 tests (normalisation,
  priorité un_peu, bigrammes/trigrammes, baoulé pilote, réponses inconnues
  null, guidage des 3 niveaux + orientation « Appuyez sur Suivant »).
- Gates : vitest 1288/1288 (86 fichiers) · tsc 0 · eslint 0.
- Registres : TASKS.md (+MODE-930), CHANGELOG.md (Task 96).

## Task 98 — MODE-931 : littératie branchée + audits complétude + corrections coopérative/producteur, 21/09/2026

- 3 agents Explore en parallèle (97-C1 backend coopérative, 97-C2 frontend
  coopérative, 97-B1 producteur) à HEAD 03c7aee vs inventaire julaba-app
  (restauré depuis git 27358c8 vers /home/z/my-project/tmp — le fichier avait
  été retiré du dépôt par le commit doc a6d6301 de l'utilisateur).
- Constats clés : P0 unique = président en 403 sur apport/distribution/livraison
  (garde marchand vs sujet cooperateur) ; P1 = score JULABA absent (transverse),
  cloche coop-home, « Notifier un membre » ; producteur = stock/cycles/
  réputation sans API, seed démo, sync non parlée, 44px, fallback producteur-1.
- Corrections implémentées (voir CHANGELOG Task 98) :
  - Chantier A : rateLitteratie + aideVocaleLitteratie (module pur), dictée
    assistée (home-screen dicté + announceProducteurAction), ProdAideLitteratie
    sur prod-home/prod-stock.
  - Chantier C : garde duale requireMembreActifOuPresident (resolver), routes
    stock POST/distribution POST duales, store coopérative (clé cooperateurId/
    merchantId selon rôle, INCIDENT-006 respecté), migration 20260921010000
    (drop FK membre_id des mouvements + RPC verbatim avec is not distinct
    from), notification stock_commun_recu, cloche + NotificationsPanel
    coop-home, autocomplétion besoins (datalist produits réels + unités).
  - Chantier B : API stock (dérivation récoltes disponibles, seuil 25 kg),
    migration 20260921020000 (legacy_producteur_cycles) + API cycles
    GET/POST + demarrerCycle + addJournalEntry parlant, verdicts sync parlés
    (lost/queued), getProducteurId nullable + refus explicite, 44px (9 sites),
    prix « indicatifs », FCFA/kg, affordances démo prod-auth retirées.
- Nouveaux tests : MODE-931 garde duale (2), rateLitteratie/aideVocale (7),
  deriveCycleCulture (5) = +14 → 1302/1302 (87 fichiers). tsc 0 · eslint 0.
- Incidents de session : corruption temporaire de marchand-coop-screen.tsx
  (ligne modalBesoin) pendant les éditions multi-partielles — réparée et
  vérifiée tsc/eslint/tests.
- Registres : TASKS.md (+MODE-931), CHANGELOG.md (Task 98), DEBT_REPORT
  (DET-COOP-006..011, DET-PROD-001..003).
- Migrations à déployer : 20260921010000 (président pot commun), 
  20260921020000 (cycles producteur) — pipeline de déploiement ou
  SUPABASE_ACCESS_TOKEN.

## Task 99 — MODE-932 : score JULABA transverse (DET-COOP-006), 21/09/2026

- Demande produit : « Attaque le score » — le P1 de l'audit 97-C (scoreJulaba
  absent du module coopérative, chantier transverse « score acteur » julaba-app).
- Conception : score DÉRIVÉ de signaux réels (legacy_sales, sessions de marché,
  cotisations validées, mouvements du pot commun, besoins, profils merchants) —
  aucune table d'état, aucun seed ; invariant julaba-app respecté (mêmes
  fonctions batchées pour GET membres et GET /scores/me, sans N+1).
- Livré :
  - `src/lib/scores/score-julaba.ts` (pur) : seuils 71/41, calculs marchand
    (ventes/journées/cotisation/apports/profil) et coopérateur
    (membres_count/besoins_traites/cotisations/pot commun), détail ligne à ligne.
  - `src/lib/scores/scores-service.ts` : scoresMarchandsBatch (4 requêtes pour
    toute la liste), scoreMarchand, scoreCooperateur (counts exacts).
  - `GET /api/scores/me` (session appareil, marchand OU coopérateur) ;
    GET /api/cooperatives/membres enrichi scoreJulaba par membre.
  - `src/components/ui/score-ring.tsx` (SVG pur, accessible) ; écran membres :
    anneau par membre + filtre performance (aria-pressed ≥ 44 px) ;
    « Ma coopérative » : carte « Mon score JULABA » sur /scores/me.
  - cooperative-store : MembreCoop.scoreJulaba (null = jamais inventé).
- Tests : +16 (score-julaba.test.ts) — bornes, paliers, plafonds, somme détail.
- Gates : vitest 1318/1318 (88 fichiers) · tsc 0 · eslint 0.
- Registres : TASKS.md (+MODE-932), CHANGELOG.md (Task 99), DEBT_REPORT
  (DET-COOP-006 marqué traité).

### Task 99 (suite) — verdict final de la vérification de complétude coopérative

Re-vérification clé par clé (grep ciblés) après MODE-931 + MODE-932 :
- Tables : 7 (cooperatives, membres, stock, mouvements, transactions, besoins
  + colonne actif/trigger) — parité, users flag côté session claim.
- Endpoints : 25 handlers sous /api/cooperatives (cardinalité = julaba-app)
  + /api/scores/me (MODE-932).
- Invariants vérifiés : création 409 anti-course · rejoindre en_attente ·
  membres CRUD + search-marchand?phone (normalisation 225) · trésorerie
  GET/POST/PATCH requirePresident (président exclusif) · besoins agrégation +
  consolider · apport RPC transactionnel FOR UPDATE (20260920100100) ·
  idempotence « is not distinct from » (20260921010000) · distribution
  multi-destinataires refusant le dépassement (« Stock commun insuffisant ») ·
  notifications post-commit · cotisation 25 000 FCFA · pgTAP cooperative.sql.
- Verdict : module coopératif COMPLET au périmètre v1. Le dernier P1
  (score JULABA) est fermé par MODE-932. Restent des dettes documentées et
  assumées (DEBT_REPORT) : DET-COOP-001 (claim sans secret, P1), 002
  (marché coopératif → MODE-923), 003..005, 007..011, DET-PROD-001..003.
