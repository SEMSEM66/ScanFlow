# AGENTS.md — Development Rules for ScanFlow

This document contains persistent rules, operational constraints, and workflow guidelines for all AI agents working on **ScanFlow**.

---

## 1. Project Identity & Objective
- **App Name:** ScanFlow
- **Platform:** iOS-only document scanner app (offline-first MVP, zero trackers, zero ads, no accounts, no watermarks).
- **Core Purpose:** Capture, crop, filter, organize, and export multi-page documents (similar in purpose to CamScanner, but with its own clean iOS aesthetic).
- **Technology Stack:**
  - Expo (latest stable SDK)
  - React Native
  - TypeScript (strict mode enabled)
  - expo-router (file-based navigation)

---

## 2. Environment & Execution Constraints
- **Host OS:** Windows with PowerShell.
- **Hardware:** NO Mac and NO iOS simulator available.
- **Testing Target:** Real physical iPhone via **Expo Go** (`npx expo start`; fallback with `--tunnel` when LAN fails).
- **Expo Go Constraint (Crucial):**
  - Phase 1 must use **ONLY** libraries that run inside the standard **Expo Go** app.
  - **NO** custom native modules, **NO** native code requiring development builds (`expo run:ios` or `eas build`) for Phase 1.
  - If a feature is not supported in Expo Go, do not guess or silently switch; explicitly inform the user and implement a verified Expo Go fallback.
  - `@shopify/react-native-skia` is part of Expo Go and is used for the perspective warp and scan shaders (v1.2.0). Install native packages only via `npx expo install <pkg>` so versions match the SDK.
- **Shell & Tooling:**
  - Use **PowerShell-compatible** commands only.
  - Never use bash-only syntax (e.g., `&&`, `export FOO=bar`, `/dev/null`) in scripts or terminal commands.
  - Repository must maintain `.gitattributes` with `* text=auto eol=lf`.
  - If a terminal command is blocked (e.g. PowerShell ExecutionPolicy), explain the exact command for the user to run instead of modifying system-wide settings.
  - **Never** run destructive commands (never delete directories outside the project, never run `git reset --hard` or force push).
  - **Ask** before installing any global package or tool.

---

## 3. Git & Version Control Rules
- **Remote Repository:** Always verify `git remote -v`.
- **Branch:** Work directly on `main`.
- **Commit Style:** Small, focused commits using **Conventional Commits**:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `docs:` for documentation updates
  - `refactor:` for code refactoring
  - `chore:` for tooling or config updates
- **Push Cadence:** Push after every commit. If push fails due to git credentials/authentication, stop immediately and explain what the user needs to configure.
- **Safety:** Never commit secrets, `.env` files, or binary artifacts that don't belong in git. Never rewrite git history.
- **Releases:** bump `version` in `package.json`, `app.json` and the two root entries of `package-lock.json` together and add a `## [x.y.z]` section to `CHANGELOG.md`. Every push to `main` builds the IPA (`.github/workflows/build-ipa.yml`) and publishes it as GitHub release `v<package.json version>` with that changelog section as release notes; pushing again without a bump updates that release.

---

## 4. Design & UI Guidelines
- **Visual Design:** Strictly mirror the design mockups in `/design`:
  - `bearbeiten.png` (Main Documents Library list/grid, search, folder pills, bottom tab bar with floating blue scan button).
  - `Scannen.png` (Camera interface, cyan framing corner guides, flash toggle, page counter stack, manual/auto toggle, shutter button).
  - `Dokumente.png` (Document page preview, filter selector strip, bottom actions: rotate, crop, delete, add page).
  - `Exportieren.png` (Export bottom sheet, PDF/JPG toggle, quality selector, estimated size, share button).
- **Theme Tokens:**
  - Extract all design tokens (colors, typography, spacing, border radii, shadows) into `src/theme`.
  - Must support both **Light Mode** and **Dark Mode**.
  - Default background: warm ivory/off-white (`#FBF9F5` / `#F7F5F0`).
  - Primary accent: vibrant iOS blue (`#0066FF`).
- **Localization (i18n):**
  - German (default locale) and English.
  - Implemented cleanly via `expo-localization` and a lightweight typed i18n layer.

---

## 5. Workflow & Feature Progression
Development proceeds in small, verifiable steps with real persisted storage from the beginning:

- **Phase 0: Foundations & Storage:**
  - Expo setup (latest stable SDK), `expo-router`, TypeScript strict mode.
  - `src/theme` (light/dark design tokens matching `/design`), `src/i18n` (German default & English).
  - Storage & SQLite Repository Layer (`src/db`, `src/services`): SQLite schema for folders, documents, and pages (`expo-sqlite`), local file manager (`expo-file-system`). Initial folder seeds. Real persisted data from day one (no mock data).
  - Minimal root tab layout to verify app runs in Expo Go.
- **Step 1: Library:** 2-column grid and list of documents (thumbnail, title, page count, date), search bar, folder categories (create, rename, delete, move), sorting, empty state, backed directly by `DocumentRepository`.
- **Step 2: Scan & Permissions:** `expo-camera` with flash toggle, shutter button, page counter badge, multi-page capture mode; photo gallery import via `expo-image-picker`. Includes camera & gallery permission dialogs (DE/EN) with graceful "denied" state UI.
- **Step 3: Crop:** 4 draggable corner handles. Verify Skia warp in Expo Go; if unsupported, use bounding-box crop with `expo-image-manipulator` and notify user.
- **Step 4: Filters per page:** Original, Auto-enhance, Black & White, Grayscale, Magic Color; rotate left/right.
- **Step 5: Page editor:** Reorder pages, delete page, retake page, add pages, rename document.
- **Step 6: Export:** Multi-page PDF generation (A4, quality setting: Low/Medium/High) via `expo-print`, JPG export per page, system share sheet via `expo-sharing`.
- **Step 7: Settings & App Lock:** Language switcher (DE/EN), appearance toggle (System/Light/Dark), default export quality, app lock via `expo-local-authentication` + `expo-secure-store` with permission explanation (DE/EN) and denied-case UI.

---

## 6. Verification & Quality Gates
- **After every step:**
  1. Run TypeScript check: `npx tsc --noEmit`. Fix any typing errors immediately.
  2. Run linter (`npm run lint`): fix any errors you introduce (0 errors since v1.4.0; the remaining unused-variable warnings are tracked in ROADMAP Phase D).
  2a. Run tests: `npm run test:imaging` (fast) and `npm test` (full, incl. headless Skia renderer, ~5–7 min) when touching `src/imaging`, `src/db` or export; `npm run test:security` when touching `src/security`, `AuthService`, `AppLockOverlay`, `LockScreen`, `PinSetupModal`, `PrivacyService` or sharing.
  3. Update `docs/ROADMAP.md` (check off completed items).
  4. Update `CHANGELOG.md`.
  5. Commit and push to `main`.
- **iPhone Test STOP Gates (STOP and wait for user feedback):**
  - **STOP 1 (after Phase 0):** App successfully launches in Expo Go, loads DB, displays base layout.
  - **STOP 2 (after Step 2 - Scan):** Test camera permissions, burst capture, page counter, and gallery import on physical iPhone.
  - **STOP 3 (after Step 3 - Crop):** Test 4 draggable corner handles and crop on physical iPhone.
  - **STOP 4 (after Step 4 - Filters):** Test filter switching and rotation on physical iPhone.
  - **STOP 5 (after Step 6 - Export):** Test PDF/JPG generation and iOS share sheet on physical iPhone.

---

## 7. Out of Scope for Phase 1 (Keep Architecture Ready)
- OCR (text recognition) (planned: ROADMAP Phase C)
- Digital signatures (e-signature)
- ID-card scanning mode
- QR code scanner
- Live edge overlay / auto-capture in ScanFlow's *own* camera (`app/scan.tsx`). Live detection and auto-capture are provided by the iOS document scanner since v1.3.0 (ROADMAP Phase B).
- Cloud sync & user accounts
- Subscriptions / In-App Purchases

---

