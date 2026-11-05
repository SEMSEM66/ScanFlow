# ScanFlow – Scan & Image Pipeline Architecture (Phase A + B)

This document describes how ScanFlow captures pages (iOS document scanner or
its own camera), turns a phone photo into a page that looks like a real
scanned PDF page, how page state is stored, and how the pieces are tested. It
is the reference for anybody changing `src/imaging/` or the scan flow.

---

## 1. Goals & constraints

- **Look:** white paper, black text, no table/background, no perspective,
  no shadows/gradients, correct page size (A4 / Letter) – like a flatbed scan.
- **Expo Go only:** everything runs inside the standard Expo Go app.
  GPU work uses `@shopify/react-native-skia` (bundled in Expo Go);
  everything else is pure TypeScript. No custom native code.
- **Non-destructive:** the original photo is never overwritten. Every edit
  (corners, rotation, filter, adjustments, page format) is stored as state in
  SQLite; images are *rendered* from the original on demand.
- **Same maths everywhere:** preview, thumbnails and export use the same
  renderer, so what you see is what you export (verified by tests).

---

## 2. Module map

```text
src/imaging/            Pure, framework-free TypeScript (testable in Node)
  types.ts              Point, Quad, Rotation, FilterType, Adjustments, PageFormat, ExportDpi …
  geometry.ts           Homography (DLT), quad validation (convexity, angles, area), ordering
  pageFormat.ts         A4 595.28×841.89 pt, Letter 612×792 pt, auto-snap (±4 %), DPI → pixels
  raster.ts             Small RGBA helpers (resize, blur, luminance, morphology)
  edgeDetection.ts      Document corner detection (gradient edges → oriented Hough lines → scored quads)
  background.ts         Paper/illumination estimation + border mask (≈128 px)
  filters.ts            7 filter presets → shader uniforms; CPU reference implementation
  shaders.ts            SkSL: WARP_SKSL (perspective), ENHANCE_SKSL (normalize/clean/sharpen/mode)
  renderer.ts           PageRenderer – Skia API injected (app: RN Skia, tests: CanvasKit)
  pdf.ts                buildPdf() with pdf-lib, metadata, watermark, text-layer hook (OCR later)
  pageState.ts          RENDER_VERSION, (de)serialisation of page state, renderKey()

src/services/
  ImagePipelineService.ts  File IO + Skia + serial job queue + render cache (bridge app ↔ imaging)
  PageRenderService.ts     ensurePagePreview() (stale-safe), importPages() (+ cleanup on failure)
  DocumentScannerService.ts iOS document scanner (VisionKit via expo-camera), camera permission
  ScanImportService.ts     saveScan(): new document / add pages / retake, temp cleanup, scan notices
  ExportService.ts         PDF (pdf-lib, expo-print fallback), JPG, share, size estimate
  DocumentRepository.ts    Pages CRUD incl. non-destructive state, reorder, replace, delete
  StorageService.ts        Sandboxed file areas, export cache, best-effort deletion

src/components/ScannerProvider.tsx  App-wide scan entry (useScanner): scanner choice, permission,
                                    progress overlay, fallback to the ScanFlow camera

src/db/migrations.ts    PRAGMA user_version based migrations (v1 → v2)
tools/prototype/        Python/OpenCV prototype of the enhancement algorithm (not bundled)
__tests__/              Jest tests (Node + headless Skia/CanvasKit + node:sqlite)
```

---

## 3. Pipeline

```text
Camera / Library photo
   │  importImage(): ImageManipulator re-encode (bakes EXIF orientation,
   │  drops metadata, long side ≤ 4096, JPEG 0.92)
   ▼
original.jpg ──► proxy.jpg (≤ 2000 px) ──► detection copy (≤ 400 px RGBA)
                                              │ detectDocument()
                                              ▼
                                   corners (normalized 0..1) or null
   page row: corners, rotation, filter='auto', adjustments, page_format
   ▼
PageRenderer.render(source, state, { maxLongSide | dpi })
   1. geometry: page size from format (auto-snap to A4/Letter by aspect),
      rotation, homography quad → output rect
   2. WARP_SKSL: perspective de-warp (bilinear), output = page pixels
   3. background pass on ≈128 px copy (CPU): paper level + border mask
   4. ENHANCE_SKSL: divide by background (shadow/gradient removal),
      black/white point + gamma, saturation, unsharp mask, mode
      (colour / grey / B&W), border → white
   ▼
preview (1600 px, JPEG 85, renders/)   thumbnails (160 px data URIs, LRU 60)
export (from ORIGINAL at chosen DPI: 150 / 200 / 300) → JPEG → pdf-lib page
```

