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
- **Expo Go & Native Code Policy (Updated for V2 Program):**
  - `@shopify/react-native-skia` is part of Expo Go and is used for the perspective warp and scan shaders (v1.2.0). Install native packages only via `npx expo install <pkg>` so versions match the SDK.
  - **Native code is allowed** (Swift in `modules/scanflow-ocr` or a second local module, config plugins, native Expo packages) under these strict conditions:
    1. Each addition starts with a documented spike (`docs/spikes/<name>.md`) on a feature branch with CI proof before UI is built on it.
    2. Keep Swift small, memory-safe (`autoreleasepool`), and off the main/JS thread.
    3. **The app must never crash in Expo Go:** use feature detection (like `ocrService.available` via `requireOptionalNativeModule`) and hide or clearly explain unavailable features in Expo Go.
    4. List every native addition in `docs/ARCHITECTURE.md`.
  - **Strictly Forbidden (Without Explicit User Approval):** analytics, crash-reporting or ad SDKs, user accounts, third-party servers, uploading user documents, tracking, anything that sends user data off the device, or anything that costs money.
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
- **Branch:** Small changes directly on `main`. Larger phases on a feature branch (`feat/<phase>`), pushed while working (pushes to other branches build nothing), then fast-forward merged into `main` and pushed once → exactly one IPA build per release (the macOS CI minutes are limited).
- **Commit Style:** Small, focused commits using **Conventional Commits**:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `docs:` for documentation updates
  - `refactor:` for code refactoring
  - `chore:` for tooling or config updates
- **Push Cadence:** Push after every commit. If push fails due to git credentials/authentication, stop immediately and explain what the user needs to configure.
- **Safety:** Never commit secrets, `.env` files, or binary artifacts that don't belong in git. Never rewrite git history.
- **Releases:** bump `version` in `package.json`, `app.json` and the two root entries of `package-lock.json` together and add a `## [x.y.z]` section to `CHANGELOG.md`. Every push to `main` builds the IPA (`.github/workflows/build-ipa.yml`) and publishes it as GitHub release `v<package.json version>` with that changelog section as release notes; pushing again without a bump updates that release. Manual runs on other branches only build the IPA artifact (no release).

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
- **After every step / milestone:**
  1. Run TypeScript check: `npx tsc --noEmit`. Fix any typing errors immediately.
  2. Run linter (`npm run lint`): 0 errors, 0 warnings required.
  3. Run corner token check: `npm run check:corners` (and `npm run check:network` once added in M6).
  4. Run tests: `npm run test:imaging`, `npm run test:security`, `npm run test:ocr`, and `npm test` (full suite incl. headless Skia renderer before merging a milestone). New tests are required for all new pure logic and DB migrations.
  5. Update `docs/ROADMAP.md` (check off completed items and update the "Next steps" handoff section at the end of every session).
  6. Update `CHANGELOG.md`, `README.md`, and `docs/ARCHITECTURE.md`.
  7. Work on a feature branch per milestone (`feat/<name>`), push there (builds nothing), and fast-forward merge to `main` only after the user's STOP confirmation → exactly one IPA build per milestone.
- **Verification Honesty:**
  - Every claim in docs and store text must be true and marked as `verified by tests`, `verified in CI log`, or `UNVERIFIED (needs iPhone)`. Never claim device behavior was verified unless the user tested it on their iPhone.

---

