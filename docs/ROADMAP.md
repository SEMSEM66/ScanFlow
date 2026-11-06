# ScanFlow Implementation Roadmap & Checklist

This roadmap outlines the complete implementation plan for **ScanFlow**, an offline-first iOS document scanner built with Expo (latest SDK), React Native, TypeScript (strict), and expo-router.

---

## 🎯 Architectural Principles & Expo Go Constraints

1. **Expo Go Only:** All dependencies and APIs must run in standard Expo Go without custom native build steps (`npx expo run:ios`). *Exception since v1.5.0: the local module `modules/scanflow-ocr` (Apple Vision text recognition) is only built into the IPA; the app keeps working in Expo Go without it.*
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

> ⚠️ **Correction (v1.4.0):** the lock also triggered while the app was only *inactive* (the Face ID prompt itself) → Face ID loop and navigation reset; without Face ID / Touch ID it opened without any check; the PIN attempt limit was reset by restarting the app; the PIN used a 32-bit hash with a fixed salt. All fixed in Phase S (v1.4.0).

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
- **OCR Service Interface:** `IOCRService` placeholder in `src/services/ocr`. *(Implemented in v1.5.0: `src/services/OcrService.ts` + `src/ocr/`.)*
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

## ✅ Phase S: Security hardening (v1.4.0)
*Goal: an app lock that cannot be bypassed and does not get in the way – no Face ID loop, no lost screens, a PIN that is stored and rate-limited properly. Everything runs in Expo Go (no new dependency).*

- [x] **Face ID loop fixed:** lock decisions in a pure state machine (`src/security/lockPolicy.ts`): `inactive` (Face ID prompt, Control Center, alerts) never locks; `background` + *Sperren nach* decides; one automatic prompt per lock / return; an unlock result that arrives in the background is ignored.
- [x] App content stays mounted while locked; the lock screen is drawn in a `FullWindowOverlay` above modal screens, sheets, the share sheet and the iOS scanner (`AppLockOverlay.tsx`, `LockScreen.tsx`).
- [x] Never unlock without a check (`AuthService.authenticateOwner()`): Face ID / Touch ID → device passcode or ScanFlow PIN; nothing available → stays locked; Keychain unreadable → locked (fail closed).
- [x] PIN v2: PBKDF2-HMAC-SHA256, 5,000 iterations, random 16-byte salt, constant-time comparison (`src/security/sha256.ts`, `pinHash.ts`); v1 PINs (≤ 1.3.0) verified and converted.
- [x] Persisted, escalating attempt limit (`lockout.ts`): 5 free attempts, then 30 s / 1 min / 5 min / 15 min; safe against setting the clock back; checks are serialised.
- [x] 4- or 6-digit PIN (default 6), weak PINs rejected; set / change / remove with verification; *PIN vergessen? Mit Face ID bestätigen*.
- [x] With a PIN: Face ID with *ScanFlow-PIN eingeben* as fallback, no device-passcode fallback.
- [x] Keychain classes *this device only* + one-time migration of existing entries.
- [x] *App-Vorschau verbergen* (native blur, independent of the lock) and *Screenshot-Schutz* with a notice only while it is on (`PrivacyService.ts`).
- [x] Exports deleted when the share sheet closes (JPGs shared without a declared type, so expo-sharing keeps no `.jpeg` copy); export cache cleared at start; fake "Zero-Trace" shredding removed.
- [x] Lock screen, PIN dialog and security settings localized (de / en).
- [x] Tests: `__tests__/security.test.ts`, `authService.test.ts`, `exportCleanup.test.ts` (56 tests, `npm run test:security`).
- [ ] Measure the PIN check time on an iPhone; adjust `PIN_ITERATIONS` if it is far from 0.2–0.4 s (existing records are upgraded automatically).
- [ ] Optional, needs a development / IPA build (**decide with the user**): encrypt the database and page files (e.g. SQLCipher + file encryption with a Keychain key).
- [ ] **🛑 STOP S:** Test on physical iPhone (Expo Go):
  1. Settings → *App-Sperre* on, *Sperren nach: Sofort*. Home → reopen → **exactly one** Face ID prompt → the library opens; no loop, no second prompt.
  2. While unlocked: Control Center, Notification Center, a banner, the app switcher (without switching apps) → no lock, no Face ID.
  3. Open a document → *Zuschneiden* (also: page editor, export sheet, iOS scanner) → home → reopen → the lock screen covers everything → unlock → the same screen is still open.
  4. *Sperren nach: 1 Min.*: back after ~20 s → no lock; after > 1 min → locked.
  5. Cancel Face ID → lock screen with *Mit Face ID entsperren* → tap → prompt again.
  6. *ScanFlow-PIN → Einrichten*: 111111 / 123456 are rejected; set a 6-digit PIN (also try *4-stelligen PIN verwenden*). Lock → the Face ID prompt offers *ScanFlow-PIN eingeben* → the PIN unlocks.
  7. 5 wrong PINs → 30 s countdown; force-quit and reopen → the wait continues; afterwards the correct PIN unlocks.
  8. *Ändern* / *Entfernen* ask for the current PIN (or Face ID via *PIN vergessen?*); turning the lock off asks for Face ID (or the PIN / device passcode).
  9. App switcher shows ScanFlow blurred (*App-Vorschau verbergen* on). *Screenshot-Schutz* on → screenshot is black + notice; off → normal screenshot, no notice.
  10. Export PDF and JPG → share to *Dateien sichern*, Mail and AirDrop → the files arrive complete with their normal names (`.pdf` / `.jpg`).
  11. If you used a 4-digit PIN with 1.3.0: it still unlocks after the update.

