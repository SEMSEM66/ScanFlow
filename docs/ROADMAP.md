# ScanFlow Implementation Roadmap & Checklist

This roadmap outlines the complete implementation plan for **ScanFlow**, an offline-first iOS document scanner built with Expo (latest SDK), React Native, TypeScript (strict), and expo-router.

---

## 🎯 Architectural Principles & Expo Go Constraints

1. **Expo Go Only:** All dependencies and APIs must run in standard Expo Go without custom native build steps (`npx expo run:ios`).
2. **Offline-First & Persistent Data From Day One:** All files stored in app container via `expo-file-system`; all metadata and folder structures managed in SQLite via `expo-sqlite`. No mock data.
3. **Repository Pattern:** UI layers never directly invoke raw file or database operations; all interactions pass through typed services (`StorageService`, `DocumentRepository`, `FolderRepository`, `ImagePipelineService`, `PageRenderService`, `ExportService`). *(v1.2.0: `FilterService` was replaced by the Skia pipeline in `src/imaging` + `ImagePipelineService`.)*
4. **Design Accuracy:** Pixel-accurate replication of design screenshots in `/design` (`bearbeiten.png`, `Scannen.png`, `Dokumente.png`, `Exportieren.png`).
5. **Strict Typing:** 100% TypeScript with `"strict": true`; no untyped `any`.
6. **Commit & Push Cadence:** Commit with Conventional Commits and push to `main` after every single step.

---

## 🚦 Physical iPhone Expo Go Test Gates (STOP Rules)
Development pauses at each of these 5 checkpoints for physical verification on your iPhone:
1. **🛑 STOP 1 (After Phase 0):** Verify app launches cleanly in Expo Go, initial SQLite database is seeded, design tokens render, and navigation is functional.
2. **🛑 STOP 2 (After Step 2 - Camera Scan & Permissions):** Verify camera feed, permission prompts (including denied UI), multi-page burst capture, page counter badge, and gallery import.
3. **🛑 STOP 3 (After Step 3 - Interactive Crop):** Verify 4-corner draggable handles, magnifying loupe, and image cropping.
4. **🛑 STOP 4 (After Step 4 - Filters):** Verify live filter rendering (Original, Auto, B&W, Grayscale, Magic Color) and 90° rotation.
5. **🛑 STOP 5 (After Step 6 - Export):** Verify multi-page A4 PDF generation at selected quality, JPG export, and iOS native share sheet.

---

## 📋 Phase 0: Foundations, Storage & Database
*Initialize Expo, setup design tokens, i18n, and fully implement local persistent storage so subsequent steps use real database records from the start.*
- [x] Initialize Expo project with `expo-router` and TypeScript strict mode.
- [x] Configure `app.json` for iOS bundle identifier, camera permissions, photo library permissions, face-id permissions, and portrait orientation lock.
- [x] Install vetted Expo Go compatible dependencies:
  - `expo-router`, `expo-camera`, `expo-image-picker`, `expo-image-manipulator`
  - `expo-file-system`, `expo-sqlite`, `expo-print`, `expo-sharing`
  - `expo-local-authentication`, `expo-secure-store`, `expo-localization`
  - `@expo/vector-icons`, `react-native-safe-area-context`, `react-native-screens`
  - `react-native-gesture-handler`, `react-native-reanimated`
- [x] Setup Design System tokens (`src/theme`):
  - Colors: Warm Ivory background (`#FBF9F5` / `#F7F5F0`), Primary Blue (`#0066FF`), Card White (`#FFFFFF`), Text Primary (`#111111`), Text Secondary (`#8E8E93`), Borders (`#E5E2DC`), Dark mode palette.
  - Spacing, Radius (12px, 16px, 20px, 28px pill), Typography scale (Title 1, Title 2, Body, Caption).
- [x] Setup Localization (`src/i18n`):
  - German (default) and English locale strings.
  - Typed translation helper.
- [x] **Storage & SQLite Repository Layer (`src/db`, `src/services`):**
  - SQLite database schema: `folders`, `documents`, `pages`.
  - Migrations and initial seed data (default folders matching mock: "Rechnungen", "Verträge", "Ausweise", "Privat").
  - `FolderRepository`: `getAll()`, `create()`, `rename()`, `delete()`.
  - `DocumentRepository`: `getAll()`, `getById()`, `create()`, `update()`, `delete()`, `moveToFolder()`.
  - FileSystem Asset Manager: directory initialization (`FileSystem.documentDirectory + 'scanflow/'`), file copy/delete utilities.
- [x] Minimal root tab layout (`app/_layout.tsx`, `app/(tabs)/index.tsx`) to verify end-to-end boot.
- [x] **Verification:** Run `npx tsc --noEmit` + linter.
- [x] **Git:** Commit and push to `main`.
- [ ] **🛑 STOP 1:** Instruct user to open app in Expo Go on physical iPhone and verify clean boot.

---

## 📋 Step 1: Library Screen (`bearbeiten.png`)
*Main dashboard for viewing, organizing, and finding documents using real SQLite persistence.*
- [x] Tab Navigation layout with floating circular blue Camera Scan button.
- [x] Top Header with large title "Dokumente" and action menu (`...`).
- [x] Search input with instant filtering against SQLite database (by document title).
- [x] Folder category pill filter row:
  - "Alle", "Rechnungen", "Verträge", "Ausweise", "Privat", and "+ Neuer Ordner".
  - Folder creation modal with SQLite persistence.
- [x] 2-column document grid backed directly by SQLite:
  - Card with document thumbnail preview, title, date formatted (`DD.MM.YYYY`), page count badge (`X Seiten`).
  - Context menu (`...` button on card) with actions: Rename, Move to folder, Duplicate, Delete (with file deletion).
- [x] Empty state UI with friendly German/English illustrations and CTA to scan first document.
- [x] Pull-to-refresh & list sorting (Date descending/ascending, Title A-Z).
- [x] **Verification:** Run `npx tsc --noEmit` + linter.
- [x] **Git:** Commit and push to `main`.

---

## 📋 Step 2: Camera Scanner & Permissions (`Scannen.png`)
*Multi-page capture interface with built-in permission handling.*
- [x] **Camera & Photo Permissions:**
  - German and English explanation dialog before requesting permission.
  - Dedicated fallback UI if permission is denied (instructions and "In Einstellungen öffnen" button).
  - Never crash on denied permission.
- [x] Fullscreen camera view using `expo-camera`.
- [x] Glowing cyan framing corner guides matching `Scannen.png`.
- [x] Flashlight toggle button (Off, On, Auto).
- [x] Alignment hint pill ("Dokument im Rahmen ausrichten" / "Align document in frame").
- [x] Capture mode toggle: "Auto" vs "Manuell".
- [x] Circular iOS shutter button with haptic feedback.
- [x] Multi-page capture buffer:
  - Bottom left stacked thumbnail with blue counter badge showing captured page count (`3`).
  - Tapping thumbnail opens quick review.
- [x] Gallery import button using `expo-image-picker` (with photo library permission handling).
- [x] "Fertig" (Done) button: saves all captured pages into FileSystem + SQLite document record and navigates to Document View.
- [x] **Verification:** Run `npx tsc --noEmit` + linter.
- [x] **Git:** Commit and push to `main`.
- [ ] **🛑 STOP 2:** Instruct user to test Camera Scan, permissions, and burst capture on physical iPhone.

---

## 📋 Step 3: Interactive Document Crop
*4-corner handle adjustment and geometric correction.*
- [x] Interactive 4-point corner handle overlay over document image.
- [x] Pan gestures on corner handles using `react-native-gesture-handler` with bounds clamping.
- [x] Visual polygon connecting the 4 corners.
- [x] Magnifying loupe / zoom bubble during corner drag for millimeter-precision edge placement.
- [x] **Expo Go Skia Compatibility Check:**
  - Verify `@shopify/react-native-skia` perspective warp inside standard Expo Go.
  - If Skia native module is missing in Expo Go: notify user immediately and seamlessly fall back to bounding-box crop via `expo-image-manipulator` (calculate bounding rect of points, crop, and normalize).
- [x] Reset corners button (reverts to full frame or default margin).
- [x] Save cropped page, update FileSystem file, and refresh document page record in SQLite.
- [x] **Verification:** Run `npx tsc --noEmit` + linter.
- [x] **Git:** Commit and push to `main`.
- [ ] **🛑 STOP 3:** Instruct user to test 4-corner crop handles on physical iPhone.

> ⚠️ **Correction (v1.2.0 code review):** the items above were ticked, but the code only did a *bounding-box* crop of the 4 points (no perspective warp), the Skia check was never performed, and the handles used stale closures. Real perspective correction with Skia, a working loupe and validation were implemented in **Phase A** (see below).

---

## 📋 Step 4: Filters & Image Adjustments (`Dokumente.png`)
*Document page enhancement and viewing.*
- [x] Document page detail screen matching `Dokumente.png`:
  - Navigation header: `< Dokumente`, document title, `...` options.
  - Large centered page preview card with rounded corners and subtle shadow.
- [x] Filter selection strip (horizontal thumbnail row):
  1. **Original:** Unmodified captured photograph.
  2. **Auto:** Contrast and brightness auto-adjustment.
  3. **Schwarzweiß (B&W):** High-contrast document binarization for clean text.
  4. **Graustufen (Grayscale):** Smooth monochrome rendering.
  5. **Magic Color:** Saturation boost with text darkening (CamScanner style).
- [x] Implementation via Expo Go compatible Headless Canvas / `expo-image-manipulator` pipeline.
- [x] Bottom action bar:
  - **Drehen:** Rotate 90° clockwise via `expo-image-manipulator`.
  - **Zuschneiden:** Opens Step 3 crop screen.
  - **Löschen:** Delete current page from SQLite & FileSystem with confirmation dialog.
  - **Seite hinzufügen:** Take new photo or pick from gallery to append page.
- [x] **Verification:** Run `npx tsc --noEmit` + linter.
- [x] **Git:** Commit and push to `main`.
- [ ] **🛑 STOP 4:** Instruct user to test filter switching and rotation on physical iPhone.

> ⚠️ **Correction (v1.2.0 code review):** filters were baked destructively via a hidden WebView canvas and applied to the *unrotated* original (rotation was lost when switching filters). Phase A replaces this with non-destructive GPU rendering (7 filters + adjustments).

---

## 📋 Step 5: Multi-Page Document Editor
*Organizing and managing pages within a document.*
- [x] Multi-page thumbnail carousel / grid view for the active document.
- [x] Reorder pages (drag-and-drop or Move Left / Move Right controls) with SQLite order updates.
- [x] Retake single page (replaces current page while preserving page index).
- [x] Add new page (from camera or gallery) at specific position.
- [x] Rename document inline or via modal with SQLite update.
- [x] Page count update and SQLite synchronization.

> ⚠️ **Correction (v1.2.0 code review):** reorder was not persisted, retake opened a new scan/document, "add page" created a new document, and deleting a page left its DB row. All fixed in Phase A.
- [x] **Verification:** Run `npx tsc --noEmit` + linter.
- [x] **Git:** Commit and push to `main`.

---

## 📋 Step 6: Export & Sharing (`Exportieren.png`)
*Generating PDF and image exports.*
- [x] Export bottom sheet modal matching `Exportieren.png`:
  - Sheet title: Document name.
  - **Format selector:** Segmented buttons `[PDF]` (with PDF icon) vs `[JPG]` (with Image icon).
  - **Qualität selector:** Segmented control: `Niedrig` (Low - 72 DPI), `Mittel` (Medium - 150 DPI), `Hoch` (High - 300 DPI / Original).
  - File info row: Estimated size calculation (e.g. `Geschätzte Größe: 1,8 MB`).
  - Primary CTA button: Blue full-width button `Teilen` (Share) with iOS share icon.
