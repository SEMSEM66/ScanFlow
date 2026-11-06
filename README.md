# ScanFlow 📄✨

**ScanFlow** is a modern, privacy-first, offline-only iOS document scanner app built with **Expo**, **React Native**, **TypeScript (Strict)**, and **expo-router**.

Designed as a clean, ad-free alternative to apps like CamScanner, ScanFlow processes and stores all documents locally on your device with zero telemetry, zero accounts, and no forced watermarks.

---

## 📱 Features

### Phase 1 MVP
- **📚 Document Library:** 2-column grid and list views, instant search, folder-based categorization, date and page count badges. Reloads automatically when you return to it.
- **📷 Camera Scanner:** Multi-page capture, flash controls, framing guides, and gallery import. *(Since v1.3.0 the iOS document scanner is the default – see Phase B below; this own camera remains as an option/fallback with manual capture.)*
- **🔒 Privacy & Security:** Face ID / Touch ID / Passcode app lock (`expo-local-authentication` + `expo-secure-store`), ScanFlow PIN, app-switcher blur. *(Rebuilt in v1.4.0 – see below.)*
- **🌐 Localization:** German (default) and English.
- **🌙 Theming:** Warm Ivory light mode and OLED dark mode.

### Phase A – "Real scanned PDF" look (v1.2.0)
- **🔍 Automatic page detection** after capture/import (pure TypeScript, ≤ 400 px analysis copy). Falls back to the full image if no page is found.
- **✂️ Real perspective correction:** 4 draggable corners with magnifier loupe, *Erkennen* / *Ganzes Bild* / *Zurücksetzen*, validation (convex, min. area). The page is de-warped on the GPU with Skia – no more bounding-box crop.
- **📄 Page formats:** Auto (snaps to A4/Letter when the aspect is within 4 %), A4, Letter. Exact PDF page sizes, no white margins.
- **🎨 7 scan filters:** Original, Auto (default), Magic Color, Schatten entfernen, Aufhellen, Graustufen, Schwarzweiß – white paper, dark text, shadow/gradient removal, removal of the table border.
- **🎚️ Adjustments:** brightness, contrast, sharpness, denoise – per page or "apply to all".
- **♻️ Non-destructive editing:** the original photo is never changed; crop, rotation, filter and adjustments are stored per page and rendered on demand (preview, thumbnails, export use the same renderer).
- **📑 Page editor fixes:** add pages (camera or library) to the *same* document, retake replaces the page in place, reorder is persisted, delete removes the page and its files.
- **📤 PDF export with pdf-lib:** 150 / 200 / 300 dpi, quality Klein / Standard / Hoch with size estimate, title metadata, optional watermark, progress indicator. Rendered from the full-resolution original.

### Phase B – Live scanner like CamScanner (v1.3.0)
- **🟦 iOS document scanner (default):** tap **+** → the detected page is highlighted live in the camera image (iOS draws it in blue, CamScanner in green), **automatic capture** when the page is steady (or manual shutter), several pages in a row with a thumbnail counter, corner adjustment and perspective correction – Apple's VisionKit scanner (as in Notes / Files), opened via `expo-camera`. *Sichern* stores all pages and opens the document with the white scan look (filter *Auto*).
- **➕ "Weitere Seiten hinzufügen"** in the document screen; *Seite hinzufügen* offers *Aus Fotomediathek* / *Dokument scannen*; *retake* in the page editor replaces the page (extra scanned pages are inserted right after it).
- **🖼️ Photo import** from the Documents tab (header button and empty state), multi-select in selection order, with automatic edge detection; a banner points to pages without a detected edge → *Ecken setzen*.
- **⚙️ Settings → Scanner:** *iOS-Scanner* (default) or *ScanFlow-Kamera* (own camera, manual capture, edges detected after capture). If the iOS scanner is unavailable or cannot open, ScanFlow falls back to its own camera.
- **🔍 Detector v2** for photo import and the own camera: line-based (oriented Hough + two-stage scoring); handles header bars, printed frames near the edge and sheets lying on a larger light object much better than v1.

### Security hardening (v1.4.0)
- **🔐 App lock without loops or resets:** locks only when ScanFlow was really in the background (*Sperren nach* Sofort / 1 Min. / 5 Min.) – Face ID, Control Center or a system alert no longer relock it. Exactly one Face ID prompt per return; your open screen (crop, editor, scanner) is still there after unlocking.
- **🛡️ Never opens without a check:** Face ID / Touch ID, otherwise the device passcode or the ScanFlow PIN. The lock screen covers everything, including sheets, the share sheet and the iOS scanner.
- **🔢 ScanFlow PIN:** 6 digits (or 4), obvious PINs rejected, stored salted with PBKDF2-HMAC-SHA256 in the Keychain (this device only). With a PIN, the iPhone passcode alone does not open ScanFlow. *Einrichten / Ändern / Entfernen* in Settings; PINs from older versions keep working.
- **⏳ Attempt limit that survives restarts:** 5 wrong PINs → 30 s, then 1 min, 5 min, 15 min.
- **🙈 Privacy:** *App-Vorschau verbergen* (blur in the app switcher, default on), *Screenshot-Schutz* (screenshots and recordings stay black; notice only while it is on), exported PDFs/JPGs are deleted as soon as the share sheet closes.
- **🌐** Lock screen, PIN dialog and security settings in German and English.

### Phase C – Text recognition & searchable PDF (v1.5.0, installed app only)
- **🔤 Automatic text recognition** with Apple Vision, fully offline: new and changed pages are recognized in the background while ScanFlow is open (German and English, open document first).
- **🔎 Search titles and text:** the library search also finds words on the pages – ignoring case, umlauts and ß, with a short excerpt of the hit under the document.
- **📋 Text kopieren:** recognized text page by page – select, copy a page, *Alles kopieren*, share.
- **📄 Searchable PDFs:** an invisible text layer lies exactly over the words of the page image, so the PDF can be searched and the text copied in Files, Preview or Acrobat.
- **⚙️ Settings → Texterkennung:** on/off with progress; when turning it off, keep or delete the recognized text.
- Needs the IPA build (local native module `modules/scanflow-ocr`); in Expo Go the app works as before without text recognition.

### Native iOS interface (v1.7.0)
- **Native sheets and menus:** export, text, folder selection and adjustments use iOS form sheets; page overview, PIN setup and scan review use page sheets. Actions and naming use system menus and prompts.
- **Native navigation:** *Dokumente*, *Scannen*, *Werkzeuge*, *Einstellungen*. Scannen opens the scanner without switching tabs. Search across all folders is available from the library menu.
- Continuous corners, SF Symbols and native segmented controls keep the interface consistent in light and dark mode. Test the native UI and share flow on an iPhone.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the scan flow, the pipeline, the app lock, the text recognition and the bottom panels, and [`docs/ROADMAP.md`](docs/ROADMAP.md) for the phases.

### Known limitations
- ScanFlow's *own* camera has no live edge overlay / auto-capture (Expo Go offers no camera frame processing); live detection comes from the iOS scanner.
- The language of the iOS scanner's buttons follows the app's localizations: German/English in the IPA build; in Expo Go it depends on Expo Go (may be English).
- Photo import / own camera detection: if the sheet lies in a clear sleeve or the page is cut off by the image frame, the detected outline can be wrong (e.g. include the sleeve) – check the corners in *Zuschneiden*. In the iOS scanner the outline is visible live before capture and the corners can be adjusted before saving.
- Text recognition / searchable PDF only in the installed app (IPA), not in Expo Go. It runs only while ScanFlow is open; an existing library is recognized gradually. Letters outside Western European languages are replaced in the invisible PDF text (the page image is unchanged); handwriting is recognized poorly.
- The title search distinguishes upper/lower case for umlauts (`MÜLLER` does not find the title *Müller*); the text search does not.
- JPG export exports the current page only.
- **The app lock protects the app's screens, not the files.** ScanFlow does not encrypt its database and page images itself (not possible in Expo Go); iOS Data Protection encrypts them when a **device passcode** is set. Deleted files are removed immediately, but flash storage cannot be wiped securely by an app.
- iPhone / iCloud backups include your documents like any other app data (the PIN and lock settings are not restored to another device).
- An alert that appears while ScanFlow is locked (e.g. an import error) can show its text above the lock screen.
- Older (v1) pages keep their already-baked filter; they are migrated to the filter *Original* and can be re-edited from there.

---

## 🛠️ Tech Stack & Constraints

