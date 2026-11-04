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
  - If a feature is not supported in Expo Go (e.g. `@shopify/react-native-skia` perspective warp), do not guess or silently switch; explicitly inform the user and implement the verified Expo Go fallback (such as `expo-image-manipulator` bounding-box crop).
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
  2. Run linter: fix any errors.
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
- OCR (text recognition)
- Digital signatures (e-signature)
- ID-card scanning mode
- QR code scanner
- Automatic computer-vision edge detection
- Cloud sync & user accounts
- Subscriptions / In-App Purchases
