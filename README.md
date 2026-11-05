# ScanFlow 📄✨

**ScanFlow** is a modern, privacy-first, offline-only iOS document scanner app built with **Expo**, **React Native**, **TypeScript (Strict)**, and **expo-router**.

Designed as a clean, ad-free alternative to apps like CamScanner, ScanFlow processes and stores all documents locally on your device with zero telemetry, zero accounts, and no forced watermarks.

---

## 📱 Features

### Phase 1 MVP
- **📚 Document Library:** 2-column grid and list views, instant search, folder-based categorization, date and page count badges. Reloads automatically when you return to it.
- **📷 Camera Scanner:** Multi-page capture, flash controls, framing guides, and gallery import. *(Since v1.3.0 the iOS document scanner is the default – see Phase B below; this own camera remains as an option/fallback with manual capture.)*
- **🔒 Privacy & Security:** Face ID / Touch ID / Passcode app lock (`expo-local-authentication` + `expo-secure-store`), PIN fallback, app-switcher veil.
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

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the scan flow and pipeline and [`docs/ROADMAP.md`](docs/ROADMAP.md) for Phases B–D.

### Known limitations
- ScanFlow's *own* camera has no live edge overlay / auto-capture (Expo Go offers no camera frame processing); live detection comes from the iOS scanner.
- The language of the iOS scanner's buttons follows the app's localizations: German/English in the IPA build; in Expo Go it depends on Expo Go (may be English).
- Photo import / own camera detection: if the sheet lies in a clear sleeve or the page is cut off by the image frame, the detected outline can be wrong (e.g. include the sleeve) – check the corners in *Zuschneiden*. In the iOS scanner the outline is visible live before capture and the corners can be adjusted before saving.
- OCR / searchable PDF: **not yet** (Phase C; hook prepared in `src/imaging/pdf.ts`).
- JPG export exports the current page only.
- Deleting files is best-effort (iOS flash storage/APFS does not allow guaranteed secure wiping).
- Older (v1) pages keep their already-baked filter; they are migrated to the filter *Original* and can be re-edited from there.

---

## 🛠️ Tech Stack & Constraints

- **Framework:** Expo (Latest Stable SDK) with `expo-router`
- **Language:** TypeScript (`"strict": true`)
- **Storage:** `expo-sqlite` (relational metadata) + `expo-file-system` (document scans & PDFs)
- **Imaging:** `@shopify/react-native-skia` (GPU warp + enhancement shaders, included in Expo Go) + pure TypeScript detection
- **Export:** `pdf-lib` (primary) / `expo-print` (fallback) + `expo-sharing`
- **Tests:** Jest (`jest-expo` preset), headless Skia (CanvasKit), `node:sqlite` for migrations
- **Camera & Photos:** `expo-camera` + `expo-image-picker`
- **Security:** `expo-local-authentication` + `expo-secure-store`
- **Host OS:** Windows (PowerShell)
- **Target Device:** Real iPhone running **Expo Go**

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
│   ├── (tabs)/               # Tabs: Dokumente (index), Werkzeuge (tools), Einstellungen (settings)
│   ├── document/[id].tsx     # Document editor: filters, adjustments, pages, export
│   ├── scan.tsx              # ScanFlow camera (setting / fallback): new doc, add page, retake
│   ├── crop.tsx              # 4-corner crop with Skia overlay, loupe, page format
│   └── _layout.tsx           # Root layout, theme, i18n & app lock
├── src/
│   ├── components/           # Reusable UI components matching /design (+ ScannerProvider: scan entry)
│   ├── db/                   # SQLite schema, migrations (user_version), client
│   ├── imaging/              # Pure TS imaging: geometry, detection, filters, SkSL shaders, renderer, PDF
│   ├── services/             # Repositories, storage, image pipeline, render, export, auth
│   ├── i18n/                 # Translations (German & English)
│   ├── theme/                # Design tokens & theme context
│   └── types/                # TypeScript domain types
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
