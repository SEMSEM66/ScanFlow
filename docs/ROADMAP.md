# ScanFlow Implementation Roadmap & Checklist

This roadmap outlines the complete implementation plan for **ScanFlow**, an offline-first iOS document scanner built with Expo (latest SDK), React Native, TypeScript (strict), and expo-router.

---

## 🎯 Architectural Principles & Expo Go Constraints

1. **Expo Go Only:** All dependencies and APIs must run in standard Expo Go without custom native build steps (`npx expo run:ios`).
2. **Offline-First & Persistent Data From Day One:** All files stored in app container via `expo-file-system`; all metadata and folder structures managed in SQLite via `expo-sqlite`. No mock data.
3. **Repository Pattern:** UI layers never directly invoke raw file or database operations; all interactions pass through typed services (`StorageService`, `DocumentRepository`, `FolderRepository`, `FilterService`, `ExportService`).
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
- [ ] Initialize Expo project with `expo-router` and TypeScript strict mode.
- [ ] Configure `app.json` for iOS bundle identifier, camera permissions, photo library permissions, face-id permissions, and portrait orientation lock.
- [ ] Install vetted Expo Go compatible dependencies:
  - `expo-router`, `expo-camera`, `expo-image-picker`, `expo-image-manipulator`
  - `expo-file-system`, `expo-sqlite`, `expo-print`, `expo-sharing`
  - `expo-local-authentication`, `expo-secure-store`, `expo-localization`
  - `@expo/vector-icons`, `react-native-safe-area-context`, `react-native-screens`
  - `react-native-gesture-handler`, `react-native-reanimated`
- [ ] Setup Design System tokens (`src/theme`):
  - Colors: Warm Ivory background (`#FBF9F5` / `#F7F5F0`), Primary Blue (`#0066FF`), Card White (`#FFFFFF`), Text Primary (`#111111`), Text Secondary (`#8E8E93`), Borders (`#E5E2DC`), Dark mode palette.
  - Spacing, Radius (12px, 16px, 20px, 28px pill), Typography scale (Title 1, Title 2, Body, Caption).
- [ ] Setup Localization (`src/i18n`):
  - German (default) and English locale strings.
  - Typed translation helper.
- [ ] **Storage & SQLite Repository Layer (`src/db`, `src/services`):**
  - SQLite database schema: `folders`, `documents`, `pages`.
  - Migrations and initial seed data (default folders matching mock: "Rechnungen", "Verträge", "Ausweise", "Privat").
  - `FolderRepository`: `getAll()`, `create()`, `rename()`, `delete()`.
  - `DocumentRepository`: `getAll()`, `getById()`, `create()`, `update()`, `delete()`, `moveToFolder()`.
  - FileSystem Asset Manager: directory initialization (`FileSystem.documentDirectory + 'scanflow/'`), file copy/delete utilities.
- [ ] Minimal root tab layout (`app/_layout.tsx`, `app/(tabs)/index.tsx`) to verify end-to-end boot.
- [ ] **Verification:** Run `npx tsc --noEmit` + linter.
- [ ] **Git:** Commit and push to `main`.
- [ ] **🛑 STOP 1:** Instruct user to open app in Expo Go on physical iPhone and verify clean boot.

---

## 📋 Step 1: Library Screen (`bearbeiten.png`)
*Main dashboard for viewing, organizing, and finding documents using real SQLite persistence.*
- [ ] Tab Navigation layout with floating circular blue Camera Scan button.
- [ ] Top Header with large title "Dokumente" and action menu (`...`).
- [ ] Search input with instant filtering against SQLite database (by document title).
- [ ] Folder category pill filter row:
  - "Alle", "Rechnungen", "Verträge", "Ausweise", "Privat", and "+ Neuer Ordner".
  - Folder creation modal with SQLite persistence.
- [ ] 2-column document grid backed directly by SQLite:
  - Card with document thumbnail preview, title, date formatted (`DD.MM.YYYY`), page count badge (`X Seiten`).
  - Context menu (`...` button on card) with actions: Rename, Move to folder, Duplicate, Delete (with file deletion).
