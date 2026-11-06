# Spike: iOS Share Extension (Share Sheet Integration)

- **Status:** `defer` (Deferred to v2.1)
- **Milestone:** M4 (v1.12.0)
- **Date:** 2026-11-06
- **Module / Target:** App Extension Target (`targets/scanflow-share`) / App Groups

---

## 1. Goal & Hypothesis
- **Goal:** Allow users to share images and PDFs from third-party apps (Photos, Safari, Mail, Files) into ScanFlow without leaving the host application.
- **Hypothesis:** Create an iOS Share Extension target (`SLComposeServiceViewController` or SwiftUI) reading incoming attachments (`NSItemProvider`) and writing them to a shared App Group container.

## 2. Minimal Native Surface
- **Extension Architecture:**
  - Separate app extension bundle (`com.scanflow.app.ShareExtension`).
  - Requires App Groups entitlement (`group.com.scanflow.shared`) configured in both the main app target and extension target.
  - Requires shared container file system and inter-process synchronization (e.g. Darwin notifications or writing to shared directory).
- **Memory Limits:** iOS Share Extensions are hard-limited to 120 MB of RAM. Decoding full-resolution photos or multi-page PDFs inside the extension process risks instant jetsam termination (`EXC_RESOURCE -> MEMORY`).

## 3. Expo Go Fallback Behavior
- Native app extensions cannot run inside Expo Go.

## 4. Analysis Against Existing M1 Solution
- In Milestone M1 (`v1.9.0`), ScanFlow already implemented full incoming file support:
  1. `app.json` defines `CFBundleDocumentTypes` for `com.adobe.pdf` and `public.image` with `LSSupportsOpeningDocumentsInPlace: false`.
  2. In the iOS system share sheet, Safari, Mail, and Files display **"In ScanFlow öffnen" / "Open in ScanFlow"** in the app row.
  3. iOS safely copies the selected file into ScanFlow's sandbox Inbox and opens the app with the `file://` link.
  4. `app/_layout.tsx` and `pdfToolkitService.handleIncomingUrl` ingest the file with full memory availability, complete App Lock protection, serial PDF rasterization, and background OCR.

## 5. Failure Modes & Build Risks
- **App Group Entitlements in Unsigned IPAs:** App Groups require an active Apple Developer team identifier. Sideloaded unsigned IPAs cannot allocate valid App Group containers on iOS, which causes the extension to crash immediately upon launch with file permission errors.
- **Complexity vs. Value:** Adding a Share Extension target adds significant build configuration friction while duplicating the functionality already provided by document type registration.

## 6. Verdict
- **`defer` to v2.1:**
  1. ScanFlow already provides native system share sheet ingestion via registered document types ("Open in ScanFlow").
  2. Avoids App Group signing failures in sideloaded unsigned IPAs.
  3. Revisit for v2.1 if inline, background-only sharing without switching apps becomes a prioritized user requirement.
