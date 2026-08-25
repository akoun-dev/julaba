# Jùlaba Merchant App - Work Log

---
Task ID: 1
Agent: Main Orchestrator
Task: Build complete Jùlaba merchant application from scratch

Work Log:
- Analyzed existing Next.js 16 project structure (shadcn/ui, Prisma, Tailwind CSS 4)
- Designed and implemented Prisma schema with 7 models: Merchant, Product, Sale, SaleItem, Expense, CaisseSession, Tontine, TontineMember, VoiceLog
- Pushed schema to SQLite database
- Created Jùlaba brand theme in globals.css with identity color #C66A2C, soleil mode, dark mode, custom scrollbar, voice animations
- Built voice intent parser (localIntent.ts) with 25+ product vocab, French number parsing (0-999999), amount extraction, PIN parsing, 8 intent types
- Built Tata Nanti Lou TTS system (tata-tts.ts) with Web Speech Synthesis, beep sounds, haptic feedback
- Created 3 Zustand stores: app-store (auth, navigation, voice), caisse-store (session, cart, payment), stock-store (products, CRUD, 20 default products)
- Built 4 API routes: merchant, sales, expenses, caisse
- Built auth-screen.tsx: PIN 4 digits, voice recognition, numeric keypad, register/login flow
- Built home-screen.tsx: caisse du jour, quick actions, navigation tiles, low stock alerts, day summary modal, close day modal
- Built caisse-screen.tsx: full POS with product grid/list, cart sidebar, payment with bill breakdown, success modal, session management
- Built voice-modal.tsx: push-to-talk, STT integration, conversation history, intent confirmation flow
- Built bottom-bar.tsx: 5-tab navigation with floating voice button
- Delegated secondary screens to subagent: stock-screen, depenses-screen, ventes-screen, secondary-screens (9 screens)
- Fixed 6 lint errors: regex multiline, missing backtick, setState in effect, missing import, hoisted function, unused expression
- Assembled page.tsx with screen router and layout.tsx with Jùlaba metadata
- Clean lint pass (0 errors, 0 warnings)
- Dev server running on port 3000

Stage Summary:
- Complete merchant app with 15+ screens
- Voice-first design with STT/TTS integration
- Offline-first with localStorage persistence
- Mobile-first responsive design
- Soleil mode for outdoor readability
- French marché language support
- All code passes ESLint

---
Task ID: 2
Agent: Main Orchestrator
Task: Integrate logo/icon assets and add onboarding flow

Work Log:
- Copied 5 uploaded assets (icon-background.png, icon-foreground.png, icon-only.png, splash.png, splash-dark.png) to /public
- Updated layout.tsx metadata to use /icon-only.png as favicon and /icon-background.png as apple touch icon
- Added hasCompletedOnboarding state + completeOnboarding action to app-store (persisted via zustand)
- Created onboarding-screen.tsx: 6-step carousel with animated transitions, voice narration, progress dots, skip button
- Updated auth-screen.tsx to use real icon-only.png logo instead of the placeholder "J" circle
- Updated page.tsx to show OnboardingScreen before auth when hasCompletedOnboarding is false
- Verified full flow with Agent Browser: step navigation (forward/back/dot-click), skip, completion → auth transition, logo display
- Zero lint errors, zero console errors

Stage Summary:
- Onboarding 6 steps: Welcome, Voice, Features, Stats, Offline, Soleil mode
- Each step has gradient icon, title, subtitle, description
- Voice narration via Tata TTS on each step transition
- Animated slide transitions with progress dots
- "Passer l'introduction" skip link on all non-last steps
- Real Jùlaba icon used in onboarding, auth, and browser tab
- State persisted so onboarding only shows once

---
Task ID: 3
Agent: Main Orchestrator
Task: Add detailed voice narration to onboarding + demo test account

Work Log:
- Rewrote onboarding voice narrations: 6 detailed French descriptions (4-6 sentences each) read by Tata Nanti Lou
  - Welcome: Full app introduction, what Jùlaba does
  - Voice: Concrete example "Tomates deux mille», also depense/stock voice commands
  - Features: Caisse, Stock, Cahier de dépenses explained
  - Stats: End-of-day bilan, past sales comparison
  - Offline: Works without network, auto-sync
  - Soleil: Larger text, higher contrast for outdoor use
