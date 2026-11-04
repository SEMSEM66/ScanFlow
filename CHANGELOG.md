# Changelog

All notable changes to **ScanFlow** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