## ✅ Phase C: OCR & searchable PDF (v1.5.0)
*Goal: text search in the library, "Text kopieren" and an invisible text layer in exported PDFs.*

Spike result / decision: Expo Go contains no OCR engine; tesseract.js in a WebView would be slow and large (language data) and less accurate than Apple's text recognition. ScanFlow therefore uses **Apple Vision** (`VNRecognizeTextRequest`, offline) through a small local Expo module that is only built into the IPA. In Expo Go `ocrService.available` is false and every OCR UI is hidden or explains this.

- [x] Local Expo module `modules/scanflow-ocr` (Swift): `recognizeAsync(uri, { languages, level, usesLanguageCorrection, minimumTextHeight })` → lines with confidence, line and word boxes; own serial queue; autolinked; CI checks that the pod is linked.
- [x] Pure OCR core in `src/ocr/` (no Expo imports): model (normalized boxes, origin top-left), Vision conversion incl. plausibility check of word boxes, reading order, plain text, search normalization (case, diacritics, ß, ligatures, hyphenation), snippets, compact storage format, staleness key `ocrKey()` (original + corners + rotation + `OCR_VERSION`).
- [x] `page_text` table (schema v3, migration step + test), `PageTextRepository` (save, copy on duplicate, pending pages, stats, snippets); rows deleted with their page.
- [x] `OcrService`: background queue (`src/ocr/scheduler.ts`) – one page at a time, foreground only, open document first, 2 attempts per page state, stops after 5 failures in a row, paused during export; on/off setting; OCR image rendered without filter at 200 dpi (≤ 2400 px).
- [x] Invisible text layer (render mode 3, Helvetica/WinAnsi) per word in `buildPdf()` → searchable/copyable PDFs; missing text is recognized during export.
- [x] Library search over titles + OCR text (every word, normalized), excerpt with the hit on the document card, live update while searching; *Text kopieren* (per page / all / share) in the document menu; Settings → *Texterkennung*.
- [x] Tests: `ocr.test.ts`, `ocrScheduler.test.ts`, `pdfTextLayer.test.ts` (pdf-lib roundtrip + word positions via `pdftotext -bbox`), `textSearch.test.ts` (node:sqlite), migrations v2 → v3 (`npm run test:ocr`).
- [ ] OCR on synthetic / real pages in CI (needs macOS + Vision; not possible in the Jest/Node tests).
- [ ] Measure recognition time and memory on an iPhone; tune `OCR_MIN_TEXT_HEIGHT`, `OCR_DPI` / `OCR_MAX_LONG_SIDE` if needed (bump `OCR_VERSION` when the recognition setup changes).
- [x] Normalized title search (umlaut / case-insensitive, matching OCR search).
- [ ] Optional: more recognition languages (setting), embedded Unicode font for non-WinAnsi text in the PDF layer.
- [ ] **🛑 STOP C:** Test on physical iPhone (**IPA** v1.5.1; then a short check in Expo Go):
  1. Update from 1.4.0: documents, folders and settings are still there. Settings → *Texterkennung* shows *Text wird erkannt … x von y Seiten*, after a while *y von y Seiten erkannt*. While it runs, scrolling, opening documents and editing stay smooth.
  2. Scan a letter or an invoice → after a few seconds the search finds a word from the body text (not from the title), with the excerpt and the word in bold. Also try `muller` for *Müller*, `strasse` for *Straße*, two words, a word hyphenated at a line end. *(Recognition on the iPhone is confirmed indirectly – the exported PDF was searchable in Files, see item 6; the in-app search is still open.)*
  3. Small print (footer, fine print): is it found? If not, report which size is missing (setting `OCR_MIN_TEXT_HEIGHT`).
  4. Document menu (*…*) → *Text kopieren*: text per page in a sensible reading order; *Kopieren*, *Alles kopieren*, paste in Notes; *Text teilen*.
  5. Rotate a page or change its corners → the text is recognized again (search still finds it; *Text kopieren* shows the new text).
  6. Export a PDF → the export sheet slides down, then the share sheet appears (fixed in 1.5.1) → *In Dateien sichern* → open in Files: search for a word (it is highlighted at the right place), select and copy text; also open in Preview on a Mac/PC or Acrobat if available. Export a JPG → the share sheet appears as well → *In Dateien sichern*. ✅ *Confirmed by the user on 1.5.1: PDF and JPG export, share sheet, word search in the PDF in Files, editing afterwards.*
  7. Settings → *Text erkennen* off → *Text behalten*: search still finds text, new scans are not recognized; off → *Text löschen*: text search finds nothing anymore; on again → everything is recognized again.
  8. Duplicate a document → the copy is found by its text immediately. Delete a document → its text is gone from the search.
  9. Library → *…* → *In Ordner verschieben* opens the folder list and moves the document (fixed in 1.5.0).
  10. Expo Go: the app starts and works; *Texterkennung* in Settings says it is only available in the installed app; *Text kopieren* is not offered; title search works.