- [ ] Empty state UI with friendly German/English illustrations and CTA to scan first document.
- [ ] Pull-to-refresh & list sorting (Date descending/ascending, Title A-Z).
- [ ] **Verification:** Run `npx tsc --noEmit` + linter.
- [ ] **Git:** Commit and push to `main`.

---

## 📋 Step 2: Camera Scanner & Permissions (`Scannen.png`)
*Multi-page capture interface with built-in permission handling.*
- [ ] **Camera & Photo Permissions:**
  - German and English explanation dialog before requesting permission.
  - Dedicated fallback UI if permission is denied (instructions and "In Einstellungen öffnen" button).
  - Never crash on denied permission.
- [ ] Fullscreen camera view using `expo-camera`.
- [ ] Glowing cyan framing corner guides matching `Scannen.png`.
- [ ] Flashlight toggle button (Off, On, Auto).
- [ ] Alignment hint pill ("Dokument im Rahmen ausrichten" / "Align document in frame").
- [ ] Capture mode toggle: "Auto" vs "Manuell".
- [ ] Circular iOS shutter button with haptic feedback.
- [ ] Multi-page capture buffer:
  - Bottom left stacked thumbnail with blue counter badge showing captured page count (`3`).
  - Tapping thumbnail opens quick review.
- [ ] Gallery import button using `expo-image-picker` (with photo library permission handling).
- [ ] "Fertig" (Done) button: saves all captured pages into FileSystem + SQLite document record and navigates to Document View.
- [ ] **Verification:** Run `npx tsc --noEmit` + linter.
- [ ] **Git:** Commit and push to `main`.
- [ ] **🛑 STOP 2:** Instruct user to test Camera Scan, permissions, and burst capture on physical iPhone.

---

## 📋 Step 3: Interactive Document Crop
*4-corner handle adjustment and geometric correction.*
- [ ] Interactive 4-point corner handle overlay over document image.
- [ ] Pan gestures on corner handles using `react-native-gesture-handler` with bounds clamping.
- [ ] Visual polygon connecting the 4 corners.
- [ ] Magnifying loupe / zoom bubble during corner drag for millimeter-precision edge placement.
- [ ] **Expo Go Skia Compatibility Check:**
  - Verify `@shopify/react-native-skia` perspective warp inside standard Expo Go.
  - If Skia native module is missing in Expo Go: notify user immediately and seamlessly fall back to bounding-box crop via `expo-image-manipulator` (calculate bounding rect of points, crop, and normalize).
- [ ] Reset corners button (reverts to full frame or default margin).
- [ ] Save cropped page, update FileSystem file, and refresh document page record in SQLite.
- [ ] **Verification:** Run `npx tsc --noEmit` + linter.
- [ ] **Git:** Commit and push to `main`.
- [ ] **🛑 STOP 3:** Instruct user to test 4-corner crop handles on physical iPhone.

---

## 📋 Step 4: Filters & Image Adjustments (`Dokumente.png`)
*Document page enhancement and viewing.*
- [ ] Document page detail screen matching `Dokumente.png`:
  - Navigation header: `< Dokumente`, document title, `...` options.
  - Large centered page preview card with rounded corners and subtle shadow.
- [ ] Filter selection strip (horizontal thumbnail row):
  1. **Original:** Unmodified captured photograph.
  2. **Auto:** Contrast and brightness auto-adjustment.
  3. **Schwarzweiß (B&W):** High-contrast document binarization for clean text.
  4. **Graustufen (Grayscale):** Smooth monochrome rendering.
  5. **Magic Color:** Saturation boost with text darkening (CamScanner style).
- [ ] Implementation via Expo Go compatible Headless Canvas / `expo-image-manipulator` pipeline.
- [ ] Bottom action bar:
  - **Drehen:** Rotate 90° clockwise via `expo-image-manipulator`.
  - **Zuschneiden:** Opens Step 3 crop screen.
  - **Löschen:** Delete current page from SQLite & FileSystem with confirmation dialog.
  - **Seite hinzufügen:** Take new photo or pick from gallery to append page.
- [ ] **Verification:** Run `npx tsc --noEmit` + linter.
- [ ] **Git:** Commit and push to `main`.
- [ ] **🛑 STOP 4:** Instruct user to test filter switching and rotation on physical iPhone.