- [x] Multi-page A4 PDF builder using `expo-print`:
  - Clean HTML/CSS layout with `@page { size: A4; margin: 0; }` rendering pages seamlessly without borders.
  - Configurable image compression based on selected quality.
- [x] Single/multi JPG export to system share or camera roll.
- [x] Native iOS Share Sheet trigger via `expo-sharing`.
- [x] **Verification:** Run `npx tsc --noEmit` + linter.
- [x] **Git:** Commit and push to `main`.
- [ ] **🛑 STOP 5:** Instruct user to test PDF/JPG export and iOS share sheet on physical iPhone.

> ⚠️ **Correction (v1.2.0 code review):** the quality setting had no effect on the output and `object-fit: contain` produced white margins. Phase A exports with pdf-lib (exact A4/Letter, 150/200/300 dpi, JPEG quality Klein/Standard/Hoch).

---

## 📋 Step 7: Settings & App Lock
*App configuration and biometric lock with built-in permission handling.*
- [x] Settings Tab Screen:
  - **Erscheinungsbild (Appearance):** System, Hell (Light), Dunkel (Dark).
  - **Sprache (Language):** Deutsch (Standard), English.
  - **Standard-Qualität (Default Quality):** Niedrig, Mittel, Hoch.
  - **App-Sperre (App Lock):** Toggle switch for Face ID / Touch ID / Passcode.
- [x] **Biometrics & Local Authentication Permissions:**
  - `expo-local-authentication` check for hardware support.
  - German and English explanation dialog before requesting Face ID.
  - Graceful fallback UI when Face ID is denied or disabled.
  - Secure state stored with `expo-secure-store`.
  - App state listener (`AppState`): locks screen when app is sent to background or restarted.
- [x] Storage info (total scan count and disk space consumed) + "Daten bereinigen" (Cache clear).

> ⚠️ **Correction (v1.2.0):** the default quality setting was stored but not used; "cache clear" deleted nothing (it only recalculated the size). Now: default resolution + quality are used by the export dialog, and cache clear deletes the export folder.
- [x] **Verification:** Run `npx tsc --noEmit` + linter.
- [x] **Git:** Commit and push to `main`.

---

## 📋 Step 8: Final Verification & Release Polish
- [ ] Full end-to-end regression test on physical iPhone via Expo Go. *(Was ticked, but STOP gates 1–5 above were never confirmed – unticked in v1.2.0.)*
- [x] Verify light mode and dark mode theme switching across all screens.
- [x] Verify German and English localization strings across all screens.
- [x] Verify TypeScript strict type check passes with 0 errors (`npx tsc --noEmit`).
- [x] Final update to `CHANGELOG.md` and `docs/ROADMAP.md`.
- [x] Final commit and push to `main`.

---

## 🚀 Phase 2 Architecture Readiness (Future Expansion)
*Kept out of Phase 1 scope but architectural interfaces preserved:*
- **OCR Service Interface:** `IOCRService` placeholder in `src/services/ocr`.
- **Cloud Sync Adapter:** `ISyncAdapter` placeholder for WebDAV / iCloud / Nextcloud.
- **E-Signature:** Signature canvas overlay placeholder.
- **ID-Card Dual Mode:** Multi-slot page template architecture.

---

# 🧭 Phase A–D: From "photo of a page" to "real scanned PDF"

*Added in v1.2.0. The plan below extends the roadmap; Steps 0–8 above stay as history.
All phases keep the Expo Go constraint. Technical reference: [`ARCHITECTURE.md`](ARCHITECTURE.md).*