- Added speaking indicator ("Tata Nanti Lou parle..." with animated voice wave bars)
- Added "Réécouter" button to replay current step narration
- Added "Son activé/désactivé" toggle button
- Added seedDemoAccount() function that creates demo merchant on onboarding completion
- Added "Compte de démonstration" hint card on auth screen (Tél: 07 01 02 03 04 / Code: 1234)
- Verified: onboarding → skip → auth → enter demo phone → PIN 1234 → login as Maman Awa → home screen
- Zero lint errors, zero console errors

Stage Summary:
- Demo credentials: Phone `0701020304`, PIN `1234`, Name: Maman Awa
- Each onboarding step narrated ~5 seconds by TTS describing features in detail
- Voice controls: replay, mute/unmute, speaking indicator with wave animation
- Demo account seeded automatically when onboarding completes or is skipped

---
Task ID: 4
Agent: Main Orchestrator
Task: Fix STT unavailability error + add wake word "Julaba" + push-to-talk

Work Log:
- Created `src/lib/voice/stt.ts`: shared STT utility with `isSTTAvailable()`, `createSingleShotSTT()` (PTT), `createContinuousSTT()` (wake word)
- Created `src/lib/voice/wake-word.ts`: continuous background listener detecting "Julaba" (6 pronunciation patterns), debounce 5s, auto-pause/resume
- Added `wakeWordEnabled` + `toggleWakeWord` to app-store (persisted)
- Created `src/components/marchand/wake-word-manager.tsx`: invisible lifecycle component (start/stop on auth, react to toggles)
- Updated `auth-screen.tsx`: uses shared STT, shows Info banner when STT unavailable (no more error), hides voice buttons gracefully, added missing `useRef` import
- Updated `voice-modal.tsx`: uses shared STT, stops TTS before listening, pauses/resumes wake word, shows "Maintenez pour parler" + hint about wake word, graceful fallback when STT unavailable
- Updated `bottom-bar.tsx`: green/amber/gray dot on Tata button indicating wake word state (listening=green, detected=pulse, unavailable=amber, off=gray)
- Updated `home-screen.tsx`: Radio icon button in header to toggle wake word on/off (green=on, dimmed=off), only shown when STT available
- Updated `page.tsx`: renders `<WakeWordManager />` when authenticated
- Fixed critical bug: `useRef` missing from auth-screen imports
- Zero lint errors

Stage Summary:
- **STT graceful degradation**: Info banner replaces error message, voice buttons hidden when browser doesn't support STT
- **Wake word "Julaba"**: continuous background STT, detects 6 pronunciation variants, opens voice modal on detection, says "Oui, je vous écoute !", 5s debounce, pauses during voice modal
- **Push-to-talk**: hold Mic button to record, release to send (single-shot STT)
- **State management**: `wakeWordEnabled` toggle persisted, starts 2s after login, stops on logout
- **Visual indicators**: green dot (listening), pulsing dot (detected), amber (unavailable), header Radio toggle button

---
Task ID: 5
Agent: Main Orchestrator
Task: Fix session management — 6 critical bugs identified and resolved

Work Log:
- **Audit**: Read all stores (app-store, caisse-store, stock-store), page.tsx, auth-screen, voice-modal, wake-word-manager, home-screen, caisse-screen, bottom-bar
- **Bug 1 (CRITICAL)**: `currentScreen` was NOT in the `partialize` list of app-store persist config. After page refresh, `isAuthenticated` loaded as `true` from localStorage but `currentScreen` reset to default `'auth'`. Result: user sees AuthScreen with BottomBar + VoiceModal overlaid.
  - Fix: Added `currentScreen` to partialize list
- **Bug 2 (CRITICAL)**: No hydration guard. During SSR, Zustand defaults render (onboarding=false, isAuthenticated=false). After client hydration, localStorage values load. This caused flash of wrong screen.
  - Fix: Added `useHydrated()` hook with `requestAnimationFrame` guard in page.tsx. Shows minimal branded loading spinner until stores rehydrate.
- **Bug 3 (CRITICAL)**: ScreenRouter had no auth guard. When `currentScreen='auth'` AND `isAuthenticated=true`, it rendered AuthScreen with BottomBar.
  - Fix: Added `onRehydrateStorage` callback that corrects `currentScreen` on load (auth→home if authenticated, anything→auth if not). Added useEffect safety net in ScreenRouter.
- **Bug 4**: `todaySales`, `todayExpenses`, `todaySalesCount` in caisse-store were persisted but never reset when day changed. A user opening the app the next day would see yesterday's totals.
  - Fix: Added `todayDate` field (ISO date string), added `onRehydrateStorage` in caisse-store that resets stats when date differs. Also clears orphaned cart if session is closed.