> ⚠️ **Correction (v1.5.1, found in STOP C):** PDF and JPG export hung on *Seite wird berechnet …* – the share sheet was presented while the export sheet was still sliding out, iOS dropped it and `shareAsync()` never settled. Now the document screen closes the export sheet first (`ModalHandoff`: `Modal.onDismiss`, 1.5 s fallback) and then opens the share sheet; the sheet cannot be closed while the file is created; the OCR pause ends when the file is ready. Covered by STOP C item 6.

## ✅ Phase U: iOS-style panels & navigation (v1.6.0)
Requested by the user after STOP C: the dark background of *Anpassen* slid up together with the panel, and the tab bar looked unbalanced (camera button left of the middle with 4 tabs).

- [x] `BottomSheet` (`src/components/BottomSheet.tsx`): the RN `Modal` is presented without animation; the backdrop opacity is derived from the sheet offset (fades in while the sheet glides up with a spring, damping ratio ≈ 0.81), close with an iOS curve (0.28 s). Pull down to close (distance or flick), rubber band upwards, tap the backdrop, VoiceOver escape. `onDismiss` once the modal is gone (1 s fallback). Only `Animated` (native driver) + `PanResponder` → no new dependency, runs in Expo Go.
- [x] Motion and state machine in `src/components/sheetMotion.ts` (pure TS, driver injected): `__tests__/sheetMotion.test.ts` (26).
- [x] All bottom panels use it: *Anpassen* (dim 0.35, pull at handle/title), *Exportieren* (not closable while the file is created; `ModalHandoff` → share sheet unchanged), document and folder *…* menus, *Sortieren*, *In Ordner verschieben* (pull at handle/title). Menus keep their content while gliding out.
- [x] Menus run the chosen entry in `onDismiss` (next sheet, prompt or alert only once the menu is gone) – the fixed `MENU_HANDOFF_MS` delays are removed.
- [x] Tab bar: five equal slots, camera button exactly in the middle (*Dokumente*, *Suchen*, camera, *Werkzeuge*, *Einstellungen*); labels 10 pt without font scaling (like iOS).
- [x] New *Suchen* tab (`app/(tabs)/search.tsx`): all folders, title + recognized text, hits with thumbnail, date, pages, folder and excerpt; refreshes on focus and when a page is recognized.
- [x] *Werkzeuge* localized (`t.tools`).
- [ ] **🛑 STOP U:** Test on physical iPhone (**IPA** v1.6.0; Expo Go works as well):
  1. Document → *Anpassen*: the background darkens gently (no dark block sliding up), the panel glides up with a soft bounce. Sliders and *Rauschen reduzieren* work; pull the handle down → closes; pull only a little → springs back; tap the dark area → closes; *Fertig* closes.
  2. *Teilen* (export panel) opens and closes the same way; pull it down → closes. Export a PDF → the panel glides down, then the share sheet appears; while the file is created, the panel cannot be pulled down or closed by tapping outside.
  3. Library → *…* on a document: *Dokument umbenennen* (name prompt), *In Ordner verschieben* (folder list → moves the document), *Duplizieren*, *Text kopieren*, *Dokument löschen* (confirmation) – each opens right after the menu has closed. Same in the *…* menu of the document screen – except *Dokument löschen*: there it deletes at once without asking (unchanged; open issue below).
  4. Library → sort button (*…* at the top) and long-press on a folder (*Bearbeiten*, *Ordner löschen*): the panels behave the same.
  5. Tab bar: the camera button is exactly in the middle, no label is cut off (*Einstellungen*); the camera button starts the scanner; all four tabs open.
  6. *Suchen*: type a word → hits from all folders, with folder name and excerpt (word in bold); tap a hit → the document opens; back → the results are still there. Rename or delete a document → the results are updated when you come back. Clear the search → the hint is shown again.

