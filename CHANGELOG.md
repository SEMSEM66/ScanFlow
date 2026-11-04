# Changelog

All notable changes to **ScanFlow** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