- **Bug 5**: `hasActiveCart` was in app-store (persisted) but `setHasActiveCart` was called from caisse-screen destructure of caisse-store (which didn't have it). Two sources of truth for cart state.
  - Fix: Moved `hasActiveCart` and `setHasActiveCart` to caisse-store (the single source of truth for cart). Removed from app-store.
- **Bug 6**: Dev log showed compile error `isSTTAvailable` imported from wrong module (`wake-word` instead of `stt`). Current code is correct — was a stale hot-reload artifact.

Verification (Agent Browser):
- Login flow: onboarding skip → phone 0701020304 → PIN 1234 → confirm → Home Screen "Maman Awa" ✓
- Session persistence: reload on Home → still on Home with BottomBar, no flash ✓
- Navigation persistence: navigate to Stock → reload → still on Stock with BottomBar ✓
- Zero console errors throughout all tests ✓
- Zero lint errors ✓

Stage Summary:
- All 6 session management bugs fixed
- Session (auth + navigation) fully persists across page reloads
- No flash of wrong screen on hydration (loading spinner shown briefly)
- Daily stats auto-reset at midnight
- Cart state has single source of truth in caisse-store
- `onRehydrateStorage` callbacks in both stores ensure consistency on load

---
Task ID: 6
Agent: Main Orchestrator
Task: Replace voice modal bottom sheet with centered overlay effect

Work Log:
- Analyzed current voice-modal.tsx: was a bottom sheet (slides up from bottom) with drag handle, header, close button, feedback area, PTT button
- Analyzed bottom-bar.tsx: already calls `openVoiceModal()` on mic button click — no change needed
- Rewrote voice-modal.tsx: removed all bottom sheet elements (drag handle, header bar, panel structure)
- New design: centered floating overlay with `backdrop-blur-sm` + `bg-black/50`
- Content: feedback text above, large PTT mic button (w-24 h-24) centered, "Tata Nanti Lou" label below
- Glass-effect mic button: `bg-white/15 backdrop-blur-sm` in idle, `bg-[#C66A2C]` with triple glow rings when listening
- Close: small circular X button top-right of floating content + tap backdrop to dismiss
- All voice logic (STT, intent processing, confirmation flow, auto-close) preserved unchanged
- Removed unused imports (Volume2, Radio)

Verification (Agent Browser):
- Click "Tata" button in BottomBar → centered overlay appears over blurred backdrop ✓
- Shows "Maintenant pour parler", example text, mic button, "Tata Nanti Lou" label ✓
- Click X button → modal dismisses, returns to home screen ✓
- Zero console errors ✓
- VLM analysis confirms: "centered floating overlay, not a bottom sheet" ✓

Stage Summary:
- Voice modal is now a centered overlay with blur backdrop effect
- No bottom sheet, no drag handle, no compact panel
- Large floating mic button with pulsing glow rings when recording
- Clean, minimal design focused on the recording interaction

---
Task ID: 7
Agent: Main Orchestrator
Task: PTT (push-to-talk) directly on bottom bar mic button

Work Log:
- Added `voiceAutoRecord: boolean` + `setVoiceAutoRecord` and `voiceStopRequested: boolean` + `requestVoiceStop` to app-store (not persisted, transient signals)
- Rewrote bottom-bar.tsx: mic button now has `onMouseDown/onTouchStart → handleMicDown` and global `mouseup/touchend → handleMicUp`
  - `handleMicDown`: sets `pressingRef=true`, calls `setVoiceAutoRecord(true)` + `openVoiceModal()`
  - `handleMicUp`: guard on `pressingRef`, then `requestVoiceStop()`
  - Global window listeners catch releases that leave the button
  - `handleTabClick` returns early for 'voice' tab (no click navigation)
- Rewrote voice-modal.tsx signal handling:
  - Stop effect (declared FIRST): consumes `voiceStopRequested`, stops STT if listening, or sets `pendingStopRef=true` if too-fast release
  - Start effect (declared SECOND): consumes `voiceAutoRecord`, checks `pendingStopRef` (skips if stop already arrived), otherwise `requestAnimationFrame(() => startListening())`
  - Added `onEnd` callback to STT: resets to idle when STT ends without result (no-speech)
  - Component re-mounts on each open via `voiceModalKey` (fresh state)
- Fixed lint errors: no synchronous setState in effects (rAF for start, STT callback for idle reset)

Verification:
- Zero lint errors ✓
- Zero console errors ✓
- Click Tata → modal opens as centered overlay ✓
- Close button dismisses ✓
- Proper handling of fast-click (instant down+up) via pendingStopRef pattern ✓

Stage Summary:
- Bottom bar mic button IS the PTT trigger: press to open modal + start recording
- Release to stop recording and process
- Fast tap (instant release) opens modal in idle state (not stuck in listening)
- Modal's own PTT button still works for re-recording / confirmation flow
- On real touch devices: hold mic → overlay appears in listening state → release → transcript processes

---
Task ID: 8
Agent: Main Orchestrator
Task: Fix voice auth — 'Ou dites votre nom' and voice PIN entry stuck

Work Log:
- Diagnosed 3 root causes in auth-screen.tsx:
  1. **Missing `onEnd` callback**: STT `singleShotSTT` silently ignores 'no-speech' error. Without `onEnd`, `isListening` stays true forever → button stuck on "J'écoute..."
  2. **No 'no-speech' feedback**: User taps mic, doesn't speak fast enough, STT times out silently
  3. **Stale closures**: `startListening` useCallback had `handleVoiceResult` in its logic but not in deps → could use stale state values
- Rewrote auth-screen.tsx fixes:
  - Added `onEnd` callback to both STT sessions: `setIsListening(false)` as safety net
  - Added explicit `onError('no-speech')` handling: TTS says "Je n'ai rien entendu" + error message
  - Added `onError('aborted')` silent handling
  - Added `disabled={isListening}` on voice buttons to prevent double-tap
  - Added refs for all mutable state (pin, phone, firstName, step, mode, confirmPin, voiceAttempts) to avoid stale closures in async STT callbacks
  - Extracted `doLogin(phoneVal, pinVal, nameVal)` that reads from refs, used by both voice confirm and button confirm
  - Improved name extraction regex: handles "m'appelle Awa", "Awa", strips filler words ("bonjour", "oui", "merci")
  - Added `tataStop()` before starting listening to avoid TTS/STT conflict
  - Added STT cleanup on unmount

Verification:
- Zero lint errors ✓
- Zero console errors ✓
- Auth screen renders correctly with phone input + voice button ✓
- PIN keypad renders with mic button ✓
- Click voice button → isListening activates → STT ends → isListening resets (not stuck) ✓

Stage Summary:
- Voice auth no longer gets stuck in listening state
- 'no-speech' gives clear feedback (TTS + error message)
- Stale closure bugs eliminated with ref pattern
- Name extraction handles common French speech patterns

---
Task ID: 9
Agent: Main Orchestrator
Task: Fix 'Ou dites votre nom: Erreur micro' — proactive mic check

Work Log:
- Diagnosed root cause: `sttAvailable` only checked if `webkitSpeechRecognition` API exists (true in Chromium sandbox), but actual mic hardware is absent → STT `start()` immediately errors
- Changed `sttAvailable` from `useState(initializer)` (constant) to mutable `useState(setter)` so it can be updated at runtime
- Added `micChecked` state + useEffect on mount: calls `navigator.mediaDevices.getUserMedia({audio:true})` to probe actual mic access
  - If `mediaDevices` not available: sets `sttAvailable=false` + `micChecked=true`
  - If `getUserMedia` succeeds: releases stream immediately, sets `micChecked=true` (voice button shown)
  - If `getUserMedia` fails (permission denied / no device): sets `sttAvailable=false` + `micChecked=true` (voice button hidden)
- Updated error handler: ALL non-'no-speech'/non-'aborted' errors now set `setSttAvailable(false)` to prevent repeated failures
  - Specific messages: `not-allowed` → "Micro non autorisé", `audio-capture` → "Aucun micro détecté", other → "Micro indisponible"
- Updated voice button JSX: now requires both `sttAvailable && micChecked` to show (previously just `sttAvailable`)
- Updated N/A message: shows MicOff icon + "Vérification du micro..." while checking, "Micro non disponible. Utilisez le clavier." after check fails
- Updated PIN pad mic button: added `!micChecked` guard + shows Mic icon (not MicOff) when available
- Added `!micChecked` guard to `startListening` callback

Verification (Agent Browser):
- Auth screen: voice button correctly hidden, shows "Micro non disponible. Utilisez le clavier." ✓
- PIN pad mic button correctly disabled ✓
- Login flow works: phone → PIN → confirm → home screen ✓
- Zero console errors ✓
- Zero lint errors ✓

Stage Summary:
- Voice button only shown after mic hardware is probed and confirmed available
- No more "Erreur micro" — graceful degradation when mic absent
- On real devices with mic: button shows after brief "Vérification..." phase
- On sandbox/servers without mic: N/A message shown immediately