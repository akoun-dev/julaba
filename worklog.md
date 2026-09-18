# Jùlaba Project Worklog

---
Task ID: 1
Agent: Main Orchestrator
Task: Implement Identificateur module — complete field agent identification & enrollment system

Work Log:
- Extended `app-store.ts` with `UserRole` type (`'marchand' | 'identificateur'`), 11 new Identificateur screen routes, `userRole`/`setUserRole` state, role-aware `setAuth`, `goBack`, `logout`, and `onRehydrateStorage`
- Added brown `#9F8170` "Identificateur" button (top-right) on Marchand auth screen → navigates to `ident-auth`
- Created `identificateur-store.ts` with full Dossier schema (actor types, GPS, documents, dynamic fields per type), agent zone/mission management, screen sensitivity toggle, and constants (ZONES, ACTIVITES, PRODUITS)
- Created `ident-auth-screen.tsx` — simplified PIN-only auth for field agents (no voice/pattern/visual), with registration and login flows, demo account (05 55 55 55 55 / 0000)
- Created `ident-bottom-bar.tsx` — 5-tab nav (Akèy, Aktè, Sivi, Tata désactivé, Mwa) with `#9F8170` active color
- Created `ident-home-screen.tsx` — agent dashboard with greeting, search, counters (Brouyon/Atann/Validé/Rejeté), territory KPIs, monthly mission progress bar, quick access links, screen sensitivity alert
- Created `ident-identification-screen.tsx` (45KB) — dynamic 9-section form: photo capture, actor type selector (Marchand/Producteur/Coopérative), mandatory fields, complementary info, type-specific dynamic fields, GPS geolocation, notes, document attachments, auto-save every 30s, draft/submit actions
- Created `ident-suivi-screen.tsx` — dossier tracking grouped by status (En attente/Validés/Rejetés) with search, filters, action buttons (Korijé/Siprimé for rejected)
- Created `ident-brouillons-screen.tsx` — drafts management with completion progress, 3 actions (Reprendre/Soumettre/Supprimer with AlertDialog), sort toggle, empty state
- Created `ident-acteurs-screen.tsx` — actors list with photo thumbnails, type/status filters, phone masking (screen sensitivity), quick stats section
- Created `ident-statistiques-screen.tsx` — period tabs, KPI grid, type distribution bars, 7-day bar chart, zone breakdown
- Created `ident-rapports-screen.tsx` — 3 report types (journalier/hebdomadaire/mensuel) with generated summaries and export/share buttons
- Created `ident-dashboard-screen.tsx` — advanced KPIs, performance vs objective, daily pace calculation, mock rankings, top zones chart
- Created `ident-profil-screen.tsx` — agent profile, settings (soleil mode, screen sensitivity), security section, red logout button
- Updated `page.tsx` with IdentScreenRouter, role-based bottom bar switching, Identificateur screen routing
- Fixed bugs: default export → named export (identification screen), login PIN numpad stale closure (stepRef + pinRef), handleLogin using stale `pin` state → `pinRef.current`, logout routing to correct auth screen per role

Stage Summary:
- 11 new Identificateur component files created in `src/components/identificateur/`
- 1 new store file: `src/lib/stores/identificateur-store.ts`
- 3 core files modified: `app-store.ts`, `page.tsx`, `auth-screen.tsx`
- Full auth flow verified: Marchand auth → Identificateur button → Ident auth (register/login) → Home → Logout → Ident auth
- All screens in Ivorian phonetic French
- Zero lint errors, clean compilation
---
Task ID: 2
Agent: Main Orchestrator
Task: Correct phonetic/creole French text to standard French in 3 identificateur files

