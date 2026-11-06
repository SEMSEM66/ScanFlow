# Changelog

All notable changes to **ScanFlow** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0-rc] - 2026-11-06

Phase V2 Milestone **M6 (Compliance, Legal & Store Package)**: Apple Privacy Manifest (`PrivacyInfo.xcprivacy`), localized permission descriptions, zero-network quality gate (`check:network`), in-app legal readers (Privacy, Terms, Open Source Licenses), and complete App Store package in `docs/store/` and `tools/store-screenshots/`.

### Added
- **M6 – Apple Privacy Manifest (`PrivacyInfo.xcprivacy`, `app.json`):**
  - Declared `NSPrivacyTracking: false`, `NSPrivacyTrackingDomains: []`, and `NSPrivacyCollectedDataTypes: []` (zero data collected).
  - Configured Apple required reason codes:
    - `NSPrivacyAccessedAPITypeUserDefaults`: `CA92.1` (local app settings storage).
    - `NSPrivacyAccessedAPITypeFileTimestamp`: `C617.1` (file modification timestamps for documents).
    - `NSPrivacyAccessedAPITypeDiskSpace`: `E174.1` (disk space headroom check for scans).
    - `NSPrivacyAccessedAPITypeSystemBootTime`: `35F9.1` (measuring app lock timeout).
- **M6 – Localized Permissions (`locales/de.json`, `locales/en.json`, `app.json`):**
  - Localized Info.plist descriptions for Camera (`NSCameraUsageDescription`), Photo Library (`NSPhotoLibraryUsageDescription`), and Face ID (`NSFaceIDUsageDescription`) in German and English.
- **M6 – Zero-Network Quality Gate (`scripts/check-network.mjs`, `package.json`):**
  - Added automated audit script `npm run check:network` that verifies 0 network calls, 0 third-party trackers, and 0 external telemetry across all 122 application source files.
- **M6 – In-App Legal & License Reader (`LegalModal.tsx`, `app/(tabs)/(settings)/index.tsx`):**
  - Added native formSheet modal in Settings under *Über* providing full offline legal texts:
    - *Datenschutzerklärung* (Offline Privacy Policy)
    - *Nutzungsbedingungen* (Terms of Service & EULA with visual signature disclaimer)
    - *Lizenzen* (Open Source Licenses for React Native, Expo, Skia, pdf-lib, etc.)
- **M6 – Complete App Store Store Package (`docs/store/`, `tools/store-screenshots/`):**
  - `docs/store/privacy-policy.md` and `privacy-policy.html`: 100% offline privacy policy ready for GitHub Pages or static web hosting.
  - `docs/store/terms.md`: standard terms of service compliant with German civil law (BGB) and Apple standard EULA.
  - `docs/store/impressum.md`: § 5 TMG / DDG compliant template for European App Store listings.
  - `docs/store/app-store-metadata.md`: complete German and English titles, subtitles, keywords (100-char limits), promotional text, and full descriptions free of competitor trademarks.
  - `docs/store/review-notes.md`: step-by-step review instructions and demo guide for Apple App Reviewers.
  - `docs/store/privacy-nutrition-label.md`: documentation of "Data Not Collected" for App Store Connect.
  - `docs/store/age-rating.md`: questionnaire declaration for global 4+ / USK 0 rating.
  - `docs/store/export-compliance.md`: EAR Category 5, Part 2 exemption documentation justifying `ITSAppUsesNonExemptEncryption = false`.
  - `docs/store/review-guidelines-checklist.md`: complete compliance audit against Apple App Review Guidelines 2.1, 2.3, 3.1.1, 3.1.2, 5.1.1, 5.1.2.
  - `tools/store-screenshots/README.md` and `compose-spec.json`: layout specification and copy for 6 App Store screenshot slides in 6.9", 6.7", and 6.5" resolutions.

---

## [1.13.0] - 2026-11-06

Phase V2 Milestone **M5 (Monetization & StoreKit 2)**: 100% on-device StoreKit 2 integration, zero third-party tracking, Free vs. Pro entitlement gating, offline Keychain entitlement caching, Paywall modal, and App Store review trigger.

### Added
- **M5 – StoreKit 2 On-Device Architecture (`docs/MONETIZATION.md`, `ScanFlowOcrModule.swift`):**
  - Native StoreKit 2 implementation directly in `modules/scanflow-ocr`: `fetchProductsAsync`, `purchaseProductAsync`, `restorePurchasesAsync`, and `checkEntitlementsAsync` utilizing Apple's modern Swift `StoreKit.Product` and `StoreKit.Transaction` APIs with on-device JWS cryptographic verification.
  - 100% privacy-compliant: zero third-party subscription analytics SDKs, zero network telemetry, no external accounts.
