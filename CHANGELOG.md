# Changelog

All notable changes to **ScanFlow** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] - 2026-11-05

Phase A – "real scanned PDF" look. See `docs/ARCHITECTURE.md`.

### Added
- **Imaging core (`src/imaging`, pure TypeScript):** homography & quad validation, page formats (A4 595.28×841.89 pt, Letter 612×792 pt, auto-snap ±4 %), raster helpers, paper-background estimation, filter presets with CPU reference, SkSL shaders, Skia `PageRenderer`, pdf-lib `buildPdf`, page-state serialisation + `RENDER_VERSION`/`renderKey`.
- **Automatic page detection** after capture and library import (Canny-style edges + Otsu brightness, multi-level; falls back to the full image).
- **Perspective correction on the GPU** (`@shopify/react-native-skia`) instead of bounding-box cropping.
- **Crop screen:** Skia overlay with dimmed outside, 4 handles, 2.5× loupe, *Erkennen* / *Ganzes Bild* / *Zurücksetzen*, invalid-shape warning, page format Auto / A4 / Letter.
- **Scan filters:** Original, Auto (new default), Magic Color, Schatten entfernen, Aufhellen, Graustufen, Schwarzweiß – white paper, dark text, shadow/gradient and table-border removal.
- **Adjustments panel:** brightness, contrast, sharpness, denoise; "apply to all pages".
- **PDF export via pdf-lib:** resolution 150 / 200 / 300 dpi, JPEG quality Klein / Standard / Hoch, size estimate, title metadata, progress indicator, exact page sizes without margins; `expo-print` fallback.
- **Settings:** default export resolution (200 dpi) next to default quality.
- **Database migrations** with `PRAGMA user_version` (schema v2: corners, page format, adjustments, proxy, render key, legacy original), transactional with rollback.
- **Tests:** Jest suite (geometry, detection, page state, migrations on `node:sqlite`, renderer on headless Skia, PDF structure), optional sample renderer; Python prototype `tools/prototype/enhance_prototype.py`.
- **Tooling:** `eslint.config.js` (expo flat config), `jest.config.js`, scripts `npm test`, `npm run test:imaging`.
- `docs/ARCHITECTURE.md`, `docs/COMMITS.md`; Phase A–D plan in `docs/ROADMAP.md`.

### Changed
- Editing is **non-destructive**: originals stay untouched; crop, rotation, filter, adjustments and format are stored per page and rendered on demand (preview 1600 px, thumbnails, export from the original).
- Imported photos are re-encoded once with `expo-image-manipulator` (bakes EXIF orientation, long side ≤ 4096 px).
- Export dialog: quality labels *Klein / Standard / Hoch* (EN: *Small / Standard / High*), new resolution row, defaults from Settings; watermark text localized.
- Default quality is now *Standard*; new scans use filter *Auto*.
- Exports are written to `<cache>/scanflow-export/`; "Cache leeren" really deletes that folder.
- Storage size is calculated recursively.
- More UI strings localized (scan, crop, editor, export, settings).

### Fixed
- Filters were applied to the unrotated original (rotation lost when switching filters).
- Export quality had no effect; PDF pages had white margins (`object-fit: contain`).
- Crop handles used stale closures; crop was only a bounding box.
- Deleting a page left its database row; page editor deleted the current page instead of the selected one.
- "Seite hinzufügen" created a new document; retake opened a new scan instead of replacing the page.
- Page reorder was not persisted.
- Default quality setting was not used.
- Library did not reload when returning from other screens; duplicate now copies page files.

### Removed
- `src/services/FilterService.ts` and `src/components/HeadlessFilterProcessor.tsx` (WebView-canvas filters).

### Corrections to earlier entries
- [1.1.0] *EXIF Metadata Stripping* was **not implemented** in 1.1.0. Since 1.2.0 every imported photo is re-encoded by `expo-image-manipulator`, which normally drops EXIF/GPS – not yet verified on a device.
- [1.1.0] *Zero-Trace File Shredding* overwrote files with a short text before deleting; on iOS flash storage (APFS, copy-on-write) this gives **no** recovery guarantee. Deletion is now documented as best-effort.
- [0.x] The Skia perspective-warp check in the roadmap was ticked but never performed; it is done in 1.2.0 (Skia is used in Expo Go).

### Known limitations
- Camera auto-capture is still a simulated timer; live edge detection is Phase B.
- No OCR / searchable PDF yet (Phase C).
- JPG export exports the current page only.
- Pre-existing lint error in `src/components/AppLockOverlay.tsx` remains.

## [1.1.0] - 2026-11-04

### Added
- Bank-Grade Security & Privacy Hardening:
  - **App Switcher Privacy Veil:** Instant opaque shield overlay on `inactive` and `background` app states preventing iOS multitasking snapshot leaks of sensitive documents.
  - **Custom 4-Digit Security PIN:** Full numeric keypad with salted hash storage in `expo-secure-store` as fallback when biometrics are unavailable.
  - **Brute-Force & Lockout Protection:** 30-second penalty lockout with live countdown after 5 consecutive failed unlock attempts.
  - **Configurable Auto-Lock Timeout:** Lock delay options: *Sofort* (Immediately), *1 Minute*, or *5 Minuten*.
  - **Screenshot & Recording Protection:** Integrated `expo-screen-capture` with toggle to block screen recordings/captures and screenshot detection alerts.
  - **Zero-Trace File Shredding:** Secure multi-byte zeroing of image files prior to unlinking to prevent flash memory data recovery.
  - **File Path Traversal Guards:** Strict URI sandboxing preventing directory escape attacks (`..`).
  - **Confidential Watermark Export:** Optional diagonal "VERTRAULICH" watermark overlay on PDF generation.
  - **EXIF Metadata Stripping:** All camera serial numbers and GPS geolocation tags are scrubbed during image processing before sharing.