## ✅ Phase D: Docs, repo & release hygiene
- [x] README, ROADMAP, CHANGELOG, AGENTS.md updated; `docs/ARCHITECTURE.md` added; doc-vs-code discrepancies corrected (v1.2.0).
- [x] `docs/COMMITS.md` with Conventional Commit grouping for the v1.2.0, v1.3.0 and v1.4.0 change sets.
- [x] ESLint flat config (`eslint.config.js`) + `npm test` / `npm run test:imaging` / `npm run test:security` scripts.
- [x] Fix the pre-existing lint error in `src/components/AppLockOverlay.tsx` (v1.4.0 – file rewritten).
- [x] Fix the remaining lint warnings (unused variables) (v1.8.0).
- [x] Localize remaining hard-coded German strings (library actions) (v1.8.0). *(App lock, PIN and security settings localized in v1.4.0.)*
- [x] Remove the unused `react-native-webview` dependency (along with unused `@expo/vector-icons` and `expo-image`) after STOP A confirms the Skia pipeline on device.
- [x] Document screen: *…* → *Dokument löschen* deletes at once, without the confirmation the library shows – add the same confirmation (v1.8.0).
- [x] Release per version instead of the hard-coded `v1.1.0` in `.github/workflows/build-ipa.yml` (v1.4.0: tag `v<package.json version>`, notes from `CHANGELOG.md`).
- [ ] Optional: GitHub Action running `npx tsc --noEmit`, `npm run lint`, `npm run test:imaging` on pull requests.

---

## 🚀 Phase V2: Commercial App Store Release Candidate (v1.9.0 → v2.0.0-rc)

**Positioning:** *"The uncompromising offline document scanner and PDF toolkit for iPhone. 100% on-device, no account, no ads, no watermarks, no tracking."* (DACH market first: German default, English second).

### Definition of Done (v2.0.0-rc)
1. All P0 features below are implemented, tested and documented; P1 items done or explicitly deferred with a reason in this ROADMAP.
2. Quality gates are green: `npx tsc --noEmit`, `npm run lint`, `npm run check:corners`, `npm test` (plus new tests and `npm run check:network` from M6).
3. The free tier has unlimited scanning, filters, folders and basic PDF/JPG export. No watermark, no ads, no account, no analytics, no telemetry, no network calls for user data.
4. The store package in `docs/store/` is complete (M6) and a signed TestFlight/App Store build path is prepared (`docs/RELEASING.md`, M7).
5. `README.md`, `docs/ROADMAP.md`, `CHANGELOG.md`, `docs/ARCHITECTURE.md`, and `AGENTS.md` are up to date.
6. Every claim in the docs and store text is true and marked as `verified by tests`, `verified in CI log`, or `UNVERIFIED (needs iPhone)`.