## 7. V2 Program Scope (v1.9.0 → v2.0.0-rc) & Strict Prohibitions
The V2 program takes ScanFlow from v1.8.0 to a v2.0.0 release candidate ready for TestFlight and App Store submission (`docs/ROADMAP.md` → Phase V2):
- **Positioning:** *"The uncompromising offline document scanner and PDF toolkit for iPhone. 100% on-device, no account, no ads, no watermarks, no tracking."* (DACH market first: German default, English second).
- **Milestones:**
  - **M0 – Foundations (v1.9.0):** `src/entitlements` (`FeatureKey`, `isUnlocked`), i18n DE/EN parity test, native-spike template (`docs/spikes/_template.md`).
  - **M1 – PDF Toolkit (v1.9.0):** Import PDFs & images from Files / "Open in ScanFlow" (200 dpi serial PDF rasterization via PDFKit + OCR), Library multi-select (move, delete, merge, batch ZIP/PDF export), document merge & page split/extract, password-protected PDF export via PDFKit with verification.
  - **M2 – Capture Modes & Marking (v1.10.0):** ID-card front/back mode on one A4 page at true scale (85.6 × 54 mm) with optional purpose watermark, QR/barcode + EPC/GiroCode scanner in *Werkzeuge*, non-destructive visual signatures & page annotations (schema v4).
  - **M3 – Organization & Automation (v1.11.0):** 30-day Trash (*Zuletzt gelöscht*), Favorites & Tags, deterministic smart naming templates, full-library ZIP Backup & Restore via Files picker. (No WebDAV/SMB clients.)
  - **M4 – iOS Integration (v1.12.0):** Haptics (`expo-haptics`), Accessibility & AA contrast audit + test, Home Screen Quick Actions (`expo-quick-actions`), and time-boxed P2 spikes (App Intents/Shortcuts, Lock Screen Widget, Share Extension).
  - **M5 – Monetization (v1.13.0):** `docs/MONETIZATION.md` STOP gate first; StoreKit 2 on-device entitlements (no third-party tracking SDKs), fair paywall, cached offline entitlement state, `expo-store-review` after 3rd export.
  - **M6 – Compliance, Legal & Store Package (v2.0.0-rc):** `ios.privacyManifests`, `ITSAppUsesNonExemptEncryption`, localized permission strings, `npm run check:network`, in-app legal/license screens, and complete `docs/store/` + `tools/store-screenshots/` package.
  - **M7 – Release Pipeline (`docs/RELEASING.md`):** EAS Build/Submit vs. GitHub Actions signing comparison, configuration, and step-by-step App Store Connect / TestFlight guide.
- **Still Strictly Out of Scope / Forbidden:**
  - Analytics, crash-reporting or ad SDKs
  - User accounts or cloud servers operated by us/third parties
  - WebDAV / SMB network clients
  - Live edge overlay in ScanFlow's *own* fallback camera (`app/scan.tsx`) – live edge detection is provided by the iOS VisionKit scanner.

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
- **Native presentation timing:** do not start a scanner, photo picker, prompt, or another sheet while a native dismissal is animating. Use RN `Modal.onDismiss` for page-editor handoffs; native action sheets have no dismissal callback, so `useNativeMenu` defers follow-up presentations. Export keeps its form sheet open and presents sharing above it. Verify all handoffs on an iPhone.
- **Native-first sheets and menus:** use native form sheets and system menus where possible. Do not add custom backdrops, shadows, or sheet corner radii over native sheets. Protect active saves and exports from dismissal, and preserve export cleanup and OCR-hold lifecycle.
- **Shapes:** use `src/theme` corner tokens/helpers and shared UI primitives, not direct border radii. Compute concentric inner radii and capsules from actual sizes; use `squirclePath` for Skia. Run `npm run check:corners` as a quality gate. Use SF Symbols via `Icon`; use hairline borders. Never place shadows on clipping views.
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

---

## 11. Text Recognition Rules (since v1.5.0)
See `docs/ARCHITECTURE.md` → "Text recognition, search & searchable PDF".
- **Only through `ocrService`** (`src/services/OcrService.ts`). Screens never import `modules/scanflow-ocr` directly. Hide or disable OCR UI when `ocrService.available` is false (Expo Go) – nothing else may depend on OCR.
- **Pure logic in `src/ocr/`** (no React / Expo imports) with unit tests: model, `ocrKey()`, normalization, snippets, storage format, Vision conversion, PDF text layer, queue. SQL of the search and of `page_text` lives in `src/db/textSearch.ts` and is tested against real SQLite (`__tests__/textSearch.test.ts`).
- **Coordinates:** `OcrBox` is normalized (0…1) on the rendered page, origin top-left. Vision returns origin bottom-left – convert only in `src/ocr/vision.ts`.
- **Staleness:** text belongs to `ocrKey()` (original + corners + rotation + `OCR_VERSION`). Stale text must never be shown, searched as current or written into a PDF. Bump `OCR_VERSION` (and update the pinned key test) when the recognition setup or the OCR image changes; filter, adjustments and page format do not invalidate text.
- **Search consistency:** `search_text` is always `searchTextOf(text)` and query words always go through `normalizeForSearch()` – change both together and keep the tests green.
- **Never block the user:** recognition runs in the background, one page at a time, only in the foreground, via the serial image queue (`imagePipeline.renderForOcr()`, temp files in `storageService.ocrTempDir`, deleted afterwards) and paused during exports (`ocrService.hold()`). Failures leave the page without text (limited retries); they never break scanning, editing or exporting.
- **Privacy:** recognized text is user data like the pages – stored only in the local SQLite database, never logged, never sent anywhere. Turning OCR off must offer to delete the text.
- **PDF layer:** invisible text only (render mode 3) exactly over the words; the visible page image is never changed.