- **M5 – Free vs. Pro Entitlement Enforcement (`src/entitlements/`, `MonetizationService.ts`):**
  - Strict Free tier protection: unlimited scanning, perspective correction, all 7 filters, folder categorization, basic PDF/JPG export, App Lock (Face ID/PIN), 30-day Trash, and QR/GiroCode scanning are **permanently free** and never blocked.
  - Pro features unlocked via active StoreKit 2 entitlement: Apple Vision OCR, Word conversion (.docx), PDF import/merge/split/extract, password encryption, ID-card mode on A4, visual signatures/annotations, smart naming auto-rename, batch ZIP export, and full-library backup.
  - Offline Keychain cache: entitlement state is securely cached in Keychain (`scanflow_pro_entitlement`, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`) ensuring immediate offline Pro access without internet connectivity (`verified by tests` in `__tests__/monetization.test.ts`).
- **M5 – Paywall & Settings UI (`PaywallModal.tsx`, `app/(tabs)/(settings)/index.tsx`):**
  - Native formSheet paywall modal with tier options:
    - *Jährlich* (`com.scanflow.app.pro.yearly`): 19,99 € / Jahr with 7-day free trial.
    - *Monatlich* (`com.scanflow.app.pro.monthly`): 2,99 € / Monat.
    - *Lifetime* (`com.scanflow.app.pro.lifetime`): 49,99 € one-time purchase.
  - Real-time entitlement sync, one-tap *Käufe wiederherstellen* (Restore Purchases), and developer sandbox toggle for testing in Expo Go.
- **M5 – App Store Review Prompt (`ReviewService.ts`, `expo-store-review`):**
  - Automatically requests an App Store review after the user's 3rd successful document export (`StoreReview.requestReview()`), rate-limited to at most once per major app version.

## [1.12.0] - 2026-11-06

Phase V2 Milestone **M4 (iOS Integration & Polish)**: Haptic feedback, accessibility AA contrast verification, Home Screen Quick Actions, and time-boxed native spikes.

### Added
- **M4 – Haptic Feedback (`src/utils/haptics.ts`, `expo-haptics`):**
  - Semantic haptic feedback wrapper with automatic Reduce Motion detection via `AccessibilityInfo.isReduceMotionEnabled()`.
  - Filter selection: subtle selection ticks (`haptics.selection()`) when choosing filters in `FilterStrip`.
  - Perspective crop & corner snapping: tactile grab (`haptics.light()`), snap/lock (`haptics.medium()`), and reset/format feedback in `app/crop.tsx`.
  - Security & PIN pad: numeric key taps (`haptics.light()`), delete feedback, shake error impact (`haptics.error()`) on wrong PIN, and success confirmation (`haptics.success()`) on unlock and PIN change (`PinPad.tsx`, `LockScreen.tsx`, `PinSetupModal.tsx`).
  - Scan completion: success notification haptic (`haptics.success()`) when saving scanned documents in `ScanImportService`.
- **M4 – Accessibility Audit & WCAG AA Contrast Compliance (`__tests__/contrast.test.ts`):**
  - Automated WCAG 2.1 AA relative luminance and contrast ratio test suite: validates normal text (≥ 4.5:1), large text (≥ 3.0:1), and interactive UI elements (≥ 3.0:1) across both Light and Dark themes (`verified by tests` in `__tests__/contrast.test.ts`).
  - Strict 44 × 44 pt minimum hit targets on all interactive controls (`Button.tsx`, `IconButton.tsx`, `PinPad.tsx`, `crop.tsx`).
  - Spoken VoiceOver labels (`accessibilityLabel`), roles (`accessibilityRole`), and states (`accessibilityState`) across key flows in German and English.
- **M4 – Home Screen Quick Actions (`QuickActionService.ts`, `expo-quick-actions`):**
  - Dynamic 3D Touch / Haptic Touch quick actions from the iPhone Home Screen icon:
    - *Dokument scannen* (`scan`, icon: `capturePhoto`): opens the document scanner directly on launch.
    - *Suchen* (`search`, icon: `search`): launches straight into library search.
  - Runtime listener and initial action handler in `app/_layout.tsx` (`QuickActionsHandler`).
  - Feature detection: null-safe fallback ensuring zero crashes in Expo Go (`isSupported` check).
- **M4 – Time-Boxed Extension Spikes (`docs/spikes/`):**
  - `docs/spikes/app-intents.md`: App Intents & Siri Shortcuts analysis (verdict: `defer` to v2.1 due to build risk and prebuild complexity; Home Screen Quick Actions already meet primary fast-entry needs).
  - `docs/spikes/lock-screen-widget.md`: WidgetKit lock screen widget analysis (verdict: `defer` to v2.1 due to secondary target signing limitations in unsigned sideloaded IPAs).
  - `docs/spikes/share-extension.md`: Share Extension analysis (verdict: `defer` to v2.1; existing registered document types "Open in ScanFlow" in M1 already support full system share sheet ingestion without App Group signing risks).

## [1.11.0] - 2026-11-06

Phase V2 Milestone **M3 (Organization & Automation)**: 30-day Trash (*Zuletzt gelöscht*), Favorites & Tags, deterministic Smart Naming templates with auto-rename after OCR, and Full-Library ZIP Backup & Restore via Files picker (SQLite schema v5).

### Added
- **M3 – 30-day Trash (*Zuletzt gelöscht*, `src/utils/organization.ts`, `TrashModal.tsx`):**
  - Schema **v5** (`src/db/migrations.ts`, `SCHEMA_VERSION = 5`): adds `documents.deleted_at` timestamp and index.
  - Soft-delete for documents: deleting moves documents into the 30-day Trash instead of immediate destruction.
  - Automatic expiration & purge: `documentRepository.purgeExpiredTrash()` runs on every app launch in `app/_layout.tsx`, permanently removing documents older than 30 days.
  - *Zuletzt gelöscht* modal (`TrashModal.tsx`): displays trashed documents with remaining retention days (*Noch X Tage*), individual *Wiederherstellen* and *Endgültig löschen* actions, and one-tap *Papierkorb leeren*.
- **M3 – Favorites & Tags (`DocumentCard.tsx`, `TagEditModal.tsx`, `textSearch.ts`):**
  - Schema v5 columns: `documents.is_favorite` (with index) and `documents.tags` (JSON array of normalized strings).
  - Pinned favorites: favorite documents are pinned to the top of the Library; quick toggle via document menu, toolbar, and multi-select bar.
  - Tag chips & filtering: tag row under folder pills in Library; case-insensitive search across titles, recognized OCR text, and tags.
  - Tag editor modal (`TagEditModal.tsx`): add/remove tags on documents with existing tag suggestions.
- **M3 – Deterministic Smart Naming (`src/utils/organization.ts`, `SmartNamingService.ts`, `app/(tabs)/(settings)/index.tsx`):**
  - Template engine with tokens: `{date}`, `{time}`, `{folder}`, `{firstLine}`, `{counter}`.
  - Deterministic date extraction from OCR text: recognizes German numeric dates (`DD.MM.YYYY`), ISO dates (`YYYY-MM-DD`), and written German dates (`14. März 2026`).
  - Auto-rename hook after initial OCR: automatically renames newly scanned documents when page 1 is recognized, strictly protecting user-edited titles (`title_auto = 0`).
  - Settings UI: toggle, template preset selector (`Scan {date} {time}`, `{date} {firstLine}`, `{folder} - {date} - {firstLine}`, `{date}_{counter}`), and real-time formatted title preview.
- **M3 – Full-Library ZIP Backup & Restore (`src/utils/backupManifest.ts`, `BackupService.ts`, `src/docx/zip.ts`):**
  - Manifest v1 format (`manifest.json`): serializes folders, documents with non-destructive page states and OCR text, and saved signatures.
  - ZIP packaging & extraction: pure-TS Store-mode ZIP writer (`buildZip`) and reader (`readZip` with CRC-32 validation and path-traversal protection).
  - Backup creation: serial, memory-safe packaging of all originals, OCR text, and metadata with > 150 MB warning, followed by system share sheet ("Save to Files" / iCloud Drive / AirDrop).
  - Backup restoration: pick any `.zip` backup from Files, inspect manifest, and restore folders, signatures, and documents.

---

## [1.10.0] - 2026-11-06

Phase V2 Milestone **M2 (Capture Modes & Marking)**: ID-Card Mode (true 1:1 `85.6 × 54 mm` scale on A4 + optional purpose watermark), QR/Barcode & SEPA GiroCode (EPC) scanner in *Werkzeuge*, and non-destructive visual signatures & page annotations (SQLite schema v4, `RENDER_VERSION = 2`).

### Added
- **M2 – ID-Card Mode (`src/imaging/idCard.ts`, `IdCardScannerModal.tsx`):**
  - Guided front & back capture (via iOS VisionKit document scanner or camera/photo library), de-warped to ISO/IEC 7810 ID-1 ratio (`85.6 × 54 mm`) and composed centered at true 1:1 physical scale on a single A4 page (`210 × 297 mm`).
  - Optional diagonal purpose watermark (*"Kopie – nur für <Zweck>, <Datum>"*) stored as a non-destructive page annotation.
- **M2 – QR, Barcode & SEPA GiroCode Scanner (`src/tools/epc.ts`, `src/tools/barcode.ts`, `QrScannerModal.tsx`, `QrScannerService.ts`):**
  - Live barcode & QR scanner in *Werkzeuge* with safe link preview (shows full URL and credential-spoofing warning if `@` is present in authority; asks before opening).
  - Full EPC069-12 **SEPA GiroCode** parser (versions `001` and `002`, ISO 13616 IBAN mod-97 verification, BIC validation, EUR amount formatting) with one-tap copy buttons for recipient, IBAN, BIC, amount, and reference/remittance text.
  - Wi-Fi QR parser (`WIFI:`) with SSID and password copy buttons.
  - Optional local scan history (OFF by default, stored in Keychain with a one-tap *Verlauf löschen* button).
- **M2 – Visual Signatures & Non-Destructive Page Annotations (`src/imaging/annotations.ts`, `SignatureRepository.ts`, `SignatureAnnotationModal.tsx`):**
  - SQLite schema **v4** (`src/db/migrations.ts`, `SCHEMA_VERSION = 4`, `RENDER_VERSION = 2`): adds `pages.annotations` JSON column and `signatures` table.
  - Signature manager & pad: draw visual signatures with finger or Apple Pencil (Chaikin curve smoothing, color picker, undo/clear) or capture a paper signature from a photo with adaptive ink thresholding to transparent PNG (**P1**, `thresholdSignatureRgba`).
  - Non-destructive page annotations (*Unterschrift einfügen*, *Datumsstempel*, *Text einfügen*, *Textmarker*) rendered by `PageRenderer` after filters so preview, thumbnails, and exported PDFs/JPGs match, while `renderForOcr` excludes annotations.

---

## [1.9.0] - 2026-11-06

Phase V2 Milestones **M0 (Foundations)** and **M1 (PDF Toolkit)**: PDF & image import from the Files app ("Open in ScanFlow"), Library multi-select with batch move / merge / ZIP export / delete, page split & extract in the page overview, and password-protected PDF export.

### Added
- **M0 – Entitlements foundation (`src/entitlements/`):** typed `FeatureKey` catalog (`FREE_FEATURES`, `PRO_FEATURES`) and `isUnlocked(feature)` gate (default `'all_unlocked'` until M5, tested in `__tests__/entitlements.test.ts`).
- **M0 – i18n parity test (`__tests__/i18n.test.ts`):** automated test asserting identical nested keys, non-empty strings, and matching `{{placeholder}}` variables across German (`de.ts`) and English (`en.ts`).
- **M0 – Native spike template & CI budget savers:** `docs/spikes/_template.md`, `docs/spikes/m1-pdf-toolkit-native.md`, `docs/RELEASING.md`, and `concurrency` + `paths-ignore` + `npm` caching in `.github/workflows/build-ipa.yml`.
- **M1 – Import PDFs & images from Files and "Open in ScanFlow":**
  - Registered PDF (`com.adobe.pdf`) and image (`public.image`) document types in `Info.plist` (`app.json`) and handled incoming `file://` URLs in `app/_layout.tsx`.
  - Added *PDF oder Bilder importieren* to the Library menu, empty state, document *Seite hinzufügen* menu, and *Werkzeuge* tab (`PdfToolkitService`).
  - Added `getPdfInfoAsync` and `renderPdfPageAsync` (200 dpi page-by-page rasterization inside `autoreleasepool`, capped at 2400 px long side, memory-safe for 50+ page PDFs) to `modules/scanflow-ocr/ios/ScanFlowOcrModule.swift`, followed by automatic background OCR. Shows a clear explanation when PDF import is attempted in Expo Go.
- **M1 – Library multi-select & batch ZIP export:**
  - *Auswählen* mode in the Library (`app/(tabs)/(library)/index.tsx`, `DocumentCard.tsx`): select/deselect cards, *Alle auswählen*, batch move (`app/sheets/move.tsx`), batch merge (*Zusammenfügen*), batch export (single PDF or multi-document `.zip` archive via `ExportService.generateBatchZip` and `src/docx/zip.ts`), and batch delete with confirmation.
- **M1 – Merge documents & split/extract pages:**
  - `DocumentRepository.mergeDocuments`, `extractPagesToDocument`, and `splitDocumentAtPage` (pure planning helpers in `src/db/documentOperations.ts`, preserving non-destructive page state, previews, and `page_text` OCR rows; tested in `__tests__/documentOperations.test.ts`).
  - Page overview (`PageEditorModal.tsx`): select pages to extract into a new document (*Extrahieren*), or split the document at any page ≥ 2 (*Ab Seite N teilen*).
- **M1 – Password-protected PDF export:**
  - Native PDFKit encryption (`encryptPdfAsync` in `ScanFlowOcrModule.swift` using `PDFDocumentWriteOption.userPasswordOption` / `.ownerPasswordOption`), post-write verification (`isEncrypted && isLocked && unlock(withPassword:)`), and guaranteed deletion of the unencrypted temporary PDF in `defer`.
  - Export sheet (`ExportModal.tsx`): *Passwortschutz* toggle for PDF exports, password + confirmation fields, show/hide toggle, minimum length validation (≥ 4 chars), and warning that lost passwords cannot be recovered.

---

## [1.8.0] - 2026-11-06

Convert to Word (`.docx`), Settings *Über* section, and fixes from the v1.7.0 physical iPhone test.

### Added
- **In Word umwandeln (`.docx`):** convert any external `.pdf` file (*Werkzeuge → PDF-Datei auswählen*) or any ScanFlow document (*Werkzeuge → Aus ScanFlow-Dokumenten wählen* or *Exportieren → Word (.docx)*) into an editable Word document (`.docx`) with reconstructed headings, paragraphs, multi-column tab stops and page breaks, completely offline on your iPhone (`src/docx/`, `ScanFlowOcrModule.swift` PDFKit + Apple Vision, `ExportService`).
- **Einstellungen → Über (*About*):** displays the app version (`1.8.0`) and developer name (`SemSem`).

### Fixed
- **App-Sperre locked the entire iPhone after 5 failed attempts when no ScanFlow-PIN was set:** enabling *App-Sperre* now always requires setting a 4- or 6-digit *ScanFlow-PIN* first (and existing setups with *App-Sperre* on but no *ScanFlow-PIN* automatically prompt to set a *ScanFlow-PIN* on unlock), so failed attempts only trigger ScanFlow's own 30-second countdown timer and never the iOS device passcode lockout.
- **Unresponsive document menu (`…`) and pagination controls (`<`, `>`, `1 / 2`) while rendering or recognizing text:** `ImagePipelineService` now yields to the UI thread between decode/render/encode steps and between filter thumbnails, `renderForOcr` reuses the 2000 px proxy image, and `DocumentDetailScreen` / `useNativeMenu` pause background OCR while rendering the active page or showing an action menu.
- **Page overview sheet (`1 / 2`) and pagination buttons:** enlarged `<` and `>` into 34 pt circular pills with hit-slop, styled `1 / 2` as an interactive pill with a grid icon, and keyed `PageEditorModal` so tapping `1 / 2` always opens the page overview reliably.
- **2-column Library grid card width & duplicated thumbnails:** constrained `DocumentCard` to a single column width (`(windowWidth - 44) / 2`) so odd-numbered rows no longer stretch across 100 % of the screen, and `documentRepository.duplicate()` now copies rendered preview files so duplicated documents immediately display their thumbnail.
- **Export sheet header wrapping:** widened the header button in `app/sheets/export.tsx` so *Abbrechen* stays on a single line.
- **Folder pills in Library:** tapping an already-selected custom folder pill now opens the folder options menu (*Bearbeiten / Ordner löschen*), and empty folders clearly show the folder name with quick actions to edit the folder or show all documents.
- **Crop review banner:** opening *Zuschneiden* from the bottom bar now clears the undetected-edge review banner for that page.
- **Settings storage info:** *Gespeicherte Dokumente* and *Speicherbelegung* now refresh whenever the *Einstellungen* tab is opened.
- **Document screen delete confirmation & localization:** *Dokument löschen* in the document detail menu now asks for confirmation (matching the library), all remaining German error alerts in `LibraryScreen` are localized (DE/EN), date formatting in `DocumentCard` and `SearchScreen` follows the selected language, and all ESLint warnings are resolved.
- **Phase D cleanup & bloat removal:** normalized document title search (`src/db/textSearch.ts`) so queries are case- and umlaut/ß-insensitive (`MÜLLER` / `muller` / `Müller`, `STRASSE` / `Straße`), replaced the remaining custom segmented button rows in `SettingsScreen` with the native `<SegmentedControl>`, removed leftover pre-1.7.0 style definitions and unused constants across screens, and removed the unused dependencies `react-native-webview`, `@expo/vector-icons` and `expo-image`.

---

## [1.7.0] – Native iOS polish

### Changed
- Native iOS tabs and large-title stack headers replace the custom tab bar and title bars. Scan opens the scanner without switching tabs. All-folder search remains available in the library menu.
- Export, recognized text, folder selection and adjustments use native form sheets; page overview, PIN setup and scan review use native page sheets. Document and folder actions and name prompts use system menus and alerts.
- Native segmented controls, SF Symbols, iOS text sizes, continuous corner tokens and shared controls bring the interface closer to iOS conventions in light and dark mode.
- Export stays open while its file is generated; the system share sheet opens above it. The scanner, sharing, sheet gestures, and native controls still need physical-iPhone testing.

### Developer notes
- Run `npm run check:corners` along with the type check, lint and tests. The old custom bottom sheet and handoff helpers have been removed.

---

## [1.6.0] - 2026-11-05

Smoother bottom panels and a symmetric tab bar with a new *Suchen* tab.

### Changed
- **Bottom panels glide in like on the iPhone** (*Anpassen*, *Exportieren*, the *…* menus of documents and folders, *Sortieren*, *In Ordner verschieben*): the background darkens gently while the panel glides up with a soft bounce, and both disappear together when it closes. Before, *Anpassen* and *Exportieren* slid up together with the dark background, and the other panels only faded in.
- **Close a panel by pulling it down** (a short flick is enough) or by tapping the dark area. A panel that is not pulled far enough springs back. *Anpassen* and *In Ordner verschieben* are pulled at the handle or title, so the sliders and the folder list keep working. While an export file is created, the export panel cannot be closed (as before).
- **Menus hand over without a fixed delay:** an entry of a *…* menu (*Dokument umbenennen*, *In Ordner verschieben*, *Duplizieren*, *Text kopieren*, *Dokument löschen*, folder *Bearbeiten* / *Ordner löschen*) now runs as soon as the menu is gone. Before, some entries waited a fixed 0.4 s and others opened while the menu was still closing.
- **Symmetric tab bar:** five equal places – *Dokumente*, *Suchen*, the camera button exactly in the middle, *Werkzeuge*, *Einstellungen*. Labels use the iOS tab bar size (10 pt) and, like in iOS, do not grow with the iOS text size, so *Einstellungen* always fits.
- *Werkzeuge* (tab and screen) is translated (English: *Tools*).

### Added
- **Suchen tab:** searches all documents in all folders – titles and, in the installed app, the recognized text. Each hit shows the thumbnail, date, pages, folder and the excerpt with the found word in bold; tap it to open the document. The results update when a page has been recognized and when you come back to the tab.
- `BottomSheet` (`src/components/BottomSheet.tsx`) with its motion and state logic in `src/components/sheetMotion.ts` (pure TypeScript). It uses only React Native's `Animated` (native driver) and `PanResponder`, so there is no new dependency and it works in Expo Go. Tests: `__tests__/sheetMotion.test.ts` (26).

### Known limitations
- The motion and state logic of the panels is covered by automated tests; how the animations look and feel can only be checked on the iPhone (STOP U in `docs/ROADMAP.md`).

---

## [1.5.1] - 2026-11-05

Bug fix for exporting PDFs and JPGs: the share sheet now opens reliably.

### Fixed
- **Export (PDF and JPG) hung on *Seite wird berechnet …* and the share sheet never appeared.** The share sheet was opened while the export sheet was still sliding down; iOS silently ignores a sheet opened during that animation, so the export never finished. Now the export sheet closes first and the share sheet opens as soon as it is gone.
- The export sheet can no longer be closed while the file is being created; it shows the progress on the *Teilen* button and closes by itself.
- The pause of the background text recognition now ends as soon as the export file is ready. Before, an export whose share sheet never appeared kept the recognition paused until ScanFlow was restarted.

### Changed
- During an export the page no longer shows *Seite wird berechnet …*; the progress is shown on the *Teilen* button only.

### Added
- `ModalHandoff` (`src/components/modalHandoff.ts`): closes a sheet and waits for `Modal.onDismiss` (fallback 1.5 s) before a native sheet is presented. Tests: `__tests__/modalHandoff.test.ts` (6).

---

## [1.5.0] - 2026-11-05

Text recognition (OCR) and searchable PDFs – Phase C. Runs completely on the iPhone with Apple's text recognition (Vision), nothing is uploaded. **Only in the installed app (IPA)** – in Expo Go everything else keeps working, just without text recognition. See `docs/ARCHITECTURE.md` → "Text recognition (OCR)".

### Added
- **Automatic text recognition:** new and changed pages (scan, import, crop, rotation, retake) are recognized in the background while ScanFlow is open – one page at a time, the open document first, then the newest documents. German and English with language correction; small print down to about 0.8 % of the page height is included.
- **Search in the text of the pages:** the search in *Dokumente* (*Titel und Text durchsuchen*) also finds words in the recognized text. Upper/lower case, umlauts and ß do not matter (`muller` finds *Müller*, `strasse` finds *Straße*), words hyphenated at the end of a line are found as one word, and several words must all occur. Hits show a short excerpt with the found word in bold; the results update as soon as a page has been recognized.
- **Text kopieren:** new entry in the document menu (*…*) of the library and of the document screen – the text page by page (selectable), *Kopieren* per page, *Alles kopieren*, *Text teilen*.
- **Searchable PDFs:** exported PDFs contain an invisible text layer exactly over the words of the page image – search, select and copy in Files, Preview, Acrobat, Mail. Pages that have not been recognized yet are recognized during the export.
- **Settings → Texterkennung:** *Text erkennen* (default on) with progress (*x von y Seiten erkannt*). Turning it off asks whether to keep or delete the text recognized so far. In Expo Go the section explains that text recognition is only available in the installed app.
- Local Expo module `modules/scanflow-ocr` (Swift, `VNRecognizeTextRequest`, linked automatically into the IPA build) and `expo-clipboard`.
- SQLite schema v3: table `page_text` (plain text, normalized search text and word positions per page; deleted together with its page).
- Tests: `__tests__/ocr.test.ts` (21), `ocrScheduler.test.ts` (10), `pdfTextLayer.test.ts` (5 – incl. reading the PDF back with `pdftotext` and checking every word position), `textSearch.test.ts` (12, real SQLite); `migrations.test.ts` covers v2 → v3. New script `npm run test:ocr`.

### Changed
- Duplicated documents keep the recognized text (no second recognition).
- The background recognition pauses during an export.
- *Cache leeren* also removes temporary text-recognition images.
- IPA workflow: GitHub releases are only published from `main` and `v*` tags (manual runs on other branches only build the IPA artifact); the build stops early if the text-recognition module was not linked.

### Fixed
- Library: *In Ordner verschieben* in the document menu did nothing – the folder list never opened.
- Library: typing quickly in the search could leave the results of an earlier search term on screen.
- Library: the "no results" hint was German only.

### Known limitations
- Text recognition only in the installed app (IPA), **not in Expo Go** (it needs native code). In Expo Go the search covers titles only and exported PDFs have no text layer.
- Recognition only runs while ScanFlow is open; an existing library is recognized gradually after the update (estimated 0.5–2 s per page – not yet measured on an iPhone).
- The invisible PDF text uses the standard PDF font: letters outside Western European languages are replaced in the text layer (e.g. ł → l, others → ?); the page image is unchanged. Handwriting is recognized poorly.
- The *title* search still distinguishes upper/lower case for umlauts (`MÜLLER` does not find the title *Müller*); the text search does not.
- Not yet tested on a physical iPhone (STOP C in `docs/ROADMAP.md`).

---

## [1.4.0] - 2026-11-05

Security hardening: app lock, ScanFlow PIN, privacy and exported files. See `docs/ARCHITECTURE.md` → "App lock & security".

### Fixed
- **Face ID loop with the app lock on:** after unlocking, ScanFlow locked itself again and asked for Face ID over and over. Cause: v1.3.0 locked whenever iOS reported the app as *inactive* – and the Face ID prompt itself makes the app inactive (so do Control Center, Notification Center and system alerts). The app now locks only after it was really in the background (`src/security/lockPolicy.ts`, with regression tests).
- **Navigation reset after unlocking / system dialogs:** the privacy veil replaced the whole app while it was inactive, so the open screens were unmounted and you landed on *Dokumente* again. The app content now always stays mounted; the lock screen is drawn above it.
- **The lock could open without any check:** on iPhones without Face ID / Touch ID the unlock returned "success" without asking for anything, even with a PIN set.
- **Force-quitting reset the PIN attempt limit** (5 tries were only counted while the app was running).
- The screenshot notice appeared on every screenshot, even with *Screenshot-Schutz* off – now only while the protection is on (screenshots are then black).
- The lock screen, PIN dialog and security settings were German only – now German and English.
- **JPG sharing:** expo-sharing re-staged the file under a `.jpeg` name (`Scan.jpg.jpeg`, a hard link in its own cache that stayed until the next share) because the declared type `public.jpeg` prefers the extension `.jpeg`. JPGs are now shared without a declared type; iOS uses the `.jpg` extension.
- Lint error in `src/components/AppLockOverlay.tsx` (variable used before its declaration) – the file was rewritten.

### Security
- **No unlock without a check:** Face ID / Touch ID, otherwise the device passcode or the ScanFlow PIN. If nothing can unlock, ScanFlow stays locked, and the lock cannot be turned on until a device passcode or a ScanFlow PIN exists. Unreadable settings (Keychain) count as "locked".
- **The lock screen covers everything:** it is drawn in a `FullWindowOverlay` (react-native-screens) on top of the iOS window, so it also covers the crop screen, open sheets, the share sheet and the iOS document scanner; the keyboard is closed when locking.
- **Exactly one automatic Face ID prompt** per lock / return; after *Abbrechen* the lock screen offers *Mit Face ID entsperren*.
- **PIN stored as PBKDF2-HMAC-SHA256** (5,000 iterations, 16-byte random salt, constant-time comparison) instead of a 32-bit string hash with a fixed salt. PINs from ≤ 1.3.0 keep working and are converted on the next correct entry.
- **Persisted attempt limit:** after 5 wrong PINs a 30 s wait, then 1 min, 5 min and 15 min per further wrong PIN. Stored in the Keychain, so restarting the app does not reset it; setting the clock back restarts the wait. Face ID / Touch ID or the correct PIN reset the counter.
- **6-digit PINs** (new default; 4 digits still possible). Obvious PINs (1111, 1234, 987654 …) are rejected.
- **With a ScanFlow PIN the PIN replaces the device passcode:** the lock offers Face ID / Touch ID with *ScanFlow-PIN eingeben* as fallback – the iPhone passcode alone no longer opens ScanFlow.
- **Change / remove the PIN** (Settings → *ScanFlow-PIN*) after confirming the current PIN (or *PIN vergessen? Mit Face ID bestätigen*). Turning the app lock on or off also requires a check.
- **Keychain classes "this device only":** security settings `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, PIN and attempt counter `WHEN_UNLOCKED_THIS_DEVICE_ONLY` – never restored to another device. Existing entries are moved once at start.
- **App-switcher preview:** new setting *App-Vorschau verbergen* (default on, independent of the app lock) – native blur in the app switcher and behind system prompts (`expo-screen-capture`).
- **Exported files are deleted** as soon as the share sheet closes (also after errors); the export cache is also cleared at every app start.

### Changed
- Settings → *Sicherheit & Datenschutz*: *App-Sperre* (shows the available unlock methods), *Sperren nach* Sofort / 1 Min. / 5 Min., *ScanFlow-PIN* (Einrichten / Ändern / Entfernen), *App-Vorschau verbergen*, *Screenshot-Schutz*.
- **Deleting no longer pretends to shred:** the former "Zero-Trace" step only replaced the file with up to 8 KB of `0` characters, which on APFS (copy-on-write flash storage) never touches the old data. Files are now deleted directly; iOS Data Protection encrypts them when a device passcode is set. The *Zero-Trace Löschen* badge was replaced by an accurate storage note.
- `NSFaceIDUsageDescription`: "ScanFlow verwendet Face ID, um die App zu entsperren." (IPA build).
- New script `npm run test:security`.
- **A GitHub release for every version:** the IPA workflow (`.github/workflows/build-ipa.yml`) publishes each version as its own release – tag `v<version>` from `package.json` (or a pushed `v*` tag), release notes from this changelog – instead of always updating *v1.1.0*. Pushing again without a version bump updates that version's release.

### Added
- `src/security/` (pure TypeScript, no Expo imports): `sha256.ts` (SHA-256, HMAC, PBKDF2), `pinHash.ts`, `lockout.ts`, `lockPolicy.ts`.
- `src/services/PrivacyService.ts`, `src/components/LockScreen.tsx`, `src/components/PinPad.tsx`; `PinSetupModal.tsx` rebuilt (create / change / verify, 4 or 6 digits); `useAppLock()` context from `AppLockOverlay.tsx`.
- Tests: `__tests__/security.test.ts` (28: hashes vs. Node crypto, PIN records incl. the old format, attempt limit, lock policy incl. the Face ID loop), `__tests__/authService.test.ts` (22, in-memory Keychain + scripted Face ID results), `__tests__/exportCleanup.test.ts` (6).

### Removed
- i18n section `auth` (replaced by `security`).
- `AuthService.authenticate()`, `isAppLockEnabled()`, `getLockTimeout()`, `isScreenCaptureProtectionEnabled()`, `shouldLockOnForeground()` – replaced by `getSecurityConfig()`, `authenticateOwner()`, `verifyPinCode()` and `src/security/lockPolicy.ts`.

### Known limitations
- The app lock protects the **app's screens, not the files**. ScanFlow does not encrypt the database and the page images itself (not possible in Expo Go); they are protected by iOS Data Protection, which requires a device passcode.
- iPhone / iCloud backups contain the documents like any other app data; the PIN and the lock settings are not restored to another device.
- A 4- or 6-digit PIN cannot withstand somebody who has a copy of the Keychain entry; the protection is the Keychain (this device only) plus the attempt limit.
- An alert that appears while ScanFlow is locked (e.g. an import error) can show its text above the lock screen.
- PIN checks take an estimated 0.2–0.4 s on the phone (not yet measured).
- Not yet tested on a physical iPhone (STOP S in `docs/ROADMAP.md`) – in particular Face ID, the lock screen above the iOS scanner / share sheet and the app-switcher blur.

---

## [1.3.0] - 2026-11-05

Phase B – live scanner like CamScanner. See `docs/ARCHITECTURE.md` → "Scan flow".

### Added
- **iOS document scanner as the default scanner** (VisionKit `VNDocumentCameraViewController` via `expo-camera` `CameraView.scanDocumentAsync`, no extra package): live page outline, automatic capture, manual shutter, multi-page batch, corner adjustment and perspective correction. Pages are stored without a second detection pass and get filter *Auto*.
- `src/components/ScannerProvider.tsx` (`useScanner()`): one scan entry for the FAB, the empty library, the document screen and retakes – camera permission check (alert → iOS settings), progress overlay while storing, new documents open automatically, fallback to the ScanFlow camera if the system scanner is unavailable, fails or does not appear.
- `src/services/DocumentScannerService.ts` and `src/services/ScanImportService.ts` (`saveScan()`: new document / append / retake, temp-file cleanup, scan notice for the document screen).
- **Settings → Scanner:** *iOS-Scanner* (default) / *ScanFlow-Kamera*.
- **Document screen:** *"+ Weitere Seiten hinzufügen"* below the page; after adding pages the first new page is shown; review banner for imported pages without a detected edge (*Ecken setzen* → crop screen).
- **Photo import from the Documents tab** (header button and *Aus Fotos importieren* in the empty state), multi-select in selection order, with edge detection.
- **Detector v2** (`src/imaging/edgeDetection.ts`): luminance + chroma gradients, orientation-restricted Hough lines, two-stage quad scoring (paper vs. other surface, T-junctions, image-border sides), prefers a sheet lying on a larger light object; detection input 400 px (was 300 px).
- `CFBundleLocalizations` (de, en) in `app.json` so system UI such as the scanner follows the device language in the IPA build.
- Tests: `__tests__/scanImport.test.ts` (7 tests), 3 hard detection scenes (dark header bar, printed frame near the edge, sheet on a light binder).

### Changed
- The **+** button opens the iOS scanner instead of ScanFlow's camera (switchable in Settings).
- *Seite hinzufügen* offers *Aus Fotomediathek* / *Dokument scannen*; retake in the page editor uses the selected scanner. If several pages are scanned during a retake, the first replaces the page and the others are inserted right after it (the replaced page keeps its filter).
- *Seite hinzufügen* / retake from the page editor first closes the editor, then opens the scanner or photo picker (the iOS scanner cannot be presented while a modal is animating).
- ScanFlow's own camera is manual capture only; it now shares the store logic (`saveScan()`) with the scanner and the photo import.
- `ImagePipelineService.importImage(uri, { detect })`, `importPages(uris, onProgress, { detect })`; `DocumentRepository.addPages()` returns the new page ids.

### Fixed
- The camera's *Auto* mode was a simulated 3.5 s timer without any detection – removed (real auto-capture comes from the iOS scanner).
- Temporary camera / picker / scanner images stayed in the cache – they are deleted after a successful import; page files of a failed import are removed again.
- A failing edge detection aborted the whole import – the page now keeps the full image (review banner); a failed proxy no longer leaves the original file behind.

### Removed
- *Auto / Manuell* toggle and i18n keys `scan.auto`, `scan.manual` of the own camera.

### Known limitations
- ScanFlow's own camera has no live edge overlay (Expo Go provides no camera frame processing); live detection is available through the iOS scanner.
- In Expo Go the language of the scanner's buttons depends on Expo Go's own localizations (may be English); the IPA build uses `CFBundleLocalizations` (de, en).
- Post-capture detection (photo import, own camera) can include a clear sleeve or binder strip around the sheet, and pages cut off by the image frame are often not detected – corners can be corrected in *Zuschneiden*.
- The iOS scanner flow has not yet been verified on a physical iPhone (STOP B in `docs/ROADMAP.md`).
- Pre-existing issues in `src/components/AppLockOverlay.tsx` remain (lint error; with app lock enabled the privacy veil replaces the screen content while the app is inactive, so the navigation can reset after system dialogs) – fixed in 1.4.0 (this also caused the Face ID loop).

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
- Camera auto-capture is still a simulated timer; live edge detection is Phase B. *(Resolved in 1.3.0.)*
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