### Decisions (confirmed by the user on 2026-11-06: "use defaults")
> **CI policy override (user, 2026-11-06):** do **not** merge milestones into `main` one by one. All milestones M0–M7 stay on feature branches (stacked) and are merged into `main` **once for v2.0.0-rc** → exactly one IPA build for the whole V2 program. The per-milestone STOP device checklists are collected and run together on the v2.0.0-rc IPA.


1. **Free/Pro gating & App Lock:** Does App Lock stay free, and do you agree with the proposed Free vs. Pro split? **[Default: as proposed – App Lock stays free]**
2. **Price hypotheses:** Yearly with 7-day trial + Lifetime one-time purchase (monthly optional)? **[Default: yearly with trial + lifetime, monthly optional]**
3. **App Store name & Bundle ID:** Keep `ScanFlow` / `com.scanflow.app` or switch before the first TestFlight build? **[Default: decide before TestFlight; 5 name alternatives prepared in M6]**
4. **Attempt P2 spikes in M4** (App Intents/Shortcuts, Lock Screen/Control Center Widget, Share Extension)? **[Default: defer unless requested]**
5. **CI trigger:** Keep building on every push to `main` (with `concurrency`, `paths-ignore` for docs, and npm cache), or switch to tag-only (`v*`)? **[Default: every push to `main` with concurrency + paths-ignore]**

---

### ✅ M0 – Foundations (with v1.9.0)
- [x] **P0:** `src/entitlements` with `FeatureKey` and `isUnlocked(feature)`. Everything unlocked by default until M5; all gated features call `isUnlocked()` so gating can be changed in one place (`__tests__/entitlements.test.ts` – `verified by tests`).
- [x] **P0:** i18n parity test (`__tests__/i18n.test.ts`): asserts `de.ts` and `en.ts` have identical nested keys, non-empty strings, and matching `{placeholder}` variables (`verified by tests`).
- [x] **P0:** Native-spike template (`docs/spikes/_template.md`) + M1 PDFKit spike (`docs/spikes/m1-pdf-toolkit-native.md`).

### ✅ M1 – PDF Toolkit (v1.9.0)
- [x] **P0 – Import PDFs & images from Files and "Open in ScanFlow":**
  - Register PDF (`com.adobe.pdf`) and image (`public.image`) document types in `Info.plist` (`app.json`), handle incoming `file://` URLs in `app/_layout.tsx`, and offer *PDF oder Bilder importieren* in the Library and *Werkzeuge* tab.
  - Native PDFKit functions in `modules/scanflow-ocr/ios/ScanFlowOcrModule.swift` (`getPdfInfoAsync`, `renderPdfPageAsync` at 200 dpi, serial page-by-page inside `autoreleasepool`, memory-safe for 50+ page PDFs), followed by background OCR (`UNVERIFIED (needs iPhone)` / Swift compilation verified in CI).
  - Expo Go fallback: clear localized explanation when importing a PDF in Expo Go (`verified by tests`).
- [x] **P0 – Library multi-select:**
  - Select mode in the Library (*Auswählen*): select/deselect cards, *Alle auswählen*, move selected to folder, merge 2+ selected documents, batch export (single PDF or multi-document `.zip` via `src/docx/zip.ts` into one share sheet, auto-cleaned after sharing), and batch delete with confirmation (`verified by tests` + `UNVERIFIED (needs iPhone)` for UI/share sheet).
- [x] **P0 – Merge documents & split/extract pages:**
  - Pure DB & file operations (`DocumentRepository.mergeDocuments`, `extractPagesToDocument`, `splitDocumentAtPage`) preserving non-destructive page state, previews, and `page_text` OCR rows (`__tests__/documentOperations.test.ts` – `verified by tests`).
  - Page overview (`PageEditorModal`): select pages → *In neues Dokument extrahieren* (*Extract to new document*), and *Ab hier teilen* (*Split at page N*) on any page ≥ 2 (`UNVERIFIED (needs iPhone)`).
- [x] **P0 – Password-protected PDF export:**
  - Native encryption via `PDFDocument.write(to:withOptions:)` (`userPasswordOption` / `ownerPasswordOption`) in `ScanFlowOcrModule.swift` (`encryptPdfAsync`). Re-opens the written PDF in Swift and asserts `isEncrypted && isLocked && unlock(withPassword:)`, deletes the unencrypted temp file in `defer` (`UNVERIFIED (needs iPhone)` / Swift compilation verified in CI).
  - Export sheet (`ExportModal.tsx`): password toggle, password + confirmation inputs, show/hide toggle, minimum length check (≥ 4 chars), clear warning that a lost password cannot be recovered, and honest statement of standard PDFKit encryption (`verified by tests` for validation + `UNVERIFIED (needs iPhone)`).