- **Framework:** Expo (Latest Stable SDK) with `expo-router`
- **Language:** TypeScript (`"strict": true`)
- **Storage:** `expo-sqlite` (relational metadata) + `expo-file-system` (document scans & PDFs)
- **Imaging:** `@shopify/react-native-skia` (GPU warp + enhancement shaders, included in Expo Go) + pure TypeScript detection
- **Export:** `pdf-lib` (primary, incl. invisible OCR text layer) / `expo-print` (fallback) + `expo-sharing`
- **Text recognition:** Apple Vision via the local Expo module `modules/scanflow-ocr` (IPA build only) + `expo-clipboard`
- **Tests:** Jest (`jest-expo` preset), headless Skia (CanvasKit), `node:sqlite` for migrations
- **Camera & Photos:** `expo-camera` + `expo-image-picker`
- **Security:** `expo-local-authentication` + `expo-secure-store`
- **Host OS:** Windows (PowerShell)
- **Target Device:** Real iPhone running **Expo Go** (development) and the sideloaded **IPA** from GitHub Releases (needed for text recognition)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 22 LTS (Jest migration tests use the built-in `node:sqlite`, Node ≥ 22.5)
- npm
- iPhone with the **Expo Go** app installed from the App Store

### Installation
```powershell
# Install project dependencies
npm install
```

### Running on iPhone via Expo Go
```powershell
# Check that all Expo packages match the SDK
npx expo install --check

# Start Metro bundler (LAN mode)
npx expo start

# If your iPhone cannot connect over local Wi-Fi, run with tunnel:
npx expo start --tunnel
```

Scan the printed QR code with your iPhone's **Camera** app to open ScanFlow in **Expo Go**.

### Quality checks
```powershell
npx tsc --noEmit
npm run lint
npm test                 # all tests, incl. GPU renderer tests (~5–7 min)
npm run test:imaging     # fast subset: geometry, detection, page state, PDF, migrations
npm run test:security    # fast subset: hashes, PIN, attempt limit, lock policy, AuthService, export cleanup
npm run test:ocr         # fast subset: OCR text helpers, queue, PDF text layer, search SQL, migrations
```

Optional: write before/after sample images (synthetic photo → all filters) and a sample PDF for visual review:
```powershell
$env:SCANFLOW_SAMPLES_DIR = ".tmp\samples"
npx jest __tests__/samples.test.ts
Remove-Item Env:SCANFLOW_SAMPLES_DIR
```

Optional: run the Python prototype (needs `numpy`, `opencv-python-headless`, `Pillow`):
```powershell
python tools/prototype/enhance_prototype.py --out .tmp/prototype
```

---

## 📁 Project Structure

```text
ScanFlow/
├── app/                      # expo-router file-based routing
│   ├── (tabs)/               # Tabs: Dokumente (index), Suchen (search), camera button, Werkzeuge (tools), Einstellungen (settings)
│   ├── document/[id].tsx     # Document editor: filters, adjustments, pages, export
│   ├── scan.tsx              # ScanFlow camera (setting / fallback): new doc, add page, retake
│   ├── crop.tsx              # 4-corner crop with Skia overlay, loupe, page format
│   └── _layout.tsx           # Root layout, theme, i18n & app lock
├── src/
│   ├── components/           # Reusable UI components matching /design (+ ScannerProvider: scan entry)
│   ├── db/                   # SQLite schema, migrations (user_version), client
│   ├── imaging/              # Pure TS imaging: geometry, detection, filters, SkSL shaders, renderer, PDF
│   ├── ocr/                  # Pure TS OCR: text/search helpers, Vision conversion, PDF text layer, queue
│   ├── security/             # Pure TS: SHA-256/PBKDF2, PIN records, attempt limit, lock policy
│   ├── services/             # Repositories, storage, image pipeline, render, export, auth, privacy
│   ├── i18n/                 # Translations (German & English)
│   ├── theme/                # Design tokens & theme context
│   └── types/                # TypeScript domain types
├── modules/scanflow-ocr/     # Local Expo module (Swift): Apple Vision text recognition (IPA build only)
├── __tests__/                # Jest tests (+ helpers for headless Skia & synthetic photos)
├── tools/prototype/          # Python/OpenCV prototype of the enhancement algorithm (not bundled)
├── design/                   # UI design screenshots
├── docs/                     # ROADMAP.md, ARCHITECTURE.md, COMMITS.md
├── scripts/                  # postinstall patch
├── AGENTS.md                 # Persistent agent development rules
└── CHANGELOG.md              # Release history
```

---

## 📜 License
Private & Proprietary.