- **Render key:** `renderKey(page)` = FNV-1a hash of RENDER_VERSION + source
  URI + corners + rotation + filter + adjustments + page format. A preview is
  only re-rendered if the key changed; a finished render is only stored if the
  page still has the same key (no races with fast edits).
- **Memory:** one serial queue in `ImagePipelineService`, at most 2 decoded
  images cached (LRU). The renderer keeps only source, one intermediate and
  the output surface alive. Export renders page by page and releases each
  image before the next page.
- **Fallbacks:** if detection fails → full image (inset rectangle) and the
  user crops manually. If pdf-lib fails → `expo-print` with the exact page
  size of the first page (rendered JPEGs, no margins).

### Filters

| Key | DE label | Purpose |
| --- | --- | --- |
| `original` | Original | De-warp only, no enhancement (keeps photo look) |
| `auto` | Auto | Default: shadow removal + white paper + mild colour + sharpen |
| `magicColor` | Magic Color | Like Auto, stronger contrast and saturation (stamps, logos) |
| `removeShadows` | Schatten entfernen | Gentle: background division with little contrast change |
| `lighten` | Aufhellen | Brightens dark photos |
| `grayscale` | Graustufen | Clean grey document |
| `blackAndWhite` | Schwarzweiß | Soft-threshold binarisation for text |

Adjustments (per page, optional "apply to all"): brightness, contrast,
sharpness (−1…+1) and denoise (on/off). Defaults are stored as `NULL`.

---

## 4. Scan flow (v1.3.0)

```text
FAB (+) · "Weitere Seiten hinzufügen" · Seite hinzufügen → "Dokument scannen" · page editor → retake
   │  useScanner().scan(target)          target = {} | {documentId} | {documentId, replacePageId}
   ▼
ScannerProvider
   ├─ Settings "Scanner" = ScanFlow-Kamera, or iOS scanner unavailable
   │     → router.push('/scan', target)  (own camera, manual shutter, batch, photo import)
   │        → saveScan({detect: true}) → new doc: router.replace(document) / else router.back()
   └─ iOS-Scanner (default)
         1. camera permission (Camera.get/requestCameraPermissionsAsync; denied → "Einstellungen")
         2. CameraView.scanDocumentAsync({quality: 0.95})  – VisionKit VNDocumentCameraViewController:
            live page outline, auto capture, multi-page, corner adjustment, perspective correction
         3. pages (cropped JPEGs in the cache) → saveScan({detect: false}) with progress overlay
         4. new document → router.push('/document/[id]'); target document → caller reloads
Photo import (Documents tab: header button / empty state; add page → "Aus Fotomediathek")
   → ImagePicker (multi-select, ordered) → saveScan({detect: true})
```

- **`saveScan()`** (`ScanImportService`) runs every image through
  `importPages()` (re-encode, proxy, optional detection, filter *Auto*) and
  stores the pages: new document, appended to `documentId`, or – retake – the
  first image replaces `replacePageId` (keeps its filter, rotation 0) and
  further images are inserted right after it. Temporary source files (cache
  directory only) are deleted after success. If an image cannot be imported,
  the sources are kept and the page files imported so far are removed again.