- [ ] **🛑 STOP M1:** Test on physical iPhone (**IPA** v1.9.0 + short check in Expo Go):
  1. **Import PDF from Files:** In *Dokumente* (or *Werkzeuge*), tap *PDF oder Bilder importieren* → pick a multi-page PDF → pages are imported at 200 dpi with progress, opened as a new document, and recognized by OCR in the background.
  2. **"Open in ScanFlow" from Files / Mail:** In the iOS Files app, long-press a PDF or image → *Teilen* → choose **ScanFlow** → ScanFlow opens and imports the file into the library.
  3. **Library Multi-Select & Batch ZIP Export:** In *Dokumente*, open the `…` menu → *Auswählen* → select 2–3 documents → test *Ordner* (move), *Teilen* (creates one `.zip` with all PDFs and opens the share sheet), and *Zusammenfügen* (merges the selected documents into a new combined document).
  4. **Page Extract & Split:** Open a multi-page document → tap the `1 / N` pill to open the page overview → select 1–2 pages and tap *Extrahieren* (creates a new document with those pages). Open the page overview again and tap *Ab Seite N teilen* on page 2 → splits the document at page 2.
  5. **Password-Protected PDF Export:** Open a document → *Teilen* → enable *Passwortschutz* → enter a password + confirmation (test show/hide and mismatch validation) → tap *Teilen* → *In Dateien sichern* → open the saved PDF in Files and confirm iOS prompts for the password before showing the pages.
  6. **Expo Go Check:** Open in Expo Go → attempting PDF import or PDF password encryption shows a clear message that the installed ScanFlow app is required; image import, multi-select, merge, extract, and split work in Expo Go.

---

### ⏳ M2 – Capture Modes & Marking (v1.10.0)
- [ ] **P0:** ID-card mode: guided front/back capture, crop each side to ID-1 ratio (85.6 × 54 mm), compose both on ONE A4 page at true scale, centered; optional diagonal purpose watermark (*"Kopie – nur für <Zweck>, <Datum>"*); non-destructive schema v4 + `RENDER_VERSION` bump + tests.
- [ ] **P0:** QR/barcode scanner in *Werkzeuge* (`expo-camera` barcode scanning): result sheet with raw value, type, copy; never auto-open URLs (show full URL and ask first); EPC/GiroCode (BCD) parser into recipient, IBAN, BIC, amount, reference with copy buttons; optional local history (OFF by default) with clear button; parser unit tests.
- [ ] **P0:** Visual signatures & annotations: signature manager (Skia canvas with finger/Apple Pencil, smoothing, undo/clear, vector stroke storage, delete), non-destructive page annotation layer (schema v4: signature, text, date stamp, pen, highlighter; move/resize/rotate via Gesture Handler), rendered by `PageRenderer` after filters and excluded from OCR render. Wording: *"Unterschrift einfügen"* (never *"digital signieren"*).
- [ ] **P1:** Create a signature from a photo of a paper signature (threshold to transparent PNG).
- [ ] **🛑 STOP M2:** Physical iPhone test checklist for ID-card mode, QR/GiroCode scanner, and signatures/annotations.

### ⏳ M3 – Organization & Automation (v1.11.0)
- [ ] **P0:** Trash (*Zuletzt gelöscht*, 30-day retention, restore, empty trash, auto-purge on launch; schema migration + tests; all delete actions move to trash first).
- [ ] **P0:** Favorites (pin to top) and tags (chips, filter, search integration).
- [ ] **P1:** Smart naming templates (`{date}`, `{time}`, `{folder}`, `{firstLine}`, `{counter}`) in Settings; auto-rename after first OCR only while title is still auto-generated; deterministic rules only.
- [ ] **P1:** Backup to Files: export all documents as one `.zip` (PDFs + `manifest.json` with versioned page state + originals) via Files picker + Import/Restore with version check and manifest round-trip tests.
- [ ] **🛑 STOP M3:** Physical iPhone test checklist for Trash, Favorites/Tags, Smart Naming, and Full Backup/Restore.

