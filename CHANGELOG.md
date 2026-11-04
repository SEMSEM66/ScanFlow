# Changelog

All notable changes to **ScanFlow** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