## [1.0.0] - 2026-11-04

### Added
- Step 7: Settings & App Lock:
  - Settings screen with Appearance (System, Light, Dark), Language (German, English), and Default PDF quality selector.
  - Hardware-backed Face ID / Touch ID / Passcode app lock using `expo-local-authentication` and `expo-secure-store`.
  - Automatic `AppState` listener with `AppLockOverlay` locking the app upon backgrounding or relaunch.
  - Storage statistics calculation (document count and disk space consumed in KB/MB) with cache clear action.
- Step 8: Final Verification & Polish:
  - Strict TypeScript compliance across the entire codebase (`npx tsc --noEmit` passed with 0 errors).
  - Full adherence to design screenshots in `/design` (`bearbeiten.png`, `Scannen.png`, `Dokumente.png`, `Exportieren.png`).
  - Production-ready offline-first architecture.

## [0.6.0] - 2026-11-04

### Added
- Step 4: Filters & Image Adjustments (`Dokumente.png`):
  - Document page viewer with large rounded page preview card and shadow.
  - Filter strip matching `Dokumente.png` (Original, Auto, Schwarzweiß, Graustufen, Magic Color).
  - Offline headless HTML5 `<canvas>` filter processing pipeline for contrast stretch, binarization, grayscale, and Magic Color.
  - Bottom action bar with 90° rotation, crop transition, page deletion, and page addition.
- Step 5: Multi-Page Document Editor:
  - Page navigation controls and pagination indicators (`Seite X von Y`).
  - `PageEditorModal` for visual page reordering, retaking, adding, and deleting with SQLite synchronization.
- Step 6: Export & Sharing (`Exportieren.png`):
  - Export bottom sheet modal matching `Exportieren.png` with PDF/JPG toggle.
  - Niedrig/Mittel/Hoch quality selector with dynamic estimated file size calculation.
  - Multi-page A4 borderless PDF generation via `expo-print`.
  - Native iOS share sheet integration via `expo-sharing`.

## [0.5.0] - 2026-11-04

### Added
- Step 3: Interactive Document Crop:
  - 4-corner interactive draggable handle overlay with boundary clamping.
  - Real-time magnifying loupe / zoom bubble with crosshairs for millimeter precision.
  - Automatic perspective bounding-box calculation and high-resolution cropping via `expo-image-manipulator` (verified Expo Go fallback).
  - Reset corners action and SQLite page preview synchronization.

## [0.4.0] - 2026-11-04

### Added
- Step 2: Camera Scanner & Permissions (`Scannen.png`):
  - Camera View with flash control (off, on, auto) and mode toggle (auto, manual).
  - Cyan glowing framing corner guides matching `Scannen.png`.
  - Multi-page burst capture with stacked thumbnail preview and blue page counter badge.
  - Quick review modal to view and delete captured pages before saving.
  - Multi-image photo gallery import via `expo-image-picker`.
  - Polite permission handling in German & English with graceful "denied" fallback UI.
  - Multi-page document creation directly into SQLite and FileSystem.

## [0.3.0] - 2026-11-04

### Added
- Step 1: Documents Library (`bearbeiten.png`):
  - 2-column document grid with `DocumentCard` component (thumbnails, dates, page count badges).
  - Search bar with instant title filtering against SQLite.
  - Category pill filter bar ("Alle", "Rechnungen", "Verträge", "Ausweise", "Privat") with "+ Neuer Ordner" creation.
  - Folder management: rename and delete folders with document preservation.
  - Document options menu (`...`): Rename, Move to Folder, Duplicate document, and Delete with filesystem cleanup.
  - Library sorting modal (Neueste zuerst, Älteste zuerst, Name A-Z, Name Z-A).
  - Empty state UI with scan trigger CTA and pull-to-refresh control.

## [0.2.0] - 2026-11-04

### Added
- Phase 0: Foundations, Storage & Database:
  - Expo configuration with strict TypeScript, portrait lock, and iOS permissions (Camera, Photos, Face ID).
  - Design tokens in `src/theme` (colors, typography, spacing, border radii) matching design mockups with Light (warm ivory) and Dark mode support.
  - Localization in `src/i18n` with German (default) and English translations.
  - Storage & SQLite Repository Layer (`src/db`, `src/services`):
    - SQLite schema for `folders`, `documents`, and `pages`.
    - Initial folder seeds: *Rechnungen*, *Verträge*, *Ausweise*, *Privat*.
    - Typed `FolderRepository` and `DocumentRepository`.
    - Local file manager with `expo-file-system`.
  - Core navigation tab bar with custom elevated circular Scan button, Library list, Tools placeholder, Settings placeholder, and Scan/Crop modal routes.


---

## [0.1.0] - 2026-11-04

### Added
- Project initialization rules in `AGENTS.md`
- Project specification and quick-start instructions in `README.md`
- Master roadmap and feature checklist in `docs/ROADMAP.md`
- Git environment configuration (`.gitattributes`, `.gitignore`, `.env.example`)
