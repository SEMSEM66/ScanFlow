# ScanFlow Implementation Roadmap & Checklist

This roadmap outlines the complete implementation plan for **ScanFlow**, an offline-first iOS document scanner built with Expo (latest SDK), React Native, TypeScript (strict), and expo-router.

---

## 🎯 Architectural Principles & Expo Go Constraints

1. **Expo Go Only:** All dependencies and APIs must run in standard Expo Go without native build steps (`npx expo run:ios`).
2. **Offline-First:** All files stored in app container via `expo-file-system`; all metadata and folder structures managed in SQLite via `expo-sqlite`.
3. **Repository Pattern:** UI layers never directly invoke raw file or database operations; all interactions pass through typed services (`StorageService`, `DocumentRepository`, `FilterService`, `ExportService`).
4. **Design Accuracy:** Pixel-accurate replication of design screenshots in `/design` (`bearbeiten.png`, `Scannen.png`, `Dokumente.png`, `Exportieren.png`).
5. **Strict Typing:** 100% TypeScript with `"strict": true`; no untyped `any`.

---

## 📋 Phase 0: Project Setup & Architecture Foundations
- [ ] Initialize Expo project with `expo-router` and TypeScript strict mode.
- [ ] Configure `app.json` for iOS bundle identifier, camera permissions, face-id permissions, and orientation lock.
- [ ] Install vetted Expo Go compatible dependencies:
  - `expo-router`, `expo-camera`, `expo-image-picker`, `expo-image-manipulator`
  - `expo-file-system`, `expo-sqlite`, `expo-print`, `expo-sharing`
  - `expo-local-authentication`, `expo-secure-store`, `expo-localization`
  - `@expo/vector-icons`, `react-native-safe-area-context`, `react-native-screens`
  - `react-native-gesture-handler`, `react-native-reanimated`
- [ ] Setup Design System (`src/theme`):
  - Colors: Warm Ivory background (`#FBF9F5` / `#F7F5F0`), Primary Blue (`#0066FF`), Card White (`#FFFFFF`), Text Primary (`#111111`), Text Secondary (`#8E8E93`), Borders (`#E5E2DC`), Dark mode palette.
  - Spacing, Radius (12px, 16px, 20px, 28px pill), Typography scale (Title 1, Title 2, Body, Caption).
- [ ] Setup Localization (`src/i18n`):
  - German (default) and English locale strings.
  - Language switcher hook and persistence.
- [ ] Database & Storage Core (`src/db`, `src/services`):
  - SQLite database schema: `folders`, `documents`, `pages`.
  - Migrations and initial seed data (default folders: Rechnungen, Verträge, Ausweise, Privat).
  - FileSystem directory manager (`documents/` directory in documentDirectory).

---

## 📋 Step 1: Library Screen (`bearbeiten.png`)
*Main dashboard for viewing, organizing, and finding documents.*
- [ ] Tab Navigation layout with floating circular blue Camera Scan button.
- [ ] Top Header with large title "Dokumente" and action menu (`...`).
- [ ] Search input with instant client-side filtering by document title and tags.
- [ ] Folder category pill filter row:
  - "Alle", "Rechnungen", "Verträge", "Ausweise", "Privat", and "+ Neuer Ordner".
  - Folder management modal: Create folder, rename folder, delete folder.
- [ ] 2-column document grid:
  - Card with document thumbnail preview, title, date formatted (`DD.MM.YYYY`), page count badge (`X Seiten`).
  - Context menu (`...` button on card) with actions: Rename, Move to folder, Duplicate, Delete.
- [ ] Empty state UI with friendly German/English illustrations and CTA to scan the first document.
- [ ] Pull-to-refresh & list sorting (Date descending/ascending, Title A-Z).
- [ ] **Verification:** Run `npx tsc --noEmit`, test grid rendering, folder filtering, and search in Expo Go.

---

## 📋 Step 2: Camera Scanner (`Scannen.png`)
*Multi-page fast capture interface.*
- [ ] Fullscreen camera view using `expo-camera`.
- [ ] Glowing cyan framing corner guides matching `Scannen.png`.
- [ ] Flashlight toggle button (Off, On, Auto).
- [ ] Alignment hint pill ("Dokument im Rahmen ausrichten" / "Align document in frame").
- [ ] Capture mode toggle: "Auto" (shutter simulation / interval) vs "Manuell" (shutter button).
- [ ] Circular iOS shutter button with haptic feedback.
- [ ] Multi-page capture buffer:
  - Bottom left stacked thumbnail with blue counter badge showing captured page count (`3`).
  - Tapping thumbnail opens quick review / page management.
- [ ] Gallery import button using `expo-image-picker` (support selecting multiple images).
- [ ] "Fertig" (Done) button to commit captured pages and transition to document preview.
- [ ] **Stop & Test Gate (Step 2):** Test camera view, burst capture, page counter badge, and gallery import on real iPhone.

---

## 📋 Step 3: Interactive Document Crop
*4-corner handle adjustment and geometric correction.*
- [ ] Interactive 4-point corner handle overlay over document image.
- [ ] Pan gestures on corner handles using `react-native-gesture-handler` with bounds clamping.
- [ ] Visual polygon connecting the 4 corners.
- [ ] Magnifying loupe / zoom bubble during corner drag for millimeter-precision edge placement.
- [ ] **Expo Go Skia Compatibility Check:**
  - Test `@shopify/react-native-skia` perspective warp inside standard Expo Go.
  - If Skia native module is missing in Expo Go: notify user immediately and seamlessly fall back to bounding-box quadrilateral crop using `expo-image-manipulator` (calculate bounding rect of points, crop, and normalize).
- [ ] Reset corners button (reverts to full frame or default margin).
- [ ] Save cropped page and update document page store.
- [ ] **Stop & Test Gate (Step 3):** Test draggable handles, corner clamping, and crop execution on real iPhone.

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
- [ ] Implementation via Expo Go compatible Headless Canvas / `expo-image-manipulator` image processing pipeline.
- [ ] Bottom action bar:
  - **Drehen:** Rotate 90° clockwise/counter-clockwise via `expo-image-manipulator`.
  - **Zuschneiden:** Opens Step 3 crop screen.
  - **Löschen:** Delete current page with confirmation dialog.
  - **Seite hinzufügen:** Take new photo or pick from gallery to append page.
- [ ] **Stop & Test Gate (Step 4):** Test filter switching, image rotation, and filter rendering fidelity on real iPhone.

---

## 📋 Step 5: Multi-Page Document Editor
*Organizing and managing pages within a document.*
- [ ] Multi-page thumbnail carousel / grid view for the active document.
- [ ] Reorder pages (drag-and-drop or Move Left / Move Right controls).
- [ ] Retake single page (replaces current page while preserving page index).
- [ ] Add new page (from camera or gallery) at specific position.
- [ ] Rename document inline or via modal.
- [ ] Page count update and SQLite synchronization.
- [ ] **Verification:** Run `npx tsc --noEmit`, test reordering, adding, and deleting pages in Expo Go.

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
- [ ] **Stop & Test Gate (Step 6):** Export multi-page PDF, verify quality levels and share sheet opening on real iPhone.

---

## 📋 Step 7: Storage & SQLite Repository Layer
*Solid local persistence architecture.*
- [ ] `DocumentRepository`:
  - `getAll(folderId?, search?, sort?)`
  - `getById(id)`
  - `create(document, pages)`
  - `update(document)`
  - `delete(id)` (also removes files from filesystem)
  - `moveToFolder(documentId, folderId)`
- [ ] `FolderRepository`:
  - `getAll()`, `create(name)`, `rename(id, name)`, `delete(id)`
- [ ] FileSystem Asset Manager:
  - Persistent storage in `FileSystem.documentDirectory + 'scanflow/'`.
  - Automatic thumbnail generation and caching.
  - Safe garbage collection of orphaned image files.
- [ ] Prepared interfaces for Phase 2 (OCR results table, Sync status metadata).

---

## 📋 Step 8: Settings & Security
*App configuration and biometric lock.*
- [ ] Settings Tab Screen:
  - **Erscheinungsbild (Appearance):** System, Hell (Light), Dunkel (Dark).
  - **Sprache (Language):** Deutsch (Standard), English.
  - **Standard-Qualität (Default Quality):** Niedrig, Mittel, Hoch.
  - **App-Sperre (App Lock):** Toggle switch for Face ID / Touch ID / Passcode.
- [ ] Security Enclave Integration:
  - `expo-local-authentication` check for hardware support (`hasHardwareAsync`, `supportedAuthenticationTypesAsync`).
  - Secure state stored with `expo-secure-store`.
  - App state listener (`AppState`): locks screen when app is sent to background or restarted.
  - Clean biometric authentication prompt dialog.
- [ ] Storage info (shows total scans count and disk space consumed) + "Daten bereinigen" (Cache clear).

---

## 📋 Step 9: Permissions & Error Handling
*Polite, non-intrusive permission UX.*
- [ ] Custom rationale cards for Camera and Photo Library permissions in German and English.
- [ ] "Berechtigung erteilen" (Grant permission) button leading to iOS system prompt.
- [ ] "In Einstellungen öffnen" (Open iOS Settings) button if user previously denied permission.
- [ ] Safe fallbacks so the app **never crashes** if a permission is denied or revoked.
- [ ] Global React Error Boundary with user-friendly recovery screen.

---

## 📋 Step 10: Final Verification & Release Polish
- [ ] Full end-to-end regression test on physical iPhone via Expo Go.
- [ ] Verify light mode and dark mode theme switching across all screens.
- [ ] Verify German and English localization strings across all screens.
- [ ] Verify TypeScript strict type check passes with 0 errors (`npx tsc --noEmit`).
- [ ] Final update to `CHANGELOG.md` and `docs/ROADMAP.md`.

---

## 🚀 Phase 2 Architecture Readiness (Future Expansion)
*Kept out of Phase 1 scope but architectural interfaces preserved:*
- **OCR Service Interface:** `IOCRService` placeholder in `src/services/ocr`.
- **Cloud Sync Adapter:** `ISyncAdapter` placeholder for WebDAV / iCloud / Nextcloud.
- **E-Signature:** Signature canvas overlay placeholder.
- **ID-Card Dual Mode:** Multi-slot page template architecture.