---

## 📋 Step 5: Multi-Page Document Editor
*Organizing and managing pages within a document.*
- [ ] Multi-page thumbnail carousel / grid view for the active document.
- [ ] Reorder pages (drag-and-drop or Move Left / Move Right controls) with SQLite order updates.
- [ ] Retake single page (replaces current page while preserving page index).
- [ ] Add new page (from camera or gallery) at specific position.
- [ ] Rename document inline or via modal with SQLite update.
- [ ] Page count update and SQLite synchronization.
- [ ] **Verification:** Run `npx tsc --noEmit` + linter.
- [ ] **Git:** Commit and push to `main`.

---

## 📋 Step 6: Export & Sharing (`Exportieren.png`)
*Generating PDF and image exports.*
- [ ] Export bottom sheet modal matching `Exportieren.png`:
  - Sheet title: Document name.
  - **Format selector:** Segmented buttons `[PDF]` (with PDF icon) vs `[JPG]` (with Image icon).
  - **Qualität selector:** Segmented control: `Niedrig` (Low - 72 DPI), `Mittel` (Medium - 150 DPI), `Hoch` (High - 300 DPI / Original).
  - File info row: Estimated size calculation (e.g. `Geschätzte Größe: 1,8 MB`).
  - Primary CTA button: Blue full-width button `Teilen` (Share) with iOS share icon.
- [ ] Multi-page A4 PDF builder using `expo-print`:
  - Clean HTML/CSS layout with `@page { size: A4; margin: 0; }` rendering pages seamlessly without borders.
  - Configurable image compression based on selected quality.
- [ ] Single/multi JPG export to system share or camera roll.
- [ ] Native iOS Share Sheet trigger via `expo-sharing`.
- [ ] **Verification:** Run `npx tsc --noEmit` + linter.
- [ ] **Git:** Commit and push to `main`.
- [ ] **🛑 STOP 5:** Instruct user to test PDF/JPG export and iOS share sheet on physical iPhone.

---

## 📋 Step 7: Settings & App Lock
*App configuration and biometric lock with built-in permission handling.*
- [ ] Settings Tab Screen:
  - **Erscheinungsbild (Appearance):** System, Hell (Light), Dunkel (Dark).
  - **Sprache (Language):** Deutsch (Standard), English.
  - **Standard-Qualität (Default Quality):** Niedrig, Mittel, Hoch.
  - **App-Sperre (App Lock):** Toggle switch for Face ID / Touch ID / Passcode.
- [ ] **Biometrics & Local Authentication Permissions:**
  - `expo-local-authentication` check for hardware support.
  - German and English explanation dialog before requesting Face ID.
  - Graceful fallback UI when Face ID is denied or disabled.
  - Secure state stored with `expo-secure-store`.
  - App state listener (`AppState`): locks screen when app is sent to background or restarted.
- [ ] Storage info (total scan count and disk space consumed) + "Daten bereinigen" (Cache clear).
- [ ] **Verification:** Run `npx tsc --noEmit` + linter.
- [ ] **Git:** Commit and push to `main`.

---

## 📋 Step 8: Final Verification & Release Polish
- [ ] Full end-to-end regression test on physical iPhone via Expo Go.
- [ ] Verify light mode and dark mode theme switching across all screens.
- [ ] Verify German and English localization strings across all screens.
- [ ] Verify TypeScript strict type check passes with 0 errors (`npx tsc --noEmit`).
- [ ] Final update to `CHANGELOG.md` and `docs/ROADMAP.md`.
- [ ] Final commit and push to `main`.

---

## 🚀 Phase 2 Architecture Readiness (Future Expansion)
*Kept out of Phase 1 scope but architectural interfaces preserved:*
- **OCR Service Interface:** `IOCRService` placeholder in `src/services/ocr`.
- **Cloud Sync Adapter:** `ISyncAdapter` placeholder for WebDAV / iCloud / Nextcloud.
- **E-Signature:** Signature canvas overlay placeholder.
- **ID-Card Dual Mode:** Multi-slot page template architecture.