## ✅ Phase A: Scan look, perspective & export (v1.2.0)
- [x] Pure TypeScript imaging core in `src/imaging` (geometry, homography, page formats, raster helpers).
- [x] Automatic page detection after capture/import (Canny-style edges + Otsu brightness, multi-level, fallback to full image).
- [x] Skia perspective de-warp (SkSL `WARP_SKSL`) – replaces the bounding-box crop.
- [x] Crop screen: Skia overlay, 4 handles (fixed stale closures), loupe 2.5×, *Erkennen* / *Ganzes Bild* / *Zurücksetzen*, convexity/area validation.
- [x] Page formats Auto (snap ±4 %) / A4 / Letter with exact PDF sizes, no margins.
- [x] Scan enhancement shader (`ENHANCE_SKSL`) with paper-background estimation: white paper, dark text, shadow & gradient removal, table border removal.
- [x] 7 filters: Original, Auto (default), Magic Color, Schatten entfernen, Aufhellen, Graustufen, Schwarzweiß.
- [x] Adjustments: brightness, contrast, sharpness, denoise; "apply to all pages".
- [x] Non-destructive page state in SQLite (schema v2 + `PRAGMA user_version` migration with rollback; legacy pages migrated safely).
- [x] Render cache (`renderKey`, `RENDER_VERSION`), serial render queue, LRU of decoded images.
- [x] Editor fixes: add page to same document, retake in place, persisted reorder, delete page incl. files, delete by index, library reload on focus.
- [x] PDF export with pdf-lib: 150/200/300 dpi, JPEG Klein/Standard/Hoch, metadata (title), watermark, progress; expo-print fallback.
- [x] Settings: default resolution + quality used by export; cache clear deletes the export folder.
- [x] Jest test suite (geometry, detection, page state, migrations, renderer on headless Skia, PDF structure) + Python prototype.
- [ ] **🛑 STOP A:** Test on physical iPhone (Expo Go):
  1. App starts, existing documents still open (migration v1 → v2).
  2. Scan a page on a table → crop screen shows detected corners; drag handles + loupe; *Ganzes Bild* / *Erkennen* / *Zurücksetzen*.
  3. Document screen: white paper, no table border, straight page; switch all 7 filters; rotate; adjustments + "apply to all".
  4. Add page (camera + library), retake page, reorder, delete page → state survives app restart.
  5. Export PDF at 150/200/300 dpi × Klein/Standard/Hoch → opens in Files/Mail, A4 without margins, size close to estimate; watermark on/off.
  6. Export JPG, share sheet; Settings → default resolution/quality, cache clear.
  7. Memory: 20-page document renders and exports without crash.

## ✅ Phase B: Live detection, auto-capture & scan flow (v1.3.0)
*Goal: the camera shows the detected page outline live and captures automatically when the page is stable – like CamScanner.*

Spike result: Expo Go has no camera frame processors, so a custom live overlay would need low-res snapshots (≈2–4 fps at best). Instead, `expo-camera` (SDK 58, included in Expo Go) exposes the **iOS document scanner** (VisionKit `VNDocumentCameraViewController`, `CameraView.scanDocumentAsync`) – the scanner of Notes / Files with live edge detection.