- **Scan notices:** `saveScan()` leaves `{pageIds, undetectedPageIds}` for the
  document; the document screen takes it on its next load, jumps to the first
  new page and shows the review banner (*"Auf Seite 2 wurde kein
  Dokumentrand erkannt." – Ecken setzen*) for imported pages without detected
  corners.
- **Presentation timing:** VisionKit is presented natively on the top-most
  view controller. UIKit refuses a presentation while a modal / alert is still
  animating, and the promise then never settles. Therefore: alerts and the
  page editor start the scanner only after they are fully dismissed (alert:
  300 ms delay, editor: `Modal.onDismiss` + 900 ms fallback). If a scan is
  "running" for > 1.5 s while the app UI is usable, the next tap offers the
  ScanFlow camera instead.
- **Why VisionKit pages skip detection:** they are already cropped and
  de-warped; a second detection pass could only crop them wrongly. The crop
  screen still allows manual corners on them.
- **Language of the scanner UI:** VisionKit uses the app's localizations
  (`CFBundleLocalizations` = de, en in `app.json`, effective in the IPA build).
  In Expo Go it depends on Expo Go's own localizations (may be English).

---

## 5. Data model (SQLite schema v2)

`pages` gains the following columns (migration `src/db/migrations.ts`):

| Column | Meaning |
| --- | --- |
| `original_uri` | Untouched (re-encoded) photo – source for export |
| `proxy_uri` | ≤ 2000 px copy for crop UI / previews |
| `preview_uri` | Last rendered preview (cache, can be regenerated) |
| `render_key` | Key of the state the preview was rendered from |
| `corners` | JSON `[[x,y]×4]` normalized, `NULL` = full image |
| `rotation` | 0 / 90 / 180 / 270 (applied at render time) |
| `filter` | One of the 7 filter keys |
| `adjustments` | JSON, `NULL` = defaults |
| `page_format` | `auto` / `a4` / `letter` |
| `legacy_original_uri` | v1 pages only: the old unfiltered photo (kept, not used) |

**Migration v1 → v2** (in one `BEGIN IMMEDIATE` transaction, rollback on
error, tracked via `PRAGMA user_version`): v1 pages already had filters/crops
baked into `preview_uri`. To avoid applying a filter twice, the baked image
becomes the new `original_uri`, filter is reset to `original`, rotation to 0,
and the previous photo is kept in `legacy_original_uri`. Proxies for legacy
pages are created lazily on first open.

---

## 6. PDF structure

- One page per scan, MediaBox exactly A4 (595.28×841.89 pt) / Letter
  (612×792 pt) or the cropped aspect; image drawn full-page (no margins).
- Images are JPEG (`DCTDecode`) at the chosen DPI; quality
  Klein 55 / Standard 75 / Hoch 90.
- Metadata: Title (document name, Unicode), Creator/Producer `ScanFlow`,
  CreationDate/ModDate. No author, no device data.
- Optional diagonal watermark (Helvetica, WinAnsi-safe text).
- `textLayer` hook in `buildPdf()` (no-op today) – Phase C (OCR) adds an
  invisible text layer here.
- File: `<cache>/scanflow-export/<timestamp>/<sanitized title>.pdf`;
  "Cache leeren" in Settings deletes this export folder.

Measured page sizes (A4, synthetic scan, Skia/CanvasKit, see `pdf.ts`):

| DPI | Klein | Standard | Hoch |
| --- | --- | --- | --- |
| 150 | ≈ 215 KB | ≈ 275 KB | ≈ 410 KB |
| 200 | ≈ 380 KB | ≈ 490 KB | ≈ 730 KB |
| 300 | ≈ 850 KB | ≈ 1.1 MB | ≈ 1.6 MB |

Real photos with dense text/colour can be larger; the export dialog shows an
estimate, not a guarantee.

---

## 7. Acceptance criteria (automated)

Checked by `__tests__/renderer.test.ts` and `edgeDetection.test.ts` on
synthetic phone photos (perspective, uneven light, soft shadow, colour cast,
noise, blur, JPEG) with known ground truth:

| Criterion | Threshold |
| --- | --- |
| Corner detection error (5 scenes + 3 hard scenes: header bar, printed frame, sheet on a light binder) | ≤ 2 % of the image diagonal |
| Paper brightness (mean) – all filters except Original, 3 scenes | ≥ 245 |
| Remaining illumination gradient on paper | ≤ 8 grey levels |
| Border (former table) brightness, p1 | ≥ 235 |
| Text darkness (mean of ink pixels) | ≤ 70 (Schatten entfernen ≤ 110) |
| Crop 1.5 % too large | still no dark border (p1 ≥ 235) |
| Magic Color keeps stamp red / logo blue | > 90 % of stamp pixels still red, saturated |
| Original filter keeps gradient | yes (no enhancement) |
| GPU shader vs CPU reference | ±2 grey levels |
| Preview vs export (same state) | mean diff < 6 |
| PDF page size | exact A4 / Letter MediaBox, 150/200/300 dpi images |

The Python prototype (`tools/prototype/enhance_prototype.py`) produced the
algorithm and its parameters; `background.ts` and `filters.ts` are ports.
**Keep prototype, TypeScript, SkSL and the CPU reference in sync** and bump
`RENDER_VERSION` whenever the output of the maths changes (forces re-render of
cached previews).

---

## 8. Not yet implemented (see ROADMAP)

- Live edge overlay / auto-capture in ScanFlow's *own* camera (`app/scan.tsx`).
  Live detection and auto-capture are provided by the iOS document scanner
  (default); Expo Go offers no camera frame processors for a custom overlay.
- OCR / searchable PDF (Phase C, hook prepared in `buildPdf`).