### ⏳ M4 – iOS Integration (v1.12.0)
- [ ] **P0:** Haptics (`expo-haptics`) on page snap, corner lock, filter change, PIN keys, success/error (respecting Reduce Motion).
- [ ] **P0:** Accessibility audit: VoiceOver labels/hints/traits (DE/EN), Dynamic Type, 44 pt hit targets, contrast AA in light and dark mode (automated token contrast test), Reduce Motion.
- [ ] **P1:** Home Screen Quick Actions (*Dokument scannen*, *Suchen*) via `expo-quick-actions` (verified in CI).
- [ ] **P2 (Spikes only, time-boxed):** `docs/spikes/app-intents.md`, `docs/spikes/lock-screen-widget.md`, `docs/spikes/share-extension.md`.
- [ ] **🛑 STOP M4:** Physical iPhone test checklist for Haptics, VoiceOver/Accessibility, and Quick Actions.

### ⏳ M5 – Monetization (v1.13.0)
- [ ] **STOP FIRST:** Write `docs/MONETIZATION.md` (StoreKit 2 vs. RevenueCat comparison, proposed Free/Pro gating, pricing hypotheses) and wait for user approval before coding the paywall.
- [ ] **P0:** StoreKit 2 integration (local JWS verification, `Transaction.currentEntitlements`, `Transaction.updates`, `AppStore.sync` restore), fair paywall UI, Settings Pro status & manage/restore, offline cached entitlement state, and `expo-store-review` after 3rd successful export.
- [ ] **🛑 STOP M5:** TestFlight / sandbox purchase & restore checklist.

### ⏳ M6 – Compliance, Legal & Store Package (v2.0.0-rc)
- [ ] **P0 (Code):** `ios.privacyManifests` in `app.json`, `ITSAppUsesNonExemptEncryption` decision + documentation, localized `Info.plist` permission strings (`de`/`en`), icon/splash verification, `scripts/check-network.mjs` (`npm run check:network`), and in-app *Einstellungen → Über* legal & open-source license views (generated from `package-lock.json`).
- [ ] **P0 (`docs/store/` DE & EN):** `privacy-policy` (MD + HTML), `terms`, `impressum` template, `app-store-metadata` (no competitor names/trademarks), `review-notes`, `privacy-nutrition-label`, `age-rating`, `export-compliance`, App Review Guidelines checklist, and `tools/store-screenshots/` composer script.
- [ ] **🛑 STOP M6:** Final release candidate verification checklist on physical iPhone.

### ⏳ M7 – Release Pipeline (`docs/RELEASING.md`)
- [ ] **P0:** Complete comparison of (A) EAS Build + EAS Submit vs. (B) GitHub Actions macOS signed build + upload, prepared profiles/workflows (disabled until secrets exist), and exact step-by-step App Store Connect / TestFlight instructions.

---

### 💡 Ideas Backlog (Out of V2.0 Scope – No Scope Creep)
- Additional OCR recognition languages selector in Settings (beyond `de-DE` and `en-US`).
- Embedded Unicode font subsetting in `pdfTextLayer.ts` for non-WinAnsi characters.
- SQLCipher database encryption + per-file encryption key in Keychain.
- iPad Split View / multi-column layout optimization (`supportsTablet: true`).

---

### 📌 Next Steps (Session Handoff for Fresh Agents)
- **Current Branch:** `feat/m0-m1-pdf-toolkit` (branched from `main` after v1.8.0 + Phase D cleanup).
- **Completed in Current Session:**
  - Updated `AGENTS.md`, `.github/workflows/build-ipa.yml` (concurrency, `paths-ignore`, npm cache), `docs/RELEASING.md`, and `docs/ROADMAP.md` (Phase V2 plan).
  - Implemented **M0 (Foundations)** and **M1 (PDF Toolkit — v1.9.0)** on `feat/m0-m1-pdf-toolkit`.
- **What to Do Next:**
  1. Wait for the user's answers to the 5 **Open Decisions** above and their feedback on **STOP M1** (after merging `feat/m0-m1-pdf-toolkit` into `main` to build the `v1.9.0` IPA when the user approves).
  2. Once **STOP M1** is confirmed, start branch `feat/m2-capture-marking` for **M2 (v1.10.0)**: ID-card mode, QR/GiroCode scanner, and visual signatures & annotations (schema v4).