- [x] iOS document scanner as the default scanner (`src/services/DocumentScannerService.ts`): live page outline, automatic capture when the page is stable, manual shutter, multi-page batch with thumbnail stack, corner adjustment, perspective correction, "Sichern".
- [x] App-wide scan entry `ScannerProvider` / `useScanner()` (`src/components/ScannerProvider.tsx`): camera permission (→ iOS settings), progress overlay while storing, new document opens automatically, fallback to ScanFlow's own camera if the system scanner is unavailable or fails to open (incl. stuck-presentation watchdog).
- [x] Settings → *Scanner*: *iOS-Scanner* (default) / *ScanFlow-Kamera*.
- [x] Scanner pages are stored without a second detection pass (already cropped) and get filter *Auto* → white scan look.
- [x] Document screen: *"+ Weitere Seiten hinzufügen"*; add page → *Aus Fotomediathek* / *Dokument scannen*; retake via the scanner keeps additional pages right after the retaken one.
- [x] Photo import from the Documents tab (header button + empty state) with edge detection; review banner for pages without a detected edge → *Ecken setzen*.
- [x] Shared store logic `saveScan()` (`src/services/ScanImportService.ts`) for scanner, own camera and photo import; temp files removed after success; tests in `__tests__/scanImport.test.ts`.
- [x] Detector v2 (`src/imaging/edgeDetection.ts`): oriented Hough lines + two-stage quad scoring (header bars, printed frames, sheet on a light binder/sleeve, cut-off pages); used for photo import and the own camera.
- [x] Removed the simulated 3.5 s "Auto" timer from `app/scan.tsx` (the own camera is manual capture only).
- [x] `CFBundleLocalizations` (de, en) so the system scanner UI is German in the IPA build.
- [ ] Live overlay in ScanFlow's *own* camera (only relevant when the iOS scanner is unavailable): snapshot-based spike, **STOP** and report if < 2 fps.
- [ ] Hints in the own camera ("Näher heran", "Mehr Licht", "Halten").
- [ ] **🛑 STOP B:** Test on physical iPhone (Expo Go and IPA):
  1. FAB (+) opens the iOS scanner: the live page highlight follows the sheet, auto capture, several pages in a row, thumbnail counter, *Sichern* → progress → document opens with white, straight pages.
  2. Document screen: *Weitere Seiten hinzufügen* adds pages to the same document; *Seite hinzufügen* → *Aus Fotomediathek* / *Dokument scannen*.
  3. Page editor → retake a page (several pages scanned → the extra ones follow the retaken page).
  4. Documents tab → photo import (multi-select keeps order); a photo without a visible page shows the review banner → *Ecken setzen*.
  5. Cancel the scanner → nothing is stored; deny camera access → alert with *In iOS-Einstellungen öffnen*.
  6. Settings → *ScanFlow-Kamera* → FAB opens the own camera; switch back to *iOS-Scanner*.

## ⏳ Phase C: OCR & searchable PDF (planned)
*Goal: text search in the library and an invisible text layer in exported PDFs.*
- [ ] Spike: on-device OCR that runs in Expo Go (no custom native module). Candidates: none built into Expo Go today → evaluate WebView + tesseract.js (WASM, offline, bundled language data de/en) vs. a later development build with Apple Vision. **STOP** and decide with the user before adding a dev-build requirement.
- [ ] `IOcrService` interface + implementation; run in background per page, store words + boxes (normalized to the rendered page) in a new `page_text` table (migration v3).
- [ ] Use the `textLayer` hook in `src/imaging/pdf.ts` to draw invisible text (render mode 3) at the word boxes → searchable/copyable PDFs.
- [ ] Library search over OCR text; "Text kopieren" action.
- [ ] Tests: text-layer placement via pdf-lib roundtrip; OCR on synthetic pages.

## ⏳ Phase D: Docs, repo & release hygiene
- [x] README, ROADMAP, CHANGELOG, AGENTS.md updated; `docs/ARCHITECTURE.md` added; doc-vs-code discrepancies corrected (v1.2.0).
- [x] `docs/COMMITS.md` with Conventional Commit grouping for the v1.2.0 and v1.3.0 change sets.
- [x] ESLint flat config (`eslint.config.js`) + `npm test` / `npm run test:imaging` scripts.
- [ ] Fix the pre-existing lint error in `src/components/AppLockOverlay.tsx` (variable used before declaration) and the remaining warnings (unused variables).
- [ ] Localize remaining hard-coded German strings (library actions, app lock, PIN setup).
- [ ] Remove the unused `react-native-webview` dependency after STOP A confirms the Skia pipeline on device.
- [ ] Update the hard-coded release tag (`v1.1.0`) in `.github/workflows/build-ipa.yml` before the next release.
- [ ] Optional: GitHub Action running `npx tsc --noEmit`, `npm run lint`, `npm run test:imaging` on pull requests.