## 8. Imaging Pipeline Rules (since v1.2.0)
See `docs/ARCHITECTURE.md` for details.
- `src/imaging/` is **pure TypeScript**: no React, no Expo imports, no file IO. Skia is injected (`PageRenderer(Skia)`) so the same code runs in the app and in Node tests. App integration lives in `src/services/ImagePipelineService.ts` / `PageRenderService.ts`.
- **Non-destructive editing:** never overwrite `original_uri`. Edits are page state (`corners`, `rotation`, `filter`, `adjustments`, `page_format`) and are rendered on demand. Previews are caches.
- **Keep in sync:** `tools/prototype/enhance_prototype.py` ↔ `src/imaging/background.ts` / `filters.ts` ↔ `ENHANCE_SKSL` in `shaders.ts` ↔ `enhancePixelReference()` (CPU reference). The renderer tests compare GPU vs CPU (±2).
- **Bump `RENDER_VERSION`** (`src/imaging/pageState.ts`) whenever rendered output changes, so cached previews are regenerated.
- **Schema changes** only via a new step in `src/db/migrations.ts` (`SCHEMA_VERSION` + 1, transactional) with a test in `__tests__/migrations.test.ts`. Never edit an existing migration step.
- **Memory:** large images go through the serial queue in `ImagePipelineService`; never decode several full-resolution photos in parallel.
- **Acceptance numbers** (paper ≥ 245, gradient ≤ 8, border p1 ≥ 235, text ≤ 70, detection ≤ 2 %) must stay green; do not loosen thresholds without documenting why in `docs/ARCHITECTURE.md`.
- Tests import Jest globals from `@jest/globals` (TS 6 `types: []`); Node-only helpers use `/// <reference types="node" />`.

---

## 9. Scan Flow Rules (since v1.3.0)
See `docs/ARCHITECTURE.md` → "Scan flow".
- **Every scan entry point** (FAB, empty state, "Weitere Seiten hinzufügen", add page, retake) calls `useScanner().scan(target)` / `importFromLibrary(target)` from `src/components/ScannerProvider.tsx`. Do not `router.push('/scan')` directly – the provider decides between the iOS document scanner (default) and the ScanFlow camera (setting / fallback).
- **Storing pages** from any source goes through `saveScan()` (`src/services/ScanImportService.ts`): `detect: false` for iOS scanner pages (already cropped), `detect: true` for photos. It handles new document / append / retake, temp-file cleanup and the scan notice for the document screen.
- **Native presentation timing:** the iOS scanner and the photo picker must only be presented when no modal or alert is animating (alert → short delay, RN `Modal` → `onDismiss`). Otherwise UIKit drops the presentation and the scan promise never settles.
- Temporary scan files are deleted only via `storageService.deleteTempFile()` (restricted to the cache directory); stored page files only via the repository.
- The iOS scanner's UI language comes from `CFBundleLocalizations` in `app.json` (de, en) – keep it when adding languages.

---

## 10. Security Rules (since v1.4.0)
See `docs/ARCHITECTURE.md` → "App lock & security".
- **Never lock on `inactive`.** iOS reports `inactive` for the Face ID prompt, Control Center, Notification Center and system alerts – the app is still on screen. Lock decisions belong in the pure state machine `src/security/lockPolicy.ts` (with tests in `__tests__/security.test.ts`), not in components.
- **Never unlock without a check.** Only a `success` from `authService.authenticateOwner()` / `authenticateBiometric()` or `{ status: 'ok' }` from `verifyPinCode()` may unlock. Every error, cancel or missing method keeps the app locked; unreadable settings count as "lock on" (fail closed).
- **Keep the app mounted.** `AppLockOverlay` always renders its children; the lock screen is an overlay in `FullWindowOverlay`. Never replace or unmount the navigation tree to hide content.
- **PINs only through `AuthService`:** `setPinCode()` / `verifyPinCode()` / `removePinCode()`. Never store, log or compare a PIN elsewhere; never weaken the record format (`src/security/pinHash.ts`), the iteration count or the attempt limit (`lockout.ts`) without updating the tests and `docs/ARCHITECTURE.md`. Changing the format needs a new version prefix (`v3$…`) and an upgrade path for existing records.
- **Secrets only in the Keychain** (`expo-secure-store`) with the *this-device-only* classes from `AuthService` (`CONFIG_OPTS`, `SECRET_OPTS`) – never in SQLite, AsyncStorage, files or logs.
- **With a ScanFlow PIN, the device passcode must not unlock ScanFlow** (`disableDeviceFallback: true`, fallback → PIN pad).
- **Exported files are temporary:** write them only below `storageService.exportDir` (one folder per export) and delete them after sharing (`exportService.shareDocument()` / `discardExport()`). Do not declare a share type whose preferred extension differs from the file's extension (expo-sharing would stage a hard-linked copy).
- **Honest wording:** do not claim encryption, "secure wiping" or "zero trace" the app does not provide. The app lock protects the UI; files are protected by iOS Data Protection (device passcode).
- **Tests for security code:** pure logic goes into `src/security/` (no Expo imports) with unit tests; service behaviour is tested with mocked `expo-secure-store` / `expo-local-authentication` (`__tests__/authService.test.ts`).