Work Log:
- Read all 3 target files: ident-identification-screen.tsx (1021 lines), ident-bottom-bar.tsx (99 lines), ident-home-screen.tsx (382 lines)
- Made ~90+ precise Edit operations across ident-identification-screen.tsx:
  - Step labels (Fotò & Idantite → Photo & Identité, Detay Aktè → Détails Acteur, etc.)
  - Section titles (FOTÒ AKTÈ → PHOTO ACTEUR, ENFÒMASYON OBLIGATWA → INFORMATIONS OBLIGATOIRES, etc.)
  - All labels (Prenon → Prénom, Telefòn → Téléphone, Sèks → Sexe, etc.)
  - All placeholders (Prenon aktè a → Prénom de l'acteur, Chwazi aktivite → Choisir une activité, etc.)
  - All toast messages (Erè → Erreur, Kòd pa konfòm → Codes non conformes, etc.)
  - Button texts (Pran foto → Prendre photo, Précédan → Précédent, Suivan → Suivant, etc.)
  - Actor type/sex/commerce/production label records (Machan → Marchand, Maskilen → Masculin, etc.)
  - Auth step copy (KONFIGIRASYON OTORIZASYON → CONFIGURATION AUTORISATION, etc.)
- Made 4 Edit operations in ident-bottom-bar.tsx (Akèy → Accueil, Aktè → Acteurs, Sivi → Suivi, Mwa → Moi)
- Made 7 Edit operations in ident-home-screen.tsx (Brouyon → Brouillon, Atann → En attente, etc.)
- Ran ripgrep verification across all 3 files — only 2 remaining matches are code comments, no user-facing creole text remains
- Lint passes with zero errors

Stage Summary:
- 3 files corrected: ident-identification-screen.tsx, ident-bottom-bar.tsx, ident-home-screen.tsx
- ~100+ individual text replacements from Ivorian creole/phonetic French to standard French
- All user-facing strings now in standard French; code comments intentionally left unchanged
- Zero lint errors, clean compilation
---
Task ID: 1
Agent: main
Task: Convert identificateur identification form to step-based wizard with auth setup

Work Log:
- Read and analyzed existing project structure (SPA with Zustand, client-side routing)
- Read existing ident-identification-screen.tsx (1240 lines, single scrollable form)
- Read identificateur-store.ts (Dossier type, Zustand persist store)
- Read pattern-lock.tsx and visual-code-grid.tsx (auth components to reuse)
- Confirmed Identificateur button already exists on auth-screen.tsx
- Added pinHash, patternHash, visualCodeHash fields to Dossier interface in store
- Added optional `color` prop to PatternLock component for identificateur theming
- Completely rewrote ident-identification-screen.tsx as 4-step wizard:
  - Step 1: Photo + Actor Type + Required Info (photo, type, name, phone, activity, zone)
  - Step 2: Complementary Info + Dynamic Actor-Specific Fields (marchand/producteur/cooperative)
  - Step 3: GPS + Notes + Documents
  - Step 4: Authentication Setup (PIN code, Pattern/Schema, Visual/Image code)
- Reused PatternLock and VisualCodeGrid components for auth step
- Step validation: Step 1 validates required fields, Step 3 validates GPS, Step 4 requires at least 1 auth method
- Clean lint, successful compilation

Stage Summary:
- identificateur-store.ts: Added 3 auth hash fields to Dossier
- pattern-lock.tsx: Added `color` prop for theming flexibility
- ident-identification-screen.tsx: Complete rewrite from 1240-line single form to ~560-line stepper wizard
- All 3 auth methods (PIN, Pattern, Visual Code) functional in final step
- Step progress indicator with clickable completed steps

## French Text Corrections - Identificateur Screens

Corrected all phonetic/creole French text to standard French in 4 identificateur screen files:

### ident-statistiques-screen.tsx (11 corrections)
- Machan → Marchand, Prodiktè → Producteur, Kopérativ → Coopérative
- Total idantifikasyon → Total identifications
- Taux de validasyon → Taux de validation, Tan moysn → Temps moyen
- Taux de reje → Taux de rejet
- STATISTIK → STATISTIQUES
- Repartisyon pa tip → Répartition par type
- Evolisyon tanporèl → Évolution temporelle
- Repartisyon pa zon → Répartition par zone

### ident-rapports-screen.tsx (13 corrections)
- Machan → Marchand, Prodiktè → Producteur, Kopérativ → Coopérative
- Brouyon → Brouillon, Atann → En attente
- Rapò jounalyè → Rapport journalier, Rapò hebdomadayè → Rapport hebdomadaire, Rapò mensyèl → Rapport mensuel
- RAPÒ → RAPPORTS
- Total dossiè → Total dossiers, Nouvo aktè → Nouveaux acteurs
- Lis dossiè → Liste des dossiers, Partajè → Partager

### ident-dashboard-screen.tsx (16 corrections)
- Brouyon → Brouillon, Atann → En attente
- Total idantifiyé → Total identifiés, Objèktif mensyèl → Objectif mensuel
- Taux validasyon → Taux de validation, Aujourdhui → "Aujourd'hui"
- DASHBÒD → TABLEAU DE BORD, Vu djénéral → Vue générale
- Pèfòmans vs objèktif → Performance vs objectif, Progrè mensyèl → Progrès mensuel
- Jou restan → Jours restants, Ritm nésésèr → Rythme nécessaire
- Dènyè aktivité → Dernière activité, Klasman → Classement
- Konèksyon → Connexion, Top zon → Top zones

### ident-profil-screen.tsx (15 corrections)
- Zon → Zone, Maché → Marché, Memb depuis → Membre depuis
- PARAMÈT → PARAMÈTRES, Mod Soleil → Mode Soleil
- Ekrans ensitiv → Écran sensible, Affectasyon zon → Affectation zone
- Objèktif mensyèl → Objectif mensuel, SEKIRITE → SÉCURITÉ
- Chanj mon kod PIN → Changer mon code PIN
- Verouyaj otomatik → Verrouillage automatique
- Kapti ecran bloké → Capture écran bloquée
- A PROPO → À PROPOS, Vèsyon → Version, DEKONEKSYON → DÉCONNEXION

---
Task ID: 2
Agent: main
Task: Corriger tout le texte phonétique/créole en français standard dans les 10 fichiers identificateur

Work Log:
- Scanned all 10 identificateur files for phonetic text
- ident-auth-screen.tsx: Already in standard French, no changes needed
- ident-identification-screen.tsx: ~90+ corrections (step labels, form labels, placeholders, toast messages, button texts, auth step labels, record labels)
- ident-home-screen.tsx: 7 corrections (Brouyon→Brouillon, Atann→En attente, Statistik→Statistiques, Rapò→Rapports, aktè→acteur)
- ident-bottom-bar.tsx: 8 corrections (Akèy→Accueil, Aktè→Acteurs, Sivi→Suivi, Mwa→Moi, Désaktivé→Désactivé + comments)
- ident-suivi-screen.tsx: 8 corrections (actor labels, header, search, empty states, buttons, function names)
- ident-brouillons-screen.tsx: 10 corrections (header, search, empty states, toast, dialog, button labels)
- ident-acteurs-screen.tsx: 15 corrections (actor labels, header, search, counters, empty state, buttons, stat cards, function names)
- ident-statistiques-screen.tsx: 11 corrections (actor labels, KPI labels, section headings)
- ident-rapports-screen.tsx: 13 corrections (actor labels, status labels, report titles, stats, button)
- ident-dashboard-screen.tsx: 16 corrections (status labels, KPI labels, heading, section titles)
- ident-profil-screen.tsx: 15 corrections (info row labels, section headings, settings, buttons)

Stage Summary:
- All user-facing text across 10 identificateur files converted from Ivorian phonetic to standard French
- Lint passes clean, compilation successful
- Browser verification confirms all bottom bar labels, counters, and navigation text are in French
---
Task ID: 1
Agent: main
Task: Remove search zone, Accès rapides section, and convert Nouveau dossier to floating button on ident-home

Work Log:
- Read ident-home-screen.tsx to understand current layout
- Removed the search bar zone (was a fake search div that navigated to identification)
- Removed the "Nouveau dossier" card section
- Removed the "⚡ Accès rapides" section with its quickAccess array
- Added a floating action button (FAB) with Plus icon, colored #9F8170
- Cleaned up unused imports (Search, ChevronRight, BarChart3, FileText, Input, goBack)
- Removed unused quickAccess array and smallTextClass variable
- Fixed FAB positioning: initially at bottom-6 but was covered by bottom nav bar (h-16, z-50)
- Moved FAB to bottom-20 with z-[60] to sit above the nav bar
- Changed content mb-4 to mb-24 on Alerte sécurité card for proper spacing
- Verified with agent-browser: search bar removed, Accès rapides removed, FAB works and navigates correctly
- Verified FAB click navigates to ident-identification screen (4-step wizard)

Stage Summary:
- File modified: src/components/identificateur/ident-home-screen.tsx
- Search zone: REMOVED
- Accès rapides section: REMOVED  
- Nouveau dossier: Now a floating action button (FAB) in bottom-right, above bottom nav bar
- FAB click handler: setCurrentDraftId(null); navigate("ident-identification") - WORKING

---
Task ID: 2
Agent: main
Task: Fix FAB button - identification screen shows loader then redirects back to home

Work Log:
- Identified root cause: init dossier was done in useEffect (async), if merchantId/merchantName werent ready at effect time, dossier stayed null
- The 2-second safety redirect (setTimeout → navigate(ident-home)) would then fire, sending user back
- Fix: replaced async useEffect init with synchronous useState lazy initializer
- Lazy initializer creates dossier immediately during first render when merchantId && merchantName are available
- Kept a fallback useEffect only for the draft-resume case (currentDraftId) where dossiers array might load later
- Removed the 2-second safety redirect entirely (no more auto-redirect to home)
- isNew is also initialized via lazy initializer
- Tested: FAB click → identification screen appears immediately (no spinner), stays after 5s
- Tested: Retour → home, FAB click again → works again

Stage Summary:
- File modified: src/components/identificateur/ident-identification-screen.tsx
- Key change: useState lazy initializer replaces useEffect for dossier creation
- Safety redirect (2s timeout) removed
- FAB button now works reliably - no more loader-then-redirect issue

---
Task ID: 3
Agent: main
Task: Add confirmation modals for connection and account deletion

Work Log:
- Read ident-auth-screen.tsx to understand login/register flow
- Read ident-profil-screen.tsx to understand profile layout
- Verified AlertDialog component exists in shadcn/ui
- Added connection confirmation modal to ident-auth-screen:
  - handleRegister: saves agent data, then shows modal "Compte créé !" before calling setAuth
  - handleLogin: validates PIN, then shows modal "Bienvenue !" before calling setAuth
  - Added confirmConnection() function that calls setAuth with pending data
  - Cancel button resets PIN and goes back to login-pin step
  - Modal uses CheckCircle2 icon with IDENT_COLOR theme
- Added to ident-profil-screen:
  - Changed DéCONNEXION button to outline style, now triggers logout confirmation modal
  - Added SUPPRIMER MON COMPTE button with red outline style
  - Logout modal: "Se déconnecter ?" with info text, Annuler/Se déconnecter buttons
  - Delete modal: "Supprimer le compte ?" with irreversible warning, Annuler/Supprimer buttons
  - handleDeleteAccount: clears agent localStorage, clears identificateur store, calls logout

Stage Summary:
- Files modified: ident-auth-screen.tsx, ident-profil-screen.tsx
- Connection: modal with "Compte créé !" (register) or "Bienvenue !" (login) + Annuler/Confirmer
- Logout: modal with "Se déconnecter ?" + Annuler/Se déconnecter
- Delete account: modal with "Supprimer le compte ?" (irréversible) + Annuler/Supprimer
- All 3 modals tested and verified via agent-browser

---
Task ID: 4
Agent: main
Task: Develop all MON PROFIL features

Work Log:
- Read and analyzed all existing files: ident-profil-screen.tsx, identificateur-store.ts, ident-auth-screen.tsx, shadcn UI components (sheet, select, radio-group, collapsible, input, label)
- Updated identificateur-store.ts:
  - Added `autoLockMinutes: number` (default 15) and `setAutoLockMinutes` action
  - Added `screenshotBlocked: boolean` (default true) and `toggleScreenshotBlocked` action
  - Added both to `partialize` for persistence
- Completely rewrote ident-profil-screen.tsx with all 7 features inline:
  1. **Changer mon code PIN** — Bottom Sheet with 3-step numpad flow (current/new/confirm PIN), step indicator, PIN dots with #9F8170 color, validation against localStorage hash, error handling, success toast
  2. **Verrouillage automatique** — Bottom Sheet with RadioGroup (5min/10min/15min/30min/Désactivé), styled radio labels, save button, persisted in store
  3. **Affectation zone** — Bottom Sheet with shadcn Select (ZONES array) for zone, Input for marché name, Enregistrer button, updates store on save
  4. **Objectif mensuel** — Bottom Sheet with stepper (+/- buttons, range 10-9999), quick-select buttons (100/200/300/500/750/1000), Enregistrer button
  5. **Capture écran bloquée** — Replaced static "Activé" text with Switch toggle, persisted in store
  6. **Academy** — Bottom Sheet with 4 tutorial cards (emoji icons, titles, French descriptions covering identification, photography, drafts, best practices)
  7. **Support** — Bottom Sheet with contact info (phone, email), 4 FAQ items using Collapsible/CollapsibleTrigger/CollapsibleContent with ChevronDown rotation
- Copied `simpleHash`, `normalizePhone`, `loadAgent`, `saveAgent` helpers into the file
- Created `PinDots` and `PinNumpad` helper components for the PIN change flow
- Created `FaqItem` component to avoid React hooks violation (useState inside map)
- Kept existing logout and delete account AlertDialogs intact
- Removed unused imports (navigate, X, smallTextClass)
- Fixed JSX comment blocks (removed Unicode box-drawing characters that caused parsing error)
- All text in French, all styling uses #9F8170 theme color
- Lint passes with zero new errors (2 pre-existing errors in other files remain)

Stage Summary:
- Files modified: identificateur-store.ts, ident-profil-screen.tsx
- 7 features implemented, all inline (no new routes or files)
- 6 bottom Sheets (PIN, auto-lock, zone, target, academy, support) + 1 inline Switch toggle (screenshot)
- Store: 2 new persisted fields (autoLockMinutes, screenshotBlocked)
- Zero new lint errors, clean compilation

---
Task ID: 4
Agent: main
Task: Develop all MON PROFIL features

Work Log:
- Read ident-profil-screen.tsx (396 lines) and identificateur-store.ts to understand current stubs
- Identified 7 features to develop: PIN change, auto-lock, zone assignment, monthly target, screenshot block, academy, support
- Delegated implementation to full-stack-developer subagent
- Subagent added autoLockMinutes + screenshotBlocked to identificateur-store with persistence
- Subagent rewrote ident-profil-screen.tsx to 1005 lines with all features
- Verified lint: only 2 pre-existing errors (no new ones)
- Tested via agent-browser:
  - Affectation zone: Sheet with Select dropdown + marché input + Enregistrer ✓
  - Objectif mensuel: Sheet with +/- stepper + quick-select buttons (100-1000) ✓
  - Verrouillage automatique: Sheet with RadioGroup (5/10/15/30 min + Désactivé) ✓
  - Changer PIN: Sheet with 3-step numpad (current PIN → new → confirm) ✓
  - Capture écran bloquée: Now a toggle Switch ✓
  - Academy: Sheet with 4 tutorial cards (identification, photo, brouillons, pratiques) ✓
  - Support: Sheet with contact info + 4 collapsible FAQ items ✓
  - DÉCONNEXION and SUPPRIMER MON COMPTE: Modals still working ✓
- VLM visual verification confirmed clean layout

Stage Summary:
- identificateur-store.ts: Added autoLockMinutes (default 15), screenshotBlocked (default true), both persisted
- ident-profil-screen.tsx: All 7 features fully functional, 1005 lines
- All features use shadcn Sheet/Dialog/Select/RadioGroup/Collapsible
- No new routes created - everything inline in the profile screen


---
Task ID: 3
Agent: Main Orchestrator
Task: Build complete Jùlaba BackOffice admin interface (24 modules)

Work Log:
- Updated Prisma schema with 5 new BO models: BoUser, AuditLog, BoActor, BoZone, BoMission
- Extended app-store.ts with 'backoffice' UserRole, 24 BO screen routes, BO-aware navigation/auth/hydration
- Created backoffice-store.ts with: RBAC permission matrix (5 roles × 24 modules), 50 mock actors, 30 mock enrolments, 12 zones, 5 missions, 15 audit entries, 5 alerts, 7 demo BO users, ticker data, and all CRUD actions
- Created bo-auth-screen.tsx: 3-step login (credentials → MFA OTP → success), 5 demo accounts with quick-login, dark theme, security badges (TLS 1.3, AES-256, MFA)
- Created bo-layout.tsx: Desktop-first layout with dark sidebar (w-60/collapsible to w-16), header with search/notifications/user menu, status bar with system health indicators
- Created bo-screen-router.tsx: Switch routing for all 24 BO screens
- Created 24 module screens via parallel subagents:
  - bo-dashboard-screen.tsx: 7 KPIs, real-time ticker, recharts (BarChart + AreaChart), top 5 identificateurs, data quality circles, system health, quick access
  - bo-acteurs-screen.tsx: Full data table with search/filters/pagination, detail dialog, CSV export, bulk actions, counter bar
  - bo-enrolement-screen.tsx: Card-based validation queue, validate/reject/info-request flows, rejection reason dialog, filter tabs, stats bar
  - bo-utilisateurs-screen.tsx: BO user CRUD, visual RBAC permission matrix (5×10 grid), create/edit dialogs, role/status filters
  - bo-audit-screen.tsx: Audit journal with expandable rows, JSON detail view, multi-filter, CSV/PDF export, SHA-256 signature display
  - bo-zones-screen.tsx: Zone cards with progress bars, create dialog, detail with actor breakdown
  - bo-missions-screen.tsx: Mission cards with progress, create/assign/close flows, filter tabs
  - bo-supervision-screen.tsx: Alert list with severity, platform metrics, activity feed
  - bo-rapports-screen.tsx: 4 report types with previews, countdown schedules, export buttons
  - bo-institutions-screen.tsx: Institution cards, add dialog, sort/filter, sync buttons
  - bo-moderation-screen.tsx: Report cards with severity borders, resolve/suspend flows
  - bo-mutations-screen.tsx: Transfer requests with approve/reject, zone arrows
  - bo-contenus-screen.tsx: Tabs (Tutoriels/FAQ/Articles), dual view (card/table), CRUD
  - bo-monitoring-ia-screen.tsx: AI KPIs, recharts BarChart, model version, system resources
  - bo-events-screen.tsx: Real-time event log (3s interval), level filters, pause/resume, auto-scroll
  - bo-analytics-screen.tsx: DAU/MAU KPIs, 30-day LineChart, PieChart, retention funnel
  - bo-scores-screen.tsx: Financial scoring, histogram, risk-level table, search/filters
  - bo-api-keys-screen.tsx: Key management with mask/unmask, copy, revoke with AlertDialog
  - bo-marketplace-screen.tsx: 3-tab interface (Produits/Commandes/Vendeurs), stats
  - bo-livraison-screen.tsx: Delivery cards, status filters, map placeholder
  - bo-communication-screen.tsx: 3-channel compose (SMS/Push/Email), history table
  - bo-cron-screen.tsx: 9 cron jobs table, toggle/run-now, create dialog, stats
  - bo-config-institution-screen.tsx: 5 config sections with edit/save, Switch toggles
  - bo-keiwa-screen.tsx: Wallet KPIs, LineChart, transactions/accounts tabs
- Added BackOffice entry button on marchand auth screen (next to Identificateur button)
- Updated page.tsx with BO routing, layout wrapping, and BO-specific bottom bar handling
- Fixed InputOTP render prop incompatibility (switched from render prop to children with index)
- Fixed RBAC matrix: added super_admin to all 24 modules

Stage Summary:
- 30 new files created in src/components/backoffice/
- 1 new store: src/lib/stores/backoffice-store.ts
- 3 core files modified: app-store.ts, page.tsx, auth-screen.tsx
- 1 schema modified: prisma/schema.prisma
- All 24 modules functional with mock data, real interactivity, and professional UI
- 5 demo accounts for quick testing (super_admin → operateur_terrain)
- RBAC enforced: sidebar shows only modules accessible to the logged-in role
- Zero new lint errors
- Verified via Agent Browser: auth flow, MFA, dashboard, acteurs, enrolement, events all working
---
Task ID: 2-a, 2-b
Agent: Main
Task: Remplacer emojis par icônes Lucide + Ajouter système de thème light/dark

Work Log:
- Analysé le design fourni par l'utilisateur avec VLM (design admin moderne, clair, bleu/slate)
- Identifié 27 emojis dans 17 fichiers back-office
- Délégué le remplacement des emojis à un sous-agent (27 remplacements dans 17 fichiers)
- Ajouté ThemeProvider (next-themes) dans le root layout
- Ajouté boTheme + toggleBoTheme dans le backoffice store (persisté)
- Ajouté le bouton toggle thème (Sun/Moon) dans le header du layout BO
- Ajouté les classes dark: complètes au layout (sidebar, header, status bar, dropdown menus)
- Ajouté les classes dark: à l'écran d'authentification BO
- Ajouté les classes dark: au tableau de bord BO (KPIs, graphiques, system health, data quality, etc.)
- Corrigé les erreurs de syntaxe (double className=) introduites par le sous-agent
- Vérifié en navigateur: auth light/dark + dashboard light/dark + toggle fonctionnel

Stage Summary:
- 27 emojis remplacés par des icônes Lucide (Check, X, Star, TrendingUp, Shield, etc.)
- Système de thème light/dark fonctionnel avec persistance dans le store Zustand
- Toggle accessible depuis le header du backoffice (icône Moon/Sun)
- Layout, auth et dashboard entièrement adaptés aux deux thèmes
- Captures d'écran: bo-auth-light.png, bo-auth-dark-check.png, bo-dashboard-light.png, bo-dashboard-dark.png
---
Task ID: 4-b
Agent: theme-batch-2
Task: Add dark/light theme to 6 BO screen files (batch 2)

Work Log:
- Read bo-dashboard-screen.tsx as reference pattern (boTheme from store, isDark ternary, conditional classes)
- Read all 6 target files completely to identify all hardcoded color patterns
- bo-audit-screen.tsx (787 lines): Removed BO_COLOR import, Added boTheme/isDark to BoAuditScreen and ExpandedDetails sub-component, Replaced style={{ color: BO_COLOR }} with conditional classes, Replaced bg-gray-50/80/bg-white/bg-gray-100/text-gray-500/400/600/700/300 with isDark ternaries, Theme-aware table header bg, Card bg-slate-800 in dark
- bo-rapports-screen.tsx (427 lines): Removed BO_COLOR import, Added boTheme/isDark to BoRapportsScreen and ScheduledReportCard sub-component, Replaced style={{ color: BO_COLOR }} and style={{ backgroundColor: BO_COLOR }} with conditional classes, getStatusConfig now takes isDark param for badge colors
- bo-moderation-screen.tsx (516 lines): Removed BO_COLOR/BO_COLOR_BG imports, Added boTheme/isDark, Replaced outer container style={{ backgroundColor: BO_COLOR_BG }} with className, Moved SEVERITY_CONFIG inside component for isDark access, Replaced all text-gray-*/bg-gray-*/bg-red-50/bg-amber-50/bg-emerald-50 patterns
- bo-mutations-screen.tsx (552 lines): Removed BO_COLOR/BO_COLOR_BG imports, Added boTheme/isDark, Replaced outer container, zone chips, rejection box, stat cards, empty state, action buttons with theme-aware classes
- bo-contenus-screen.tsx (511 lines): Removed BO_COLOR/BO_COLOR_BG imports, Added boTheme/isDark, Themed stat cards, search icon, view mode toggle bg, card view items, table view, delete hover state, empty state
- bo-institutions-screen.tsx (528 lines): Removed BO_COLOR/BO_COLOR_BG imports, Added boTheme/isDark, Themed stat cards (with emerald/amber bg-50→bg-*-500/10), search icon, card grid, detail text, sync button, empty state
- Verified: no BO_COLOR/BO_COLOR_BG references remain in any of the 6 files
- Verified: lint passes with only pre-existing errors (page.tsx, ident-identification-screen.tsx)

Stage Summary:
- All 6 files themed successfully
- All BO_COLOR/BO_COLOR_BG imports removed from themed files
- Sub-components (ExpandedDetails, ScheduledReportCard) have their own boTheme/isDark
- Pattern matches dashboard reference exactly
- Zero new lint errors introduced

---
Task ID: 4-c
Agent: theme-batch-3
Task: Add dark/light theme to 5 BO screen files (batch 3)

Work Log:
- Read bo-dashboard-screen.tsx as reference pattern (boTheme from store, isDark ternary, conditional classes)
- Read all 5 target files completely to identify all hardcoded color patterns
- bo-analytics-screen.tsx (263 lines): Removed BO_COLOR/BO_COLOR_BG import, Added boTheme/isDark to BoAnalyticsScreen, Replaced outer container style={{ backgroundColor: BO_COLOR_BG }} with className, Replaced style={{ color: BO_COLOR }} with conditional classes, Themed KPI cards (icon bg, delta text, value text), Chart cards with dark-aware tooltip/grid/tick styles, Retention funnel bars (dark uses rgba slate-100), Pie chart legend text, Table cell text
- bo-scores-screen.tsx (299 lines): Removed BO_COLOR/BO_COLOR_BG import, Added boTheme/isDark to BoScoresScreen, Moved RISK_CONFIG inside component for isDark access (emerald/amber/red badge bg→bg-XXX-500/15 in dark), Replaced outer container, Summary stat cards, Distribution chart with dark tooltip/grid, Search icon color, Table cells (name, zone, score bar bg, recommendation, date), Empty state text
- bo-api-keys-screen.tsx (384 lines): Removed BO_COLOR/BO_COLOR_BG import, Added boTheme/isDark, Themed stat cards (total, active, requests), Created key banner (emerald bg→emerald-500/10 in dark), Search icon, Table cells (name, description, key mono, dates, status badges active→emerald-500/15, revoked→red-500/15, requests count, revoke hover→red-500/10), Empty state
- bo-monitoring-ia-screen.tsx (379 lines): Removed BO_COLOR/BO_COLOR_BG import, Added boTheme/isDark, Moved SEVERITY_COLOR inside component for isDark access (critique/haute/moyenne/basse with dark variants), Themed KPI cards (emerald-50→emerald-500/15, amber-50→amber-500/15, red-50→red-500/10, gray-100→slate-700), Active badge (emerald-500/15), Chart bars (Jeu highlight uses slate-100 in dark, D1D5DB→475569), Model info rows (all text-gray-500→slate-400, style color→text-slate-100), System resources (metric label, progress bg), Error table (resolved/active badges, row bg for unresolved), Tooltip/cursor dark variants
- bo-events-screen.tsx (281 lines): Removed BO_COLOR/BO_COLOR_BG import, Added boTheme/isDark, Moved LEVEL_CONFIG inside component for isDark access (INFO/WARN/ERROR/DEBUG badge bg→XXX-500/15 in dark, DEBUG border→slate-500), Themed level stat cards, Header live indicator (gray-400→slate-500 in dark), Filter checkbox border, Filter label text, Event list scrollbar color (D1D5DB→475569), Event rows (hover→slate-700, timestamp/source mono text→slate-500, message→slate-300), Empty state text
- Verified: no BO_COLOR/BO_COLOR_BG references remain in any of the 5 files
- Verified: lint passes with only pre-existing errors (page.tsx, ident-identification-screen.tsx)

Stage Summary:
- All 5 files themed successfully
- All BO_COLOR/BO_COLOR_BG imports removed from themed files
- SEVERITY_COLOR and LEVEL_CONFIG moved inside components for isDark access
- RISK_CONFIG moved inside component for isDark access
- Pattern matches dashboard reference exactly
- Zero new lint errors introduced

---
Task ID: 4-d
Agent: theme-batch-4
Task: Add dark/light theme to 6 BO screen files (batch 4)

Work Log:
- Read bo-dashboard-screen.tsx reference pattern for isDark theming
- Read all 6 target files completely
- bo-communication-screen.tsx: Added boTheme/isDark, moved CHANNEL_CONFIG/STATUS_CONFIG inside component, replaced all style={{ color: BO_COLOR }} / style={{ backgroundColor: BO_COLOR_BG }}, themed cards, text colors, badge colors, scrollbar, bg-gray-50, text-gray-500/600/700/400
- bo-cron-screen.tsx: Added boTheme/isDark, moved STATUS_CONFIG/RESULT_CONFIG inside component, replaced all BO_COLOR/BO_COLOR_BG style props, themed icon bg colors (emerald/sky/amber/red-100 → -500/15), text colors, cards, empty states
- bo-config-institution-screen.tsx: Added boTheme/isDark to main component and SectionHeader sub-component (via isDark prop), replaced all BO_COLOR/BO_COLOR_BG, themed icon colors in inputs, text-gray-500/700, cards, label colors
- bo-keiwa-screen.tsx: Added boTheme/isDark to main component and KeiwaTooltip sub-component (via isDark prop), moved TX_TYPE_CONFIG/TX_STATUS_CONFIG/ACCOUNT_TYPE_CONFIG inside component, themed chart (gridStroke/tickFill/dot stroke), cards, table text, scrollbar, badge colors
- bo-marketplace-screen.tsx: Added boTheme/isDark, moved PRODUCT_STATUS_CONFIG/ORDER_STATUS_CONFIG inside component, replaced all BO_COLOR/BO_COLOR_BG, themed product cards, order/seller tables, stat cards, search icons, filter text
- bo-livraison-screen.tsx: Added boTheme/isDark, moved STATUS_CONFIG inside component, replaced all BO_COLOR/BO_COLOR_BG, themed delivery cards, map placeholder (bg-gray-100 → bg-slate-700, bg-white → bg-slate-800), map marker chips, stat cards, filter/search icons
- Removed all BO_COLOR/BO_COLOR_BG imports from all 6 files
- All imports changed from `import { BO_COLOR, BO_COLOR_BG } from ...` to `import { useBackofficeStore } from ...`

Stage Summary:
- All 6 files themed successfully
- All BO_COLOR/BO_COLOR_BG imports removed
- Static config objects moved inside components for isDark conditional access
- Sub-components (SectionHeader, KeiwaTooltip) receive isDark via prop
- Pattern matches dashboard reference exactly
- Zero new lint errors introduced
---
Task ID: 4-a
Agent: theme-batch-1
Task: Add dark/light theme to 6 large BO screen files

Work Log:
- Read and analyzed all 6 files (acteurs, enrolement, zones, missions, supervision, utilisateurs)
- Applied theme transformations: added boTheme/isDark, replaced BO_COLOR inline styles with conditional Tailwind classes
- Updated all hardcoded color classes with isDark conditionals
- Fixed emojis: ⏳→Hourglass icon (acteurs), ⏱️→Timer icon (enrolement)

Stage Summary:
- All 6 files themed successfully
- All BO_COLOR inline styles removed
- 2 emojis replaced with Lucide icons

---
Task ID: 4-b
Agent: theme-batch-2
Task: Add dark/light theme to 6 medium BO screen files

Work Log:
- Themed audit, rapports, moderation, mutations, contenus, institutions
- Removed BO_COLOR/BO_COLOR_BG imports from all files
- Moved config objects with colors inside components for isDark access
- Applied consistent conditional class patterns

Stage Summary:
- All 6 files themed successfully
- Zero BO_COLOR references remaining

---
Task ID: 4-c
Agent: theme-batch-3
Task: Add dark/light theme to 5 smaller BO screen files

Work Log:
- Themed analytics, scores, api-keys, monitoring-ia, events
- Removed BO_COLOR/BO_COLOR_BG imports
- Dark-aware Recharts tooltips, grids, and ticks
- Moved config objects inside components for isDark access

Stage Summary:
- All 5 files themed successfully

---
Task ID: 4-d
Agent: theme-batch-4
Task: Add dark/light theme to 6 remaining BO screen files

Work Log:
- Themed communication, cron, config-institution, keiwa, marketplace, livraison
- Removed BO_COLOR/BO_COLOR_BG imports
- Dark-aware Recharts in keiwa
- Fixed emoji: ⏰→Clock icon (cron)

Stage Summary:
- All 6 files themed successfully
- 1 emoji replaced with Lucide icon

---
Task ID: 2
Agent: Main Orchestrator
Task: Implement MFA verification screen with OrbitOtp component and dark-themed BoAuthScreen

Work Log:
- Created `orbit-otp.tsx` — reusable OTP input component with styled-jsx (no Tailwind)
  - Configurable length (default 4, auth uses 6)
  - 51x51px dark boxes with subtle borders, blue glow on focus
  - Hidden sr-only input for accessibility
  - Orbit verification animation: SVG circle with dashed spinning stroke, digits orbiting around center
  - 30s resend countdown timer with "Renvoyer dans Xs" → "Renvoyer le code" button
  - Callbacks: onComplete, onChange, onResend, resetKey for external reset
- Rewrote `bo-auth-screen.tsx` — dark theme (#121319 background) with 3-step flow
  - Step 1 (credentials): email/password fields, white submit button, MFA TOTP notice, demo quick-login
  - Step 2 (MFA): fingerprint icon, OrbitOtp (6 digits), auto-submit 300ms after completion, back to credentials
  - Step 3 (success): green checkmark pop animation, progress bar, auto-redirect 600ms
  - Split layout: left branding panel (TLS 1.3, MFA TOTP, AES-256 badges), right form card
  - Card: subtle gradient, 20px border-radius, max-width 370px
  - Mobile responsive: left panel hidden, mobile logo shown, full-width card
  - All styles via styled-jsx (no Tailwind) per spec
- Fixed JSX comment syntax error (missing `*/` closing) in orbit-otp.tsx
- Browser-tested all 3 steps on desktop (1280px) and mobile (375x812)

Stage Summary:
- Produced: `src/components/backoffice/orbit-otp.tsx` (reusable OTP component)
- Produced: `src/components/backoffice/bo-auth-screen.tsx` (rewritten dark MFA auth screen)
- All flows verified: credentials → MFA → success → dashboard navigation
- Back button from MFA properly resets OTP state
- Mobile responsive layout confirmed via VLM analysis

---
Task ID: 3
Agent: Main Orchestrator
Task: Implement product-design skill system based on Vercel's agent-native design governance

Work Log:
- Explored entire Jùlaba codebase (stores, screens, voice, auth, theming, components) to gather design evidence
- Created `.agents/skills/product-design/` directory structure (SKILL.md, AGENTS.md, references/, exemplars/)
- Wrote SKILL.md — operating contract, 5 request modes (Shape/Implement/Review/Copy/Harden), 7-step workflow, decision authority chain, review output format (P0-P3)
- Wrote AGENTS.md — governance, load order, validation requirements, file map
- Wrote 8 reference files:
  - product-judgment.md: 5 core principles (marché-first, voice-primary, offline-first, 3 surfaces, soleil mode), 7 accepted decisions (PD-001 through PD-007)
  - interface-quality.md: visual hierarchy, color system, spacing, touch targets, transitions, modals, loading states, accessibility, responsive, animations
  - copy.md: canonical verbs table, destructive action copy, error messages, empty states, voice copy, FCFA formatting, backoffice terminology
  - patterns.md: component library usage, screen component pattern, bottom nav pattern, card patterns, backoffice isDark pattern, state management, styling conventions, voice integration
  - surfaces.md: routing table, cross-surface rules, per-surface rules summary
  - surfaces-marchand.md: color system, layout, key screens, soleil mode spec, interaction patterns, state coverage
  - surfaces-identificateur.md: color system, layout, key screens, interaction patterns, state coverage
  - surfaces-backoffice.md: color system (light/dark/auth), layout structure, RBAC, theme pattern, auth exception, key screens, state coverage
  - rules.md: 8 stable rules with IDs, scope, rationale, bad/good examples (no-emoji-in-ui, destructive-verb-noun, fcfa-format, backoffice-isdark-pattern, screen-enter-class, error-message-what-plus-what-to-do, voice-feedback-marchand, bottom-bar-clearance)
  - glossary.md: 50+ French terms across actors, geography, enrollment, commerce, money, backoffice, voice, technical categories
  - coverage-gaps.md: 10 gaps (high: resilience, BO forms, empty state illustrations; medium: toasts, table columns, GPS threshold, sync; low: marchand dark mode, animation easing, printer support)
- Wrote root AGENTS.md — trigger conditions, architecture quick reference, file organization, key constraints
- Wrote exemplar pr-orbit-otp-mfa.md — documents the OrbitOtp MFA auth screen decision with rationale, mistakes, and improvements
- Implemented lint rule `julaba/no-emoji-in-jsx` — ESM module in tooling/lint-rules/ that detects emoji characters in JSXText nodes. Registered as `warn` in eslint.config.mjs. Found 45 existing emoji violations across 10 files (mostly identificateur screens).
- Excluded tooling/ from ESLint ignores

Stage Summary:
- Produced 14 new files in .agents/skills/product-design/
- Produced 1 root AGENTS.md
- Produced 1 ESLint rule (no-emoji-in-jsx) with 45 violations found
- All rules traceable to product decisions with evidence
- Coverage gaps documented for future work

---
Task ID: design-eng-integration
Agent: Main Orchestrator
Task: Integrate Emil Kowalski design engineering & animation review skills into Jùlaba product-design skill system

Work Log:
- Fetched `emil-design-eng/SKILL.md` and `review-animations/SKILL.md` (+ STANDARDS.md) from GitHub
- Created `references/animation-standards.md` — easing curves (--ease-out, --ease-in-out, --ease-drawer, --ease-spring), duration budgets per element type, frequency table, physicality rules, spring config, interruptibility, performance rules, transforms/clip-path, gestures, stagger, accessibility, per-surface personality guidance
- Created `references/design-engineering.md` — core philosophy (taste is trained, unseen details compound, beauty is leverage), animation decision framework (4 questions), component building principles, performance rules, Sonner principles adapted to Jùlaba, Jùlaba-specific craft details (voice+motion coordination, OTP orbit justification, screen transitions, stagger for dashboard)
- Created `references/animation-review.md` — ten non-negotiable standards, aggressive escalation triggers (14 items), remedial preference hierarchy (9 levels), required output format (findings table + verdict with 6 impact tiers), Jùlaba-surface exceptions table (6 accepted deviations with justifications)
- Updated `references/interface-quality.md` — replaced weak 5-line Animations section with comprehensive Animations & Motion section routing to 3 new references, added Button & Press Feedback subsection, updated Transitions to warn against transition-all, added Motion & Accessibility subsection
- Updated `SKILL.md` — added Motion Review request mode to modes table, added 3 new rows to reference routing table (animation decision, animation review, easing/duration/spring), added 3 lines to Jùlaba Product Design Standards about invisible details and animation decision framework
- Updated `AGENTS.md` — added 3 new files to file map (design-engineering.md, animation-standards.md, animation-review.md)
- Added 6 new rules to `references/rules.md`: rule/no-transition-all, rule/no-scale-zero, rule/no-ease-in-ui, rule/sub-300ms-ui, rule/gpu-only-animate, rule/framer-motion-transform-string
- Closed CG-009 (Animation Easing Standards) in `references/coverage-gaps.md`
- Updated root `AGENTS.md` — added "animation, motion, easing, transitions" to applies-to list, added "animation/motion reviews" to applies-to list
- Added 4 custom easing CSS variables to `src/app/globals.css` (:root): --ease-out, --ease-in-out, --ease-drawer, --ease-spring

Stage Summary:
- 3 new reference files: animation-standards.md (240+ lines), design-engineering.md (170+ lines), animation-review.md (150+ lines)
- 6 new stable rules with IDs, scope, rationale, bad/good examples, and canonical sources
- CG-009 closed — animation easing standards now fully defined
- 4 custom easing curves added to globals.css for project-wide use
- Motion Review mode added to SKILL.md with dedicated output format and verdict criteria
- All animation decisions now follow: 1) Should it animate? 2) Purpose? 3) Easing? 4) Duration?

---
Task ID: 2
Agent: Schema+Seed+API Agent
Task: Extend Prisma schema, create seed script, and create all backoffice/marchand API routes

Work Log:
- Extended prisma/schema.prisma with 14 new models: BoEnrolment, BoAlert, BoInstitution, BoMutation, BoModerationReport, BoContent, BoCommunication, BoApiKey, BoDelivery, BoCronJob, BoCreditScore, BoKeiwaTransaction, BoKeiwaAccount, BoPlatformConfig
- Added accountId back-relation on BoKeiwaTransaction for the one-to-many with BoKeiwaAccount
- Pushed schema to SQLite via `bun run db:push`
- Created prisma/seed.ts (~290 lines) — idempotent seed creating 7 users, 12 zones, 50 actors, 30 enrolments, 5 missions, 15 audit logs, 5 alerts, 20 products, 6 institutions, 5 mutations, 5 moderation reports, 8 contents, 5 communications, 6 API keys, 12 deliveries, 9 cron jobs, 12 credit scores, 10 Keiwa accounts, 12 Keiwa transactions, 5 platform configs
- Added `"seed": "bun run prisma/seed.ts"` to package.json scripts
- Created 22 backoffice API routes under src/app/api/backoffice/: dashboard, actors, enrolments, zones, missions, users, audit, alerts, institutions, mutations, moderation, contenus, communications, scores, api-keys, keiwa, deliveries, cron, config, marketplace, analytics, monitoring
- Created 3 marchand API routes under src/app/api/marchand/: products (full CRUD), sales (list + create with items), expenses (list + create with category breakdown)
- All routes use `import { db } from '@/lib/db'`, NextResponse.json(), try/catch, French error messages, proper HTTP status codes, pagination (page/limit)

Stage Summary:
- 14 new Prisma models added to schema (all existing preserved)
- 1 seed script with realistic Ivorian data for 20 entity types
- 25 API route files created (~1900 lines total)
- ESLint: 0 new errors from this task (3 pre-existing errors in other files)
- TypeScript: fixed BoZone _count.actors error (no relation exists), replaced with groupBy approach

Files modified: prisma/schema.prisma, package.json
Files created: prisma/seed.ts, 25 API route files, agent-ctx/2-schema-seed-api-agent.md

---
Task ID: 3
Agent: seed-script-creator
Task: Create comprehensive seed script for all backoffice DB tables

Work Log:
- Created prisma/seed.ts with seed data for all tables
- Updated package.json with prisma seed config
- Ran seed script successfully

Stage Summary:
- All backoffice tables now have realistic seed data
- BoUser: 7 accounts matching backoffice-comptes.md
- BoActor: 28 actors, BoEnrolment: 18, BoZone: 8, BoMission: 7
- BoAlert: 8 alerts, BoKeiwaAccount: 8, BoKeiwaTransaction: 35 (7-day spread)
- BoPlatformConfig: 3 configs (national_target, institution, system_health)
- BoSystemEvent: 54 events (24-hour spread for event monitor)
- BoInstitution: 5, BoApiKey: 5, BoCronJob: 5, BoCommunication: 5
- BoModerationReport: 5, BoMutation: 5, BoDelivery: 5, BoContent: 5
- BoCreditScore: 5, AuditLog: 10
- Script uses async function main() pattern, idempotent (deletes in reverse dependency order)
- Seed config added to package.json under "prisma" key
---
Task ID: 4+7
Agent: api-routes-creator
Task: Create login, demo-accounts, and events API routes

Work Log:
- Created /api/backoffice/login/route.ts (POST, authenticates against BoUser table)
- Created /api/backoffice/demo-accounts/route.ts (GET, returns active accounts without passwords)
- Created /api/backoffice/events/route.ts (GET, returns system events with level filtering)

Stage Summary:
- 3 new API routes created
- Login checks email + password against DB, updates lastLogin
- Demo accounts returns safe account info for quick-login UI
- Events returns paginated, filterable system events from BoSystemEvent table
---
Task ID: fix-enrolment
Agent: Main Orchestrator
Task: Fix SWC/Turbopack parsing error in bo-enrolement-screen.tsx

Work Log:
- Fixed orphaned `</div>` caused by a removed `<div className="flex items-center gap-3">` wrapper around the title `<h1>`
- Replaced JSX comment `{/* ===== TITLE ===== */}` with the missing opening `<div className="flex items-center gap-3">` tag
- The root `<div>` no longer closes prematurely, and the ternary expression (`enrolments.length === 0 && loading ? ...`) is now properly nested inside the root
- Verified with `npx tsc --noEmit` — zero TypeScript errors for bo-enrolement-screen.tsx

Stage Summary:
- Single structural fix: restored missing `<div className="flex items-center gap-3">` wrapper around the title, removing the JSX comment that occupied its place
- No logic changes; only JSX structure restored
- TS check passes cleanly

---
Task ID: backoffice-audit-phases-2-3
Agent: Main Orchestrator
Task: Backoffice UX audit — Phases 2 & 3 (suite de la Phase 1, commit 144fce2)

Work Log:
- backoffice-store.ts: SIDEBAR_ITEMS → SIDEBAR_GROUPS (6 domaines: Pilotage, Opérations, Finance & Paiements, Contenus & Communication, Administration, Système); SIDEBAR_ITEMS dérivé par flatMap; ajout commandPaletteOpen/setCommandPaletteOpen et actorDetailRequestId/openActorDetail/clearActorDetailRequest (navigation cross-écran vers fiche acteur)
- bo-icon-proxy.tsx (nouveau): BO_ICON_MAP + IconProxy partagés (icônes par nom, sérialisables)
- bo-ui.tsx (nouveau): bibliothèque de composants harmonisés — BoPageHeader, BoFilterBar, BoErrorBanner, BoEmptyState, BoStatCard (thème via variantes dark:)
- bo-command-palette.tsx (nouveau): recherche globale Ctrl+K/⌘K (cmdk) — navigation filtrée par RBAC, acteurs (ouverture fiche), enrôlements en attente, zones, action liste acteurs
- bo-layout.tsx: sidebar rendue par groupes (labels en mode étendu, séparateurs en mode réduit, filtre RBAC par groupe), champ de recherche header remplacé par bouton palette avec kbd "Ctrl K", palette montée dans le layout
- bo-acteurs-screen.tsx: fiche acteur Dialog → Sheet latéral droit (avec actions Suspendre/Réactiver en pied de sheet), ouverture depuis la palette via actorDetailRequestId, refacto BoPageHeader/BoFilterBar/BoStatCard/BoEmptyState/BoErrorBanner
- Refactorisation des 22 autres écrans vers les composants bo-ui (headers unifiés, bannières d'erreur BoErrorBanner, états vides BoEmptyState, stats BoStatCard, barres de filtres BoFilterBar) — acteurs, enrolement, zones, missions, supervision, utilisateurs, audit, rapports, dashboard + 15 écrans API-driven (mutations, moderation, contenus, institutions, marketplace, livraison, communication, scores, analytics, keiwa, api-keys, cron, config-institution, monitoring-ia, events)
- Titres en MAJUSCULES passés en casse normale française sur tous les écrans

Stage Summary:
- 4 nouveaux fichiers (bo-ui, bo-command-palette, bo-icon-proxy + rien d'autre), 26 fichiers modifiés
- Phase 2 complète: sidebar par domaines, Ctrl+K, fiche acteur Sheet latéral
- Phase 3 complète: composants harmonisés déployés sur les 24 écrans (complète aussi l'item Phase 1 "bannière erreur + empty state" à l'échelle du backoffice)
- TypeScript: 0 nouvelle erreur (restent les 12 préexistantes: bo-communication CommStatus, stt.ts, examples/, ident-rapports)
- next build: exit 0
- ESLint cassé dans le dépôt (module tooling/lint-rules/no-emoji-in-jsx.mjs absent) — préexistant, non corrigé

---
Task ID: marchand-features-batch-1
Agent: Super Z
Task: Implémentation de 5 fonctionnalités marchand (file offline, création tontine, Keiwa, lecteur Academy, commandes fournisseurs) + CI

Work Log:
- offline-db.ts: file d'attente réelle (localStorage FIFO cap 500), flushPendingSync avec lock module, conflits persistés (recordSyncConflict → /api/sync-conflicts/report), flushAllPendingSync (max 3 passes)
- sync-handlers.ts (nouveau): 12 gestionnaires de rejeu — device-claim (409 toléré), sale, expense, product, product-update, merchant-update (404 toléré), tontine-contribution, supplier-order, recolte-create/update, commande-update, journal ; distinction transitoire (408/429/5xx/réseau) vs définitif (autres 4xx → SyncConflictError)
- sync-flusher.tsx (nouveau): flush au retour réseau, focus/visibility, chargement avec file héritée ; monté dans page.tsx pour les 3 profils ; claim-device-session.ts enchaîne un flush après claim réussi
- Migration 20260916000000_marchand_features.sql: legacy_tontines.client_id unique, legacy_keiwa_wallets, legacy_keiwa_transactions (ledger append-only), legacy_supplier_orders, fonctions legacy_keiwa_apply_operation (row lock FOR UPDATE — anti double-spend + anti lost-update, idempotente clientId, raise SOLDE_INSUFFISANT) et legacy_bo_content_increment_views (incrément atomique)
- API: POST /api/marchand/tontines/create (créateur premier membre, idempotent), /api/marchand/keiwa GET/POST (RPC transactionnel, mapping SOLDE_INSUFFISANT→400), /api/marchand/contenus GET + /contenus/[id] GET (publiés seulement, remplace l'ancien appel BO en 401 permanent pour les marchands), /api/marchand/supplier-orders GET/POST/PATCH (total recalculé serveur, annulation en_attente seulement)
- UI marchand: KeiwaScreen réelle (keiwa-screen.tsx — solde, dépôt/retrait/transfert avec chips montants, historique, en ligne seule assumée), MarcheScreen (Commander actif → modale quantité/total, section dernières commandes), CommandesScreen réelle (suivi + annulation + CTA Marché), TontinesScreen (modale création complète, en ligne seule car les cotisations référencent l'id serveur), AcademyScreen (endpoint marchand + navigation lecteur), academy-course-screen.tsx (Markdown, métadonnées, compteur vues, Écouter le début)
- app-store: route 'academy-course' + academyCourseId/openAcademyCourse/closeAcademyCourse (non persisté)
- Notifications: types tontine_creation, supplier_order, keiwa_transaction ; ENTITY_LABEL sync-conflicts: supplier-order
- CI: .github/workflows/ci.yml (npm ci + lint + typecheck + vitest)
- Tests réparés (préexistants en échec): gemma-model.test.ts (taille artefact réelle 584_417_280), piper-tts.test.ts (mock TtsSession + AudioContext au lieu de <audio>)
- docs/OFFLINE.md réaligné: file réelle, triggers de flush, lignes tontine/Keiwa/Marché, section conflits corrigée (FIFO + poursuite après échec transitoire)
- Vérifié: tsc 0 erreur, vitest 105/105, eslint exit 0, parcours navigateur réels (écrans + modales + états vides/erreur/soleil)

Stage Summary:
- Les 5 placeholders marchand ("Bientôt disponible"/boutons désactivés) sont fonctionnels: Keiwa, création tontine, commandes fournisseurs, suivi commandes, lecture Academy
- La file offline documentée mais stubée depuis la migration Supabase est réactivée et testée de bout en bout
- Keiwa et création de tontine restent volontairement hors file (intégrité financière / dépendance id serveur) — documenté dans OFFLINE.md
- Restes connus non traités (préexistants): /api/v1 non câblée, simpleHash, rate-limit mémoire, fichiers morts, double lockfile

---
Task ID: 18
Agent: Super Z
Task: Enrôlement — étape CNI recto/verso avec OCR pré-remplissage + design harmonisé des 5 étapes du wizard

Work Log:
- Contexte : workspace réinitialisé (projet perdu), re-cloné depuis GitHub (akoun-dev/julaba @ 8417f09), bun install relancé
- identificateur-store.ts : Dossier + cniRecto/cniVerso (data URL, locaux) + cniNumero + nni
- document-ocr.ts : parseCniFields() — layouts étiqueté (NOM/PRENOMS/SEXE/NNI) et numéroté (1. NOM…), fallback NNI 10 chiffres, title-case des noms, extractCniNumber conservée
- identificateur-sync.ts : payload + hasCniRecto/hasCniVerso/cniNumero/nni (les images restent locales, comme photoBase64)
- ident-identification-screen.tsx restructuré en 5 étapes : 1=CNI (slots recto/verso ratio carte ID-1, OCR auto dès les deux faces, bannières succès/échec + ré-analyse, champs Nom/Prénom/Sexe/N°CNI/NNI modifiables, note confidentialité, passer) ; 2=Photo & Identité (fusion anc. 1+2, sexe déplacé depuis Détails, note « Pré-rempli depuis la CNI ») ; 3=Détails ; 4=Localisation ; 5=Autorisation
- Design harmonisé « 1 à 5 » : stepper redesigné (cercles numérotés, connecteurs qui se remplissent, légende « Étape X sur 5 · Libellé » toujours visible), StepHero commun aux 5 étapes (sur-titre Étape X/5, titre, consigne), barre de progression X/5 au-dessus des CTA, ReviewRow CNI au récap
- handleSubmit : photo → étape 2, auth → étape 5
- Test nouveau : src/lib/vision/__tests__/document-ocr.test.ts (9 cas)
- Captures : scripts/captures_enrolement.py (Playwright headless, parcours complet inscription ident 05 55 55 55 55/Awa/0000 → wizard) — OCR Tesseract validé en bout en bout dans le navigateur (CNI d'exemple générées par gen_cni_samples.py, lecture réelle Kone/Awa/F/CI0123456789/0123456789)
- Captures livrées : 00-accueil, 01-etape1-cni-vide, 02-etape1-cni-scannee-ocr, 03-etape2-photo-identite, 04-etape3-details, 05-etape4-localisation, 06-etape5-autorisation (dans my-project/download/captures-enrolement/ + julaba/download/captures-enrolement/)
- Vérifié : tsc 0 erreur, eslint 0, vitest 134/134

Stage Summary:
- Le wizard de création de dossier suit le design numéroté 1→5 avec l'étape CNI en tête : scan recto/verso → OCR sur l'appareil → pré-remplissage modifiable (nom, prénom, sexe, N°CNI, NNI) → le reste du parcours vérifie/préserve
- 4 fichiers modifiés, 1 test ajouté (9 cas), 7 captures générées
- Commit en attente de push (PAT à demander — ancien token révoqué)

---
Task ID: 42
Agent: Super Z (Orchestrateur multi-agents)
Task: Analyse complète du projet + mise en place du système de pilotage .ai/ (protocole multi-agents : AGENT 1 dev/architecture + AGENT 2 PM/QA)

Work Log:
- RESET SANDBOX constaté à l'ouverture : /home/z/julaba disparu → re-cloné (PAT), bun install (924 pkgs, 11 s)
- Découverte : HEAD = ce8aa12 (1 commit au-delà de 6c3f77d — session concurrente : quick-sale.ts + ventes vocales synchronisées) ; bfec4f8 (Task 40) déjà poussé
- AGENT 1 (audit technique) : pipeline voix cartographié (14 modules voice/, 4 plugins natifs, 3 STT + 4 TTS), IA Gemma 3 1B LiteRT 100% locale (navigation only), 10 stores zustand, 75 routes API, 0 appel Supabase depuis les composants (CRUD conforme), duplications cartographiées (profile vs prod-profil ~200 l.), code mort identifié
- AGENT 2 (inventaire fonctionnel) : 4 rôles, 8 workflows E2E documentés, 33 suites de tests, roadmap multilingue évaluée : B1 embarqué (90%, validation terrain pendante), B2 NLLB ABSENT (0 grep), B3 TTS bci ABSENT (signal notifyBciNarrationLimitOnce), B4/B5 ABSENTS
- BASELINE revalidée : 480/480 tests verts, tsc 0 erreur, eslint 2 erreurs react-hooks/immutability dans vente-rapide-modal.tsx (introduites par ce8aa12) → BUG-001
- Créé .ai/ (14 fichiers) : README, PROJECT_CONTEXT, ARCHITECTURE, REQUIREMENTS (roadmap B1-B5), TASKS.xlsx (registre central 34 tâches, 19 colonnes, QA skill passée : validate exit 0), TASKS.md miroir, AGENT1/2_STATUS, TEST_PLAN (scénarios QA B1-B5 dont garde « parseIntent jamais bci brut » et confirmations oui/non bilingues), WORKFLOWS (WF1-WF8), BUGS (BUG-001 + 8 points d'attention), REGRESSIONS (historique + anticipations CSP/routing), CHANGELOG + DADR-001/002/003, HANDOFF bidirectionnel
- Décisions enregistrées : DADR-001 (NLLB suit le pattern kokoro-tts : opt-in+cache+progression+CSP), DADR-002 (BaouleVoiceEngine = module TS unifié, modèles lourds côté natif), DADR-003 (pas de couche repository immédiate, non bloquant)

Stage Summary:
- Ordre d'exécution validé : BUG-001 → B2 (NLLB, cœur du pivot) → B3 (TTS bci) → B4 (chaîne) → B5 (engine) ; normalisation au fil de l'eau
- Bloqué sur l'utilisateur : B1-010 benchmark téléphone réel (docs/BENCHMARK.md), SEC-402 révocation PAT ghp_EUGEmf… (P0)
- Aucun code applicatif modifié (conformité protocole : analyse avant action)

---
Task ID: 43
Agent: Super Z (Orchestrateur — boucle autonome : AGENT 1 + AGENT 2)
Task: « vas-y » — exécution de l'ordre validé : BUG-001 → B2 (NLLB-200)

Work Log:
- BUG-001 FERMÉ (b0a95e1) : cycle de callbacks vente-rapide-modal.tsx cassé via refs
  d'indirection synchronisées par useEffect (react-hooks/immutability ×2) ; lint 0, 480/480
- B2-020 LIVRÉ : src/lib/voice/nllb-translation.ts — translateText bci_Latn↔fra_Latn
  (Xenova/nllb-200-distilled-600M q8), erreurs typées NllbError (7 codes) + messages FR,
  téléchargement OPT-IN avec progression agrégée multi-fichiers, Cache API 'transformers-cache',
  timeout 20 s, isNllbModelReady (ne télécharge JAMAIS implicitement), removeNllbModel ciblé,
  resolveParserInput = GARDE d'architecture (le parseur fr ne voit jamais de bci brut)
- B2-022 : 21 tests de contrat (vitest) — garde, timeout, EMPTY_OUTPUT, ENGINE_ERROR,
  paires invalides, réutilisation instance, removeNllbModel ciblé, describeNllbError
- B2-021 MESURES RÉELLES : q8 = variante la PLUS LÉGÈRE du repo HF (872 Mo total :
  encoder q8 400 Mo + decoder_merged q8 454 Mo + tokenizer 17 Mo) — q4 2,2 Go /
  int8 statique 1,8 Go / fp16 1,7 Go tous PIRES ; implication produit : opt-in obligatoire,
  jamais dans l'APK, Wi-Fi recommandé dans l'UI
- PIÈGES CONTURNÉS : transformers.js v2 en Node cache DANS
  node_modules/@xenova/transformers/.cache/ (pas ./.cache du projet) ; téléchargement
  node fetch lent → pré-placement curl (-C -) ; CHARGEMENT IMPOSSIBLE DANS LE SANDBOX :
  OOM kill SIGKILL (~2,3 Go RAM, exit 137) → latence réelle à mesurer sur appareil
- AGENT 2 : 501/501 tests verts (34 fichiers), tsc 0, eslint 0 ; registre TASKS.xlsx
  regénéré + validé (exit 0) ; changelog, statuses, handoff, bugs mis à jour
- Push : b0a95e1 (BUG-001) puis d1a0153 (B2) sur origin/main

Stage Summary:
- B2 = cœur du pivot LIVRÉ : la suite bci→[NLLB]→fr→IA→[NLLB]→bci a désormais son
  module de traduction testé + la garde anti-bci-brut ; prochaine tâche : B3-030
  (rapport évaluation moteurs TTS Baoulé offline AVANT intégration)
- À faire par l'utilisateur : révocation PAT (P0) ; benchmark B1 + latence B2 sur
  téléphone réel (scripts/smoke-nllb.mjs prêt pour hôte ≥ 4 Go RAM)

---
Task ID: 44
Agent: Super Z (Orchestrateur — boucle autonome AGENT 1 + AGENT 2)
Task: B3-030 — évaluation des moteurs TTS Baoulé offline (rapport AVANT intégration)

Work Log:
- Baseline revalidée en début de session : 501/501 tests (34 fichiers) · tsc 0 · eslint 0 ;
  push Task 43 (2f75930) confirmé sur origin/main via git fetch
- SONDAGE HF COMPLET (API, tailles/licences exactes) :
  - facebook/mms-tts-bci N'EXISTE PAS (MMS 1 107 langues, bci absent)
  - rnjema-unima/mms-tts-bci-baseline = kit de fine-tuning (model card : « Model
    weights are not stored here » → poids = donor facebook/mms-tts-aka) — PAS un
    modèle baoulé entraîné ; aucun autre fine-tune bci publié sur HF
  - Corpus google/WaxalNLP config bci_tts : 180 h TTS mono-locuteur (Univ. of
    Ghana) sous CC-BY-4.0 → entraînement licitement commercial POSSIBLE
  - Port ONNX donor : onnx-community/mms-tts-aka-ONNX (fp32 114,28 Mo /
    fp16 58,16 Mo / q4f16 56,87 Mo ; pas de q8 — VITS dégrade en int8)
  - Piper : 37 langues, pas de bci ; Kokoro : pas de bci ; eSpeak-NG : pas de bci
- SMOKE RÉEL SANDBOX (JULABA_MMS_MODEL_DIR local + transformers.js 2.17.2 du
  projet, backend onnxruntime-node fp32) : chargement 0,9-1,3 s ; RTF moyen 0,33
  (4/4 synthèses WAV 16 kHz valides : 0,78-3,10 s ; latence 250-353 ms) ;
  samples versionnés dans .ai/eval-b3/samples/
- PIÈGES CONTURNÉS (documentés dans les scripts) :
  1) port onnx-community sans tokenizer.json (requis transformers.js v2) →
     .ai/eval-b3/build_tokenizer_json.py reconstruit depuis vocab.json (schéma
     copié sur Xenova/mms-tts-fra : Lowercase + whitelist regex + apposition pad)
  2) re.escape() Python produit des échappements regex INVALIDES en JS flag u
     (\ interdit) → échapper uniquement \ ] ^ -
  3) transformers.js v2 local : env.localModelPath = base + id relatif (pas de
     chemin absolu direct), env.allowRemoteModels = false
- DÉCOUVERTE ARCHITECTURE : vocab donor = 30 chars, une seule lettre à ton (á)
  → les diacritiques de tons baoulé (à/è/é/ǹ…) sortiraient du vocab → B3-031
  doit livrer un NORMALISATEUR ORTHOGRAPHIQUE bci (strip tons, garder ɛ/ɔ/’)
- LICENCE : tout fine-tune VITS partant de MMS hérite CC-BY-NC-4.0 (pilote
  uniquement) ; voie production licite = voix Piper custom (runtime MIT) sur
  corpus CC-BY-4.0 (B3-034) ou accord Waxal/UNIMA
- LIVRABLES VERSIONNÉS : .ai/EVAL_B3_TTS.md (rapport complet §1-9),
  .ai/eval-b3/{smoke-mms-akan.mjs, build_tokenizer_json.py, samples/4 wav}
- REGISTRE : B3-030 → TERMINÉ (100 %, preuves embarquées) ; B3-031 redéfinie
  (moteur pilote MMS fp16 + normalisateur bci + branchement tata-tts + UI
  « voix pilote ») ; B3-033 (fine-tune VITS GPU, décision utilisateur) et
  B3-034 (Piper production) créées BACKLOG ; B3-032 élargie (écoute comparative)
  ; TASKS.xlsx regénéré (36 tâches) + validate exit 0 ; TASKS.md, CHANGELOG,
  AGENT1_STATUS, HANDOFF n°3 mis à jour
- AUCUN CODE APPLICATIF MODIFIÉ (conformité REQ-B3a : évaluer AVANT intégration)

Stage Summary:
- B3-030 FERMÉ : l'intégration B3-031 a désormais une base factuelle (moteur
  mesuré RTF 0,33, checkpoint provisoire fp16 58 Mo, normalisateur spécifié,
  licences tranchées) ; la voix baoulé réelle exige un entraînement (B3-033
  GPU ou B3-034 Piper) — décisions utilisateur requises, PAS bloquantes pour
  B3-031
- Prochaine tâche boucle : B3-031 — src/lib/voice/mms-tts.ts (pattern DADR-001)
  + normalisateur bci + remplacement de notifyBciNarrationLimitOnce
- Utilisateur : écouter .ai/eval-b3/samples/*.wav (plombage) ; décisions GPU
  B3-033/034 ; révocation PAT (P0) ; benchmark B1-010 sur téléphone réel

---
Task ID: 45 (suite Task 44, même session — B3-031)
Agent: Super Z (Orchestrateur — boucle autonome AGENT 1 + AGENT 2)
Task: B3-031 — moteur pilote TTS baoulé (mms-tts.ts + normalisateur bci + tata-tts + UI)

Work Log:
- Lecture intégrale du pattern DADR-001 (kokoro-tts.ts, 555 l.) et de tata-tts.ts
  avant toute modification (protocole) ; mécanisme interne transformers.js v2
  vérifié dans node_modules : BrowserCache = caches.open('transformers-cache'),
  clé = URL HF exacte ({model}/resolve/main/{file}) → PRÉ-REMPLISSAGE possible
- CRÉATION src/lib/voice/mms-tts.ts (~470 l.) :
  - downloadMmsBciVoice : 5 petits fichiers HF + tokenizer.json GÉNÉRÉ
    (buildMmsTokenizerJson, port TS de build_tokenizer_json.py validé en smoke)
    + model.onnx fp32 114 Mo (fp16 impossible : v2 ne connaît que quantized
    true|false ; documenté en tête) ; progression par Content-Length/reader ;
    cache.put sous les URL HF exactes → from_pretrained 100 % offline ensuite
  - normalizeBciText : NFD + strip U+0300-036F (tons), ’/' unifiées, ʼ (U+02BC,
    DANS le vocab donor) préservé, ɛ/ɔ intactes (non décomposables),
    ponctuation/symboles → pauses, idempotent
  - mmsBciSpeak : garde ready stricte (poids + tokenizer présents — un état
    à moitié téléchargé n'est pas « prêt »), timeout 30 s + 80 ms/char (cap
    120 s), AudioContext + onended + watchdog (contrat piper/kokoro), false
    jamais d'exception, JAMAIS de téléchargement depuis une narration
- BRANCHEMENT tata-tts.ts : chemin bci en amont de tataSpeak quand
  ttsLanguage='bci' → isMmsBciVoiceReady → mmsBciSpeak(TEXTE BRUT) — jamais
  toSpeechText (montants français n'ont pas de sens en bci) ; repli =
  dispatchFrenchNarration (extraction à l'identique du dispatch historique,
  webspeech SYNCHRONE préservé) + signal une fois par session ; tataStop +
  mmsStop ; unlockTataAudio + unlockMmsAudio conditionné à la langue bci
- UI : src/components/shared/bci-voice-card.tsx (composant PARTAGÉ — pas de
  nouvelle duplication NORM-301) inséré dans profile-screen.tsx (marchand,
  textColorClass=tc) et prod-profil-screen.tsx (producteur, sans prop) ;
  libellé honnête « pilote — qualité limitée » (mission : pas de promesse
  muette) ; isMmsSupported garde l'affichage
- TESTS : mms-tts.test.ts NOUVEAU 25 cas (normalisateur 4, tokenizer 3,
  gardes 4, download 3, speak 3, remove 1, constantes 1) ; tata-tts.test.ts
  +6 (chemin bci, texte brut vs toSpeechText, repli sans installation,
  échec MMS → done unique via onend manuel, zéro coût en fr, tataStop)
- PIÈGES CORRIGÉS EN ROUTE : fetchModelFile param optionnel avant requis
  (TS1016) ; apostrophe droite dans les chaînes de test (parse errors) ;
  vi.stubGlobal('window', undefined) PERSISTE entre tests (unstubGlobals
  off) → re-stub explicite ; les échantillons ɛ/ɔ SONT le comportement
  attendu (attentes initiales du test corrigées, pas le module) ;
  afterAll inutile — afterEach local dans le describe bci
- VALIDATION : 526/526 tests (35 fichiers, +25) · tsc 0 · eslint 0 ·
  BUILD PROD OK (piège CSP Task 41 re-vérifié, wasm-unsafe-eval inchangé)
- REGISTRE : B3-031 → VALIDATION 90 % (smoke appareil restant) ;
  TASKS.xlsx regénéré + validate exit 0 ; TASKS.md, CHANGELOG,
  AGENT1_STATUS, HANDOFF n°4 mis à jour

Stage Summary:
- La narration baoulé existe : moteur opt-in complet, testé, buildé ;
  le chemin bci→fr→IA→fr→bci a TOUS ses maillons techniques (B2 NLLB +
  B3 TTS) — reste l'orchestrateur (B4-040), l'écoute native (B3-032) et
  la vraie voix baoulé (B3-033/034, décisions utilisateur)
- Prochaine tâche boucle : B4-040 (orchestrateur) puis B4-041 (oui/non
  bilingues) ; smoke device B3 à regrouper avec B1-010 (téléphone réel)
- Utilisateur : PAT (P0) ; benchmark B1 ; écoute samples ; décisions GPU

---
Task ID: 46
Agent: Super Z (Orchestrateur — boucle autonome AGENT 1 + AGENT 2)
Task: B4-040 — orchestrateur conversation bci→fr→IA→fr→bci

Work Log:
- SCAN : découvert que resolveParserInput (garde B2-022) n'était PAS branchée
  en production — parseIntent recevait le transcript brut des modales, et
  tataSpeak recevait du français même en session bci (la voix MMS l'aurait
  lu avec des phonèmes akan) = le trou exact que B4-040 doit combler
- CRÉATION src/lib/voice/conversation.ts (~150 l.), nœud central de la chaîne :
  - resolveConversationInput : session fr → pass-through strict (zéro
    régression, aucun appel traducteur) ; session bci → traduction
    OBLIGATOIRE via resolveParserInput (échec = chaîne arrêtée AVANT
    parseIntent, NllbError typée, jamais de bci brut au parseur)
  - narrateResponse : session fr → tataSpeak direct (dispatch synchrone
    préservé) ; session bci → NLLB fra→bci puis tataSpeak avec le texte
    baoulé BRUT (contrat B3-031) ; échec traduction → tataSpeakWeb
    (court-circuite le chemin MMS : le français n'atteint JAMAIS la voix
    akan) + translationError explicite dans le résultat ; ne lève jamais
  - seams de test (setConversationNllbForTests / resetConversationForTests)
- CÂBLAGE voice-modal.tsx + prod-voice-modal.tsx : handleTranscript
  (transcript → orchestrateur → parseur ; échec → erreur affichée + narrée
  + auto-close) + 22 sites de narration migrés tataSpeak → narrateResponse
- DÉCISION documentée : en session bci, intent.rawTranscript porte la
  traduction française (findCatalogEntry + descriptions sync = français
  côté données) — validée en passation n°5 (AGENT 2 à confirmer)
- TESTS : conversation.test.ts NOUVEAU 13 cas (pass-through, garde B2-022
  ×2, langue inconnue, routage bci, repli hors-MMS, non-levée, seams)
- VALIDATION : 539/526+13 tests (36 fichiers) · tsc 0 · eslint 0 ·
  BUILD PROD OK (CSP wasm-unsafe-eval inchangée)
- REGISTRE : B4-040 → VALIDATION 90 % (E2E = B4-042 AGENT 2 ; smoke appareil
  avec B1-010) ; TASKS.xlsx regénéré + validate exit 0 · audit clean ;
  TASKS.md, CHANGELOG, AGENT1_STATUS, HANDOFF n°5 mis à jour

Stage Summary:
- La chaîne conversationnelle complète existe techniquement : dictée bci →
  NLLB fr → parseur/IA fr → NLLB bci → TTS bci, avec erreurs explicites à
  chaque maillon et zéro régression française
- Reste B4 : B4-041 (confirmations oui/non bilingues — patterns natifs ɛhè,
  robustesse réseau), B4-042 (E2E mocks, AGENT 2)
- Session fr inchangée dans les faits : tout pass-through, 32 tests
  tata-tts verts, les 505 autres tests non-voix intacts

---
Task ID: 47
Agent: Super Z (Orchestrateur — boucle autonome AGENT 1 + AGENT 2)
Task: B4-041 — confirmations oui/non bilingues + robustesse réseau

Work Log:
- CRÉATION src/lib/voice/confirmations.ts : parseConfirmation bilingue
  fr + baoulé — liste PILOTE documentée (oui : ɛhɛ/ɛhè/ɔ/ɔɔ/o/oo/ehe ;
  non : ao/a o — formes les plus attestées des lexiques baoulé, à confirmer
  par locuteur natif en B3-032, module extensible) ; normalizeConfirmationText
  (NFD + strip tons U+0300-036F, ’ → ', ponctuation en espaces) ;
  hors vocabulaire → null → re-parse comme nouvelle commande (historique)
- PIÈGES CORRIGÉS EN ROUTE : ponctuation INTERNE (ɛhɛ, d'accord) → replace
  global en espaces (pas seulement trailing) ; phrases deux-mots fr
  (c'est ça / c'est bon) testées sur twoFirst AVANT le token simple ;
  « a o » (non) testé AVANT « o » (oui) — ordre significatif + testé
- CÂBLAGE des 2 modales : branches confirm (regex 100 % fr → parseConfirmation)
- ROBUSTESSE RÉSEAU (REQ-B4c) : fetchJsonWithTimeout (10 s, AbortController)
  dans conversation.ts ; les 2 fetch de voice-modal (dépense, commande
  fournisseur) ne peuvent plus rester suspendus — échec explicite → file
  offline existante (« en attente de synchronisation »)
- TESTS : confirmations.test.ts NOUVEAU 39 cas + conversation.test.ts +4
  (borne 10 s, Response transmise, timeout → erreur explicite, propagation)
- VALIDATION : 582/582 (37 fichiers) · tsc 0 · eslint 0 · BUILD PROD OK
- REGISTRE : B4-041 → VALIDATION 90 % ; TASKS.xlsx regen + validate exit 0 ;
  TASKS.md, CHANGELOG, AGENT1_STATUS, HANDOFF n°6 mis à jour

Stage Summary:
- REQ-B4b couverte : un « ɛhɛ » confirme, un « ao » annule, en session bci
  comme en fr ; liste pilote honnête, extensible, point d'entrée natif B3-032
- REQ-B4c couverte : borne réseau 10 s en pleine conversation + échecs
  explicites à chaque maillon (NLLB typé, STT cartographié, TTS watchdog)
- Le bloc B4 est fonctionnellement complet côté AGENT 1 — reste B4-042
  (E2E mocks, AGENT 2). Prochaine tâche boucle : B5-050 (baoule-engine.ts)

---
Task ID: 48
Agent: Super Z (Orchestrateur — boucle autonome AGENT 1 + AGENT 2)
Task: B5-050 — façade unifiée BaouleVoiceEngine (contrat API)

Work Log:
- CRÉATION src/lib/voice/baoule-engine.ts — FAÇADE PURE sur B1→B4 (aucune
  logique dupliquée : voice-service / nllb-translation / mms-tts /
  conversation restent les sources de vérité) :
  - getBaouleEngineStatus / isBaouleEngineReady : sondes sans effet de bord
  - initializeBaouleEngine : charge le STT natif bci, NE TÉLÉCHARGE JAMAIS,
    état exact des maillons manquants (installations opt-in pointées)
  - createBaouleTranscriptionSession : STT bci offline (contrat STTSession),
    session inerte à erreur explicite hors coque native
  - translateBaouleToFrench / prepareBaouleParserInput : garde B2-022,
    mapping NllbError → BaouleEngineError (messages FR préservés)
  - speakBaoule : délègue narrateResponse (ne lève jamais)
  - installBaouleTranslator / installBaouleVoice : OPT-IN explicite
  - BaouleEngineError 7 codes + describeBaouleEngineError (pattern Task 41)
- SCORIES CORRIGÉES EN ROUTE : fallback absurde dans mapNllbError, ternaire
  inutile installBaouleVoice, import dynamique superflu → import statique ;
  TS2345 test (STTCallbacks exige onResult) → callbacks minimaux valides
- TESTS : baoule-engine.test.ts NOUVEAU 16 cas (sondes, initialize sans
  téléchargement — assertions download* non appelés —, session STT, garde,
  mapping, speak fr/bci/repli, installs)
- VALIDATION : 598/598 (38 fichiers) · tsc 0 · eslint 0 · BUILD PROD OK
- REGISTRE : B5-050 → VALIDATION 90 % (branchement B5-051 + smoke B5-052
  restants) ; TASKS.xlsx regen + validate exit 0 ; TASKS.md, CHANGELOG,
  AGENT1_STATUS, HANDOFF n°7 mis à jour

Stage Summary:
- Le contrat unifié REQ-B5a existe : un seul point d'entrée pour B1→B4 avec
  erreurs dédiées — B5-051 (branchement stt-factory + modales) peut démarrer
- Roadmap B1→B5 : plus que B5-051 (branchement), B5-052 (smoke APK AGENT 2),
  B4-042 (E2E AGENT 2) + validations utilisateur (B1-010, B3-032/033/034)

---
Task ID: 49
Agent: Super Z (Orchestrateur — boucle autonome AGENT 1 + AGENT 2)
Task: B5-051 — branchement façade stt-factory + modales (entrée unique)

Work Log:
- baoule-engine.ts : ré-export fetchJsonWithTimeout + CONVERSATION_NETWORK_
  TIMEOUT_MS (la façade reste l'entrée UNIQUE de la chaîne baoulé côté UI)
- stt-factory.ts : route bci de createSmartSingleShotSTT →
  createBaouleTranscriptionSession (délégation VoiceService — comportement
  strictement identique, point d'entrée unifié) ; route fr INCHANGÉE
- voice-modal.tsx + prod-voice-modal.tsx : migration vers la façade —
  prepareBaouleParserInput / speakBaoule / describeBaouleEngineError
- PIÈGE CORRIGÉ : stt-routing.test.ts FAIL au chargement (« No registerPlugin
  export on @capacitor/core mock ») — la façade introduit native-tts dans la
  chaîne d'import des tests de routage ; mock complété (registerPlugin +
  WebPlugin), zéro changement de logique de test (21/21 verts)
- VALIDATION : 598/598 (38 fichiers) · tsc 0 · eslint 0 · BUILD PROD OK
- REGISTRE : B5-051 → VALIDATION 90 % ; TASKS.xlsx regen + validate exit 0 ;
  TASKS.md, CHANGELOG, AGENT1_STATUS, HANDOFF n°8 mis à jour

Stage Summary:
- ROADMAP AGENT 1 B1→B5 INTÉGRALEMENT CÂBLÉE : stt-factory et les 2 modales
  passent par BaouleVoiceEngine — un seul point d'entrée, erreurs unifiées,
  non-régression française prouvée (32 tata-tts + 21 stt-routing/factory)
- Reste côté agents : B4-042 (E2E mocks) + B5-052 (smoke APK) = AGENT 2 ;
  reste côté utilisateur : B1-010, B3-032/033/034, SEC-402, INF-401
- Prochaine action AGENT 1 : NORM-302 (code mort) / DOC-306 en attendant
  les validations

---
Task ID: 50
Agent: Super Z (Orchestrateur — boucle autonome AGENT 1 + AGENT 2)
Task: NORM-302 — suppression du code mort

Work Log:
- Vérification préalable 0 importeur pour chaque candidat (rg sur src/ +
  scripts/ + config) : src/lib/supabase/browser.ts (createSupabaseBrowserClient
  jamais importé), src/components/identificateur/ident-top-bar.tsx,
  db/custom.db (vestige Prisma), examples/websocket/ (2 fichiers, jamais
  référencés), dep z-ai-web-dev-sdk (aucun import dans src/)
- Suppression : git rm ×5 ; package.json ligne z-ai retirée + bun install
  (bun.lock synchronisé, 1 paquet retiré)
- Précaution : z-ai dans tests/python-runtime-container.sh = nom d'image
  Docker (z-ai-python-deploy-runner) — SANS rapport avec le paquet, conservé
- VALIDATION : 598/598 · tsc 0 · eslint 0 · BUILD PROD OK · CSP intacte
- REGISTRE : NORM-302 → TERMINÉ 100 % ; TASKS.xlsx regen + validate exit 0 ;
  TASKS.md (Task 50, comptes mis à jour : 17 terminées), CHANGELOG,
  AGENT1_STATUS mis à jour

Stage Summary:
- Dépôt allégé : un composant mort, un client Supabase mort, un .db binaire,
  des exemples hors build et une dépendance jamais importée en moins
- Prochaine tâche boucle : DOC-306 (mise à jour AGENTS.md — 10 stores,
  pipeline voix réel)

---
Task ID: 51
Agent: Super Z (Orchestrateur — boucle autonome AGENT 1 + AGENT 2)
Task: DOC-306 — mise à jour AGENTS.md

Work Log:
- Audit AGENTS.md vs réalité : « 7 stores » → 10 réels (gemma-model-store,
  network-store, voice-language-store manquants) ; « Voice: Web Speech API »
  complètement obsolète depuis Tasks 31-46
- AGENTS.md aligné : ligne State (10 stores nommés), ligne Voice (STT natif
  VoiceService sherpa FR + Omnilingual bci via stt-factory ; TTS tata-tts +
  Piper/Kokoro opt-in + voix MMS bci pilote ; NLLB + façade BaouleVoiceEngine ;
  Web Speech = repli web fr uniquement ; pointer vers .ai/ARCHITECTURE.md),
  arborescence voice/ détaillée (STT/TTS/NLU/chaîne baoulé/wake-word)
- Doc seule : zéro impact runtime — baseline 598/598 inchangée
- REGISTRE : DOC-306 → TERMINÉ 100 % ; TASKS.xlsx regen + validate exit 0 ;
  TASKS.md (Task 51 : 18 terminées), CHANGELOG, AGENT1_STATUS mis à jour

Stage Summary:
- FILE AGENT 1 VIDÉE : toute la roadmap B1→B5 + normalisation prioritaire
  est livrée. Reste AGENT 2 : B4-042 (E2E mocks) + B5-052 (smoke APK).
  Reste UTILISATEUR : B1-010 (benchmark device), B3-032 (écoute natif),
  B3-033/034 (GPU/production), SEC-402 (PAT — P0), INF-401 (déploiement).
  Backlog arbitré : NORM-301/303/304/305

---
Task ID: 52
Agent: Super Z (Orchestrateur — rôle AGENT 2, QA)
Task: B4-042 — tests E2E de la chaîne conversation baoulé (mocks) + verdicts registre

Work Log:
- CRÉATION src/lib/voice/__tests__/baoule-chain-e2e.test.ts (AGENT 2) —
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
- Correction en route : assertion sonde (les probes traducteur/voix lisent
  le Cache API RÉEL → false en sandbox, même avec seams actifs) — alignée
  sur la réalité ; type Function interdit lint → signatures typées
- VALIDATION : 603/603 (39 fichiers) · tsc 0 · eslint 0 · BUILD PROD OK
- VERDICTS AGENT 2 : B4-042 → TERMINÉ 100 % ; B5-052 → BLOQUÉ (appareil
  requis, volet contrat couvert) ; B2-021/B3-031/B4-040/B4-041/B5-050/
  B5-051 → VALIDATION 90 % confirmés (device requis)
- REGISTRE : TASKS.xlsx regen + validate exit 0 ; TASKS.md (Task 52 :
  19 terminées, à faire = INF-401 seule, bloquées = 3), CHANGELOG,
  AGENT2_STATUS (tableau validations + verdicts + remontées) mis à jour

Stage Summary:
- ROADMAP « BAoulé PHASE PILOTE » INTÉGRALEMENT LIVRÉE CÔTÉ AGENTS :
  B2 traduction · B3 moteur+évaluation · B4 orchestration+confirmations+E2E ·
  B5 façade+branchement · NORM-302 · DOC-306
- Tout ce qui reste exige un APPAREIL (B1-010, B2-021 latence, B3-031 smoke,
  B3-032 écoute natif, B5-052 smoke APK), une DÉCISION utilisateur
  (B3-033/034 GPU, INF-401 déploiement) ou une ACTION sécurité (SEC-402 PAT)

---
Task ID: 53
Agent: Super Z (Orchestrateur — AGENT 1, audit — dépôt /home/z/julaba)
Task: VOCAL-601 — audit vocal « vente rapide » (retour utilisateur : « j'ai l'impression qu'il casse »)

Work Log:
- Audit statique complet du parcours vocal VenteRapideModal, comparé point
  par point à voice-modal (chaîne à jour) → .ai/AUDIT_VOCAL_VENTE_RAPIDE.md
- CAUSE RACINE : la modale n'a jamais été migrée vers la chaîne multi-moteurs
- P0-1 : session STT = createSingleShotSTT (Web Speech brut) hors factory ;
  sur APK (WebView sans Web Speech) start() = no-op silencieux (stt.ts:92)
  → « J'écoute... » infini sans erreur ; gate isAnySTTAvailable() au lieu de
  canAttemptSTT() → vocal indisponible si Sherpa pas déjà chargé ;
  VoiceService (Task 32) et route Baoulé (B5-051) contournés
- P0-2 : unitPrice = product?.priceUnit || floor(amount/qty) (ligne 49) écrase
  le montant DICTÉ dès que le produit existe au stock (« tomates 2000 » avec
  priceUnit 500 → vente 500 FCFA annoncée+enregistrée) ; « X à Y » → extract
  Amount prend le prix unitaire comme total (3 tomates à 500 → 500 au lieu
  de 1500) ; vente rapide n'affiche pas la confirmation → faux montants
  directs en caisse
- P1 : race wake-word (cleanup du close-effect relance le listener à
  l'OUVERTURE — pause exécutée pendant l'await initSherpaModel → session
  créée après la pause → micro de fond actif pendant la modale) ;
  completeQuickSale fetch sans timeout (processing figé) + stock décrémenté
  avant verdict ; aucun watchdog d'écoute ; sessions STT dupliquées
  (abort jamais appelé avant recréation → fuite micro)
- P2 : intents non métier (« oui » → erreur texte vide + tataSpeak('') ;
  « stop » ne ferme pas ; navigation/consultation annoncés sans effet) ;
  confirmation trop ferme (toute erreur STT → « bonne journée » + close) ;
  result.synced ignoré ; dead code (pendingConfirmRef, state error,
  AMOUNT_PATTERNS) ; « Daccord » ×3 ; survente écrêtée en silence ;
  pas de barge-in ; bci ignoré (fr-FR figé)
- Registre : VOCAL-601 (audit, TERMINÉ) + VOCAL-602/603 (P0, A_FAIRE) +
  VOCAL-604 (P1) + VOCAL-605 (P2) — xlsx regen + validate (41 tâches) ;
  TASKS.md (Task 53 : section 6 audit, synthèse, ordre d'exécution) ;
  CHANGELOG
- ZÉRO code modifié (audit seul) — baseline 603/603 · tsc 0 · lint 0 inchangée

Stage Summary:
- Le « il casse » s'explique par 2 P0 prouvés au code : spinner infini sur
  APK (modale hors factory STT) et montants faussés par le prix catalogue
- Prochaines tâches boucle : VOCAL-602 + VOCAL-603 (P0, même fichier) →
  VOCAL-604 → VOCAL-605 ; confirmation smoke device du P0-1 (B1-010/B5-052)

---
Task ID: 54
Agent: Super Z (Orchestrateur — AGENT 1 — dépôt /home/z/julaba)
Task: VOCAL-602/603/604/605 — corrections audit vocal vente rapide (SANS build APK, demande utilisateur)

Work Log:
- VOCAL-602 : stt-factory.ts + startSmartSingleShotSTT (web+WebSpeech =
  création/start SYNCHRONES — activation utilisateur ; natif = factory
  async VoiceService→Sherpa ; web sans WebSpeech = onError explicite ;
  abort avant résolution = aucun démarrage) ; modale : porte canAttempt
  STT, watchdog 15 s, génération + abort avant toute nouvelle session
- VOCAL-603 : quick-sale.ts + planQuickSale (total = montant DICTÉ, prix
  unitaire en décours) + QuickSaleItem.total ; localIntent.ts : chiffres
  finaux AVANT mots (« trois sacs de riz 2000 » = 2000, plus 3) + « X à Y »
  sans devise = prix unitaire → total = X×Y (« 3 tomates à 500 » = 1500,
  plus 500 ; capture jusqu'à 2 mots intermédiaires, atQty ≤ 999) ;
  appliqué AUX DEUX modales (voice-modal.tsx:85 avait le même bug) ;
  annonce du montant réellement enregistré
- VOCAL-604 : wake-word.ts _paused (état — annule un start en vol, fixe
  les 4 modales) ; http.ts nouveau (fetchJsonWithTimeout extrait de
  conversation.ts, ré-export compat) ; completeQuickSale : fetch borné
  10 s, stock APRÈS verdict seulement, stockShort retourné ; modale :
  synced annoncé (« en attente de synchronisation »)
- VOCAL-605 : handleSale route oui (nouvelle écoute, fini l'erreur vide) /
  no+cancel (ferme) / navigation+back (ferme puis navigue — cast Screen
  Route) / consultation (total réel caisse-store) ; routeConfirmResponse
  dans confirmations.ts (bilingue, ré-analyse) ; erreur micro en confirm
  → clavier oui/non (vente déjà enregistrée — dite) ; toggle voix↔clavier
  préserve le contexte confirm ; dead code retiré (pendingConfirmRef,
  state error, AMOUNT_PATTERNS) ; « Daccord » → « D'accord » ×3
- Tests +25 : quick-sale.test.ts (11 : 4 scénarios audit §P0-2 + survente
  + timeout fake-timers + stock après verdict), start-smart-stt.test.ts
  (5), wake-word-pause.test.ts (3), confirmations.test.ts (+6)
  → 628/628 (42 fichiers) · tsc 0 · eslint 0 · BUILD PROD OK
- Registre : VOCAL-602/603/604/605 → VALIDATION 90 % (xlsx regen + validate,
  41 tâches) ; TASKS.md (Task 54 : synthèse 10 en validation, section 6,
  ordre d'exécution), CHANGELOG, AGENT1_STATUS
- Worklogs double écriture + commit + push (fetch préalable, PAT masqué)
- AUCUN build APK (demande utilisateur expresse)

Stage Summary:
- Les 2 P0 de l'audit sont corrigés et testés : plus de spinner infini sur
  APK (chaîne multi-moteurs + watchdog), plus de montant volé par le prix
  catalogue (dans les 2 modales) — + 2 P1 et 4 P2
- Reste pour VAL 100 % : smoke device (B1-010/B5-052) — notamment « vente
  rapide au micro » sur l'APK et montants dictés au stock existant

---

Task ID: 55
Agent: AGENT 1 (dev/archi)
Task: « assure toi que le mot de reveil est correctement implémenté » — vérification complète de la chaîne mot de réveil + corrections (VOCAL-606)

Work Log:
- Chaîne vérifiée de bout en bout : wake-word.ts → stt-factory (createSmartContinuousSTT — auto-relance après chaque résultat final OK) → wake-word-manager (montage auth + rôles OK, réveil = setVoiceAutoRecord + openVoiceModal OK) → 4 modales (pause/resume) → app-store (voiceEnabled && wakeWordEnabled)
- 4 défauts trouvés et corrigés (rapport .ai/AUDIT_MOT_DE_REVEIL.md) :
  - F1 (P1) : double resume à la fermeture de modale (body + cleanup d'effet) = deux startWakeWordListener concurrents → deux sessions dont une orpheline à l'écoute → compteur de génération _startGen dans startWakeWordListener (le supplanté avorte ce qu'il vient de créer) ; stop bump aussi la génération
  - F2 (P1) : resumeWakeWord ignorait le réglage wakeWordEnabled (fermer une modale rallumait le micro de fond désactivé) → setWakeWordEnabled(bool) nouvelle API pilotée par WakeWordManager (false au démontage/logout)
  - F3 (P1) : pauseWakeWord n'annulait ni le timer « retour à l'écoute » (10 s armé par une détection) ni l'état 'detected' — modale ouverte >10 s = micro de fond ressuscité en pleine vente → pause annule _resetTimer + état inactive depuis listening ET detected + garde _paused dans le timer ; chemin de récupération sans modale conservé (F3b testé)
  - F4 (P2) : stop (logout) pendant un start en vol → session zombie après logout → génération
- Cleanups conditionnels alignés (resume seulement si la modale ÉTAIT ouverte) : voice-modal.tsx, prod-voice-modal.tsx, open-caisse-modal.tsx (même motif audité VOCAL-604)
- Tests : +8 (wake-word-lifecycle.test.ts : F1/F2/F2b/F3/F3b/F4 + flux détection + faux positifs) ; beforeEach wake-word-pause.test.ts adapté à la nouvelle contract setWakeWordEnabled
- Registre : VOCAL-606 (VALIDATION 90 %, P1, parent VOCAL-601) → 42 tâches (xlsx regen + validate OK) ; TASKS.md (Task 55 : 11 en validation, section 6, ordre d'exécution), CHANGELOG, AUDIT_MOT_DE_REVEIL.md
- Validation : 636/636 (43 fichiers, +8) · tsc 0 · eslint 0 · build prod OK
- AUCUN build APK (demande utilisateur expresse)

Stage Summary:
- Le mot de réveil est maintenant un cycle de vie fiable : une seule session à tout instant (génération), le réglage coupé est respecté (plus de micro fantôme après fermeture de modale), la pause tue le timer de ré-armement (plus de micro de fond au milieu d'une vente vocale), logout sans session zombie
- Reste terrain : « Julaba » dit sur l'APK + vente vocale >10 s (rejoint B1-010/B5-052)
