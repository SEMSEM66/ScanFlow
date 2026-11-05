# ScanFlow – Architecture: Scan & Image Pipeline (Phase A + B), App Lock & Security (v1.4.0), Text Recognition (v1.5.0), Sheets & Navigation (v1.6.0)

This document describes how ScanFlow captures pages (iOS document scanner or
its own camera), turns a phone photo into a page that looks like a real
scanned PDF page, how page state is stored, and how the pieces are tested. It
is the reference for anybody changing `src/imaging/` or the scan flow.
Section 8 describes the app lock, the ScanFlow PIN and the privacy features
(`src/security/`, v1.4.0), section 9 the text recognition, the text search and
the searchable PDF (`src/ocr/`, `modules/scanflow-ocr`, v1.5.0), section 10
the bottom sheets, the tab bar and the search tab (v1.6.0).

---

## 1. Goals & constraints

- **Look:** white paper, black text, no table/background, no perspective,
  no shadows/gradients, correct page size (A4 / Letter) – like a flatbed scan.
- **Expo Go only:** everything runs inside the standard Expo Go app.
  GPU work uses `@shopify/react-native-skia` (bundled in Expo Go);
  everything else is pure TypeScript. No custom native code – with one
  exception since v1.5.0: text recognition (`modules/scanflow-ocr`, Apple
  Vision) exists only in the IPA build; without it the app behaves as before.
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
  pdf.ts                buildPdf() with pdf-lib, metadata, watermark, invisible OCR text layer
  pageState.ts          RENDER_VERSION, (de)serialisation of page state, renderKey()

src/services/
  ImagePipelineService.ts  File IO + Skia + serial job queue + render cache (bridge app ↔ imaging)
  PageRenderService.ts     ensurePagePreview() (stale-safe), importPages() (+ cleanup on failure)
  DocumentScannerService.ts iOS document scanner (VisionKit via expo-camera), camera permission
  ScanImportService.ts     saveScan(): new document / add pages / retake, temp cleanup, scan notices
  ExportService.ts         PDF (pdf-lib, expo-print fallback), JPG, share (+ delete after sharing), size estimate
  DocumentRepository.ts    Pages CRUD incl. non-destructive state, reorder, replace, delete
  StorageService.ts        Sandboxed file areas, export cache, deletion
  AuthService.ts           Keychain, Face ID / passcode, ScanFlow PIN, security settings (see §8)
  PrivacyService.ts        App-switcher blur, screenshot protection (see §8)

src/components/ScannerProvider.tsx  App-wide scan entry (useScanner): scanner choice, permission,
                                    progress overlay, fallback to the ScanFlow camera
src/components/modalHandoff.ts      ModalHandoff: hide a sheet, resolve on Modal.onDismiss (1.5 s fallback)
                                    → then present a native sheet (export sheet → share sheet)
src/components/BottomSheet.tsx      iOS-style bottom sheet: backdrop fades, sheet glides with a spring,
                                    pull down / tap outside to close, onDismiss once gone (see §10)
src/components/sheetMotion.ts       Pure TS: sheet constants, gesture math, SheetMachine (driver injected)
app/(tabs)/search.tsx               Search tab: all folders, title + recognized text, excerpts (see §10)

src/security/           Pure TypeScript: SHA-256/PBKDF2, PIN records, attempt limit, lock policy (see §8)

src/ocr/                Pure TypeScript OCR core (see §9)
  types.ts              OcrBox / OcrWord / OcrLine (normalized, origin top-left), PageTextRecord
  text.ts               ocrKey(), reading order, plain text, search normalization, snippets, storage format
  vision.ts             Native Vision result → OcrLine[] (y flip, cleanup, word-box plausibility)
  pdfTextLayer.ts       Invisible text (render mode 3) per word for buildPdf()
  scheduler.ts          Background queue (order, retries, pause/hold), dependencies injected

modules/scanflow-ocr/   Local Expo module (Swift, Apple Vision) – IPA build only (see §9)

src/services/
  OcrService.ts            Background recognition, on/off setting, text for export / copy (see §9)
  PageTextRepository.ts    page_text table: save, copy, pending pages, stats, snippets

src/db/migrations.ts    PRAGMA user_version based migrations (v1 → v2 → v3)
src/db/textSearch.ts    Search / page_text SQL (pure, tested against real SQLite)
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
  ScanFlow camera instead. The share sheet follows the same rule (v1.5.1):
  the document screen creates the file while the export sheet shows the
  progress, closes the sheet with `ModalHandoff` (`Modal.onDismiss`, 1.5 s
  fallback) and only then calls `exportService.shareDocument()`. Since
  v1.6.0 all bottom panels are `BottomSheet`s; their `onDismiss` fires once
  the sheet has glided out and its modal is gone (§10).
- **Why VisionKit pages skip detection:** they are already cropped and
  de-warped; a second detection pass could only crop them wrongly. The crop
  screen still allows manual corners on them.
- **Language of the scanner UI:** VisionKit uses the app's localizations
  (`CFBundleLocalizations` = de, en in `app.json`, effective in the IPA build).
  In Expo Go it depends on Expo Go's own localizations (may be English).

---

## 5. Data model (SQLite schema v3)

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

**v2 → v3** (v1.5.0, additive): table `page_text` – one row per page with
recognized text (see §9). `page_id` is the primary key and a foreign key to
`pages(id)` with `ON DELETE CASCADE` (`PRAGMA foreign_keys = ON` is set in
`database.ts`), so the text disappears with its page or document.

---

## 6. PDF structure

- One page per scan, MediaBox exactly A4 (595.28×841.89 pt) / Letter
  (612×792 pt) or the cropped aspect; image drawn full-page (no margins).
- Images are JPEG (`DCTDecode`) at the chosen DPI; quality
  Klein 55 / Standard 75 / Hoch 90.
- Metadata: Title (document name, Unicode), Creator/Producer `ScanFlow`,
  CreationDate/ModDate. No author, no device data.
- Optional diagonal watermark (Helvetica, WinAnsi-safe text).
- Invisible OCR text layer (v1.5.0, see §9): pages with up-to-date
  recognized text get one text object with every word in render mode 3 → the
  PDF is searchable and the text can be selected and copied. The optional
  `textLayer` hook in `buildPdf()` still runs after it.
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

## 8. App lock & security (v1.4.0)

```text
src/security/                 Pure TypeScript, no Expo imports (unit-tested in Node)
  sha256.ts                   SHA-256, HMAC-SHA256, PBKDF2-HMAC-SHA256, UTF-8 / hex, constant-time compare
  pinHash.ts                  PIN records v2 (PBKDF2) + verification of v1 records (≤ 1.3.0), weak-PIN check
  lockout.ts                  Persisted attempt limit (5 free, then 30 s / 1 min / 5 min / 15 min)
  lockPolicy.ts               When to lock: state machine over AppState changes
src/services/AuthService.ts   Keychain (expo-secure-store), Face ID / Touch ID / passcode
                              (expo-local-authentication), PIN, security settings
src/services/PrivacyService.ts  App-switcher blur + screen-capture protection (expo-screen-capture)
src/components/AppLockOverlay.tsx  Lock controller (AppState → lockPolicy), useAppLock() context
src/components/LockScreen.tsx      Lock screen: Face ID button / PIN pad / "no method" message
src/components/PinPad.tsx          Dots + keypad, shake, useCountdown()
src/components/PinSetupModal.tsx   PIN flows: create / change / verify
```

### When the app locks (`lockPolicy.ts`)

iOS reports `active`, `inactive` and `background`. **`inactive` means the app
is still on screen** – Face ID / passcode prompt, Control Center,
Notification Center, system alerts, the app switcher being opened. v1.3.0
locked on `inactive`, so the Face ID prompt relocked the app it had just
unlocked (endless loop). Rules now:

| Event | Lock on, "Sofort" | Lock on, 1 / 5 min |
| --- | --- | --- |
| Launch | locked, one automatic prompt | same |
| `inactive` | nothing | nothing |
| `background` | lock immediately (app-switcher snapshot + return show the lock screen) | remember the time |
| `active` after `background` | stays locked, one automatic prompt | lock if away ≥ timeout or the clock went backwards |
| Unlock result arrives while in `background` | ignored (stays locked) | ignored |

Lock off → always unlocked. Turning the lock on in Settings does not lock
the running session (the user just authenticated).

### How the lock is drawn (`AppLockOverlay.tsx`)

- The app content (**children) always stays mounted** – navigation, open
  editors and a running import survive locking.
- While locked, or while the settings are not read yet, `LockScreen` is
  rendered in a `FullWindowOverlay` (react-native-screens): a native view on
  the key window above the root view and above everything presented before
  the lock (crop screen, sheets, share sheet, VisionKit scanner). The
  keyboard is dismissed when locking.
- **Fail closed:** the Keychain is read up to 4 × (1.5 s apart); if it stays
  unreadable the app assumes "lock on" and reads again on the next `active`.
- The automatic Face ID prompt is shown once per lock / return and only
  while the app is `active`; afterwards the lock screen offers a button.

### Unlock methods (`AuthService.authenticateOwner()`)

| Device | Without ScanFlow PIN | With ScanFlow PIN |
| --- | --- | --- |
| Face ID / Touch ID enrolled | biometrics, iOS falls back to the device passcode | biometrics only; fallback button *ScanFlow-PIN eingeben* → PIN pad |
| Device passcode only (or biometrics locked by iOS) | device passcode | PIN pad |
| No device passcode | lock cannot be turned on; if it is on, stays locked with a message | PIN pad |

`authenticateOwner()` returns `success` only after iOS confirmed the user;
every error maps to `use-pin`, `cancelled` or `unavailable`. *PIN vergessen?*
(`authenticateBiometric()`) accepts Face ID / Touch ID only. Successful
biometrics reset the PIN attempt counter.

### PIN record (`pinHash.ts`)

```text
v2$<digits>$<iterations>$<saltHex>$<hashHex>
hash = PBKDF2-HMAC-SHA256(utf8(pin), salt, iterations, 32 bytes)
digits 4 | 6, iterations 5000 (accepted 1000…1 000 000), salt 16 random bytes
```

- v1 (≤ 1.3.0): hex of a 32-bit string hash of `"scanflow_salt_v1_" + pin`,
  4 digits – still verified, rewritten as v2 after the first correct entry
  (also v2 records with fewer iterations than `PIN_ITERATIONS`).
- Salt source: `crypto.getRandomValues` if present → native UUID v4
  (`expo`) → `Math.random` (uniqueness matters, secrecy does not).
- With 10⁴ / 10⁶ possible PINs no hash stops an attacker who has the record.
  The protection is the Keychain (this device only) and the attempt limit;
  the hash keeps the PIN itself out of storage.

### Attempt limit (`lockout.ts`)

`{ failures, lockedUntil, lastFailureAt }` as JSON in the Keychain
(`scanflow_pin_attempts`). The 5th wrong PIN starts a 30 s wait, each further
one 1 min → 5 min → 15 min (stays at 15 min). No PIN is checked during a
wait. A clock set back behind the last failure restarts the full wait.
Checks run one at a time (queue in `AuthService`). Reset by the correct PIN,
successful Face ID / Touch ID, a new or a removed PIN.

### Keychain entries

| Key | Content | Accessibility |
| --- | --- | --- |
| `scanflow_app_lock_enabled` | `true` / `false` | `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` |
| `scanflow_lock_timeout_sec` | `0` / `60` / `300` | `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` |
| `scanflow_hide_app_preview` | `true` / `false` (missing = `true`) | `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` |
| `scanflow_prevent_screen_capture` | `true` / `false` | `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` |
| `scanflow_security_pin` | PIN record | `WHEN_UNLOCKED_THIS_DEVICE_ONLY` |
| `scanflow_pin_attempts` | attempt state | `WHEN_UNLOCKED_THIS_DEVICE_ONLY` |
| `scanflow_keychain_version` | `2` after the one-time migration | `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` |

`migrateKeychain()` rewrites entries of ≤ 1.3.0 once with these classes
(expo-secure-store updates `kSecAttrAccessible` on existing items).
Preferences (quality, resolution, scanner) keep the default class.

### Privacy & files

- **App switcher:** `enableAppSwitcherProtectionAsync()` – native blur on
  `willResignActive`, removed on `didBecomeActive` (setting *App-Vorschau
  verbergen*, default on, independent of the lock).
- **Screenshots / recordings:** `preventScreenCaptureAsync('scanflow-settings')`
  (black output) only when *Screenshot-Schutz* is on; the screenshot notice
  is registered only then.
- **Exports:** one folder per export below `<cache>/scanflow-export/`,
  deleted when the share sheet closes (also after errors) and at every app
  start; only paths inside the export directory are deleted
  (`exportFolderOf()`). JPGs are shared without a declared type so
  expo-sharing does not stage a `.jpeg` hard link in its own cache.
- **Deleting** removes files directly. Overwriting is pointless on APFS
  (copy-on-write); iOS Data Protection encrypts the files at rest – only
  when a device passcode is set.

### Not covered by the app lock

- ScanFlow does not encrypt the database and page files itself (not
  possible in Expo Go). A development / IPA build could add SQLCipher and
  file encryption with a Keychain key – a decision for later.
- Backups contain the documents like any other app data.
- Alerts that appear while locked (e.g. an import error) can show above the
  lock screen.

### Tests

`__tests__/security.test.ts` (hashes vs. Node crypto incl. RFC 4231,
PIN records incl. v1, attempt limit, lock policy incl. the Face ID loop),
`__tests__/authService.test.ts` (in-memory Keychain + scripted Face ID:
no unlock without a check, PIN replaces the passcode, persisted lockout
across a fresh module instance, v1 upgrade, Keychain classes, migration),
`__tests__/exportCleanup.test.ts` (deletion after sharing, path guard).
Run: `npm run test:security`.

---

## 9. Text recognition, search & searchable PDF (v1.5.0)

### Engine: local module `modules/scanflow-ocr`

- Swift module `ScanFlowOcrModule` (Expo Modules API), autolinked from
  `modules/` into the IPA build (`expo-module.config.json`, pod `ScanFlowOcr`;
  CI step 7 fails if the pod is missing).
- `recognizeAsync(uri, options)` – `VNRecognizeTextRequest` on its own serial
  queue: level `accurate`, language correction on, languages `de-DE`, `en-US`
  (only the supported ones are passed), `minimumTextHeight` 0.008 (Vision's
  default 1/32 of the image height would skip small print). EXIF orientation is
  passed to Vision.
- Result: `{ width, height, languages, lines: [{ text, confidence, box,
  words: [{ text, box }] }] }`; boxes normalized, origin **bottom-left**
  (Vision). Words are the whitespace tokens of the top candidate; a word box is
  the union of the boxes of its first and last character.
- JS binding `modules/scanflow-ocr/index.ts`: `requireOptionalNativeModule`
  → `null` in Expo Go. `ocrService.available` is the only switch the UI uses.

### Coordinates and the staleness key

- `OcrBox` is normalized to the **rendered page** (crop, perspective and
  rotation applied), origin **top-left** – the geometry of the exported PDF
  page. `vision.ts` flips the y axis and clamps to the page. Native word boxes
  are used only when they look sane (one per token, left to right, on the
  line, none spanning a multi-word line); otherwise words are spread over the
  line box by character count.
- The page format does not change normalized positions (the homography maps
  the quad onto the whole page), filter and adjustments do not change the text.
  Therefore `ocrKey()` = FNV-1a of `[OCR_VERSION, original_uri, corners,
  rotation]`. Text whose `ocr_key` differs from the page's current key is
  stale: it is not used and the page is recognized again. Bump `OCR_VERSION`
  when the recognition setup changes (languages, level, minimum text height,
  OCR image) – every page is then recognized again.

### Table `page_text`

| Column | Meaning |
| --- | --- |
| `page_id` | Primary key, FK → `pages(id)` `ON DELETE CASCADE` |
| `ocr_key` | `ocrKey()` of the page state the text was recognized on |
| `engine`, `languages` | `apple-vision`, `de-DE,en-US` |
| `text` | Plain text: rows top to bottom, lines of one row joined by a tab |
| `search_text` | `searchTextOf(text)`: hyphenation joined, lower case, diacritics / ß / ligatures folded, whitespace collapsed |
| `lines` | Compact JSON `[[text, conf, x, y, w, h, [[word, x, y, w, h], …]], …]` (4 decimals) |
| `created_at` | Time of recognition |

Duplicating a document copies the rows of pages whose text is still current
(`COPY_PAGE_TEXT_SQL`, only if the source key matches).

### Background recognition (`OcrService` + `src/ocr/scheduler.ts`)

- Started in `app/_layout.tsx` (2.5 s after start, again whenever the app
  returns to the foreground); kicked after every saved scan / import, on focus
  of the library and the document screen and after a rotation (debounced
  1.2 s).
- Pending pages = pages without text or with a stale key
  (`PageTextRepository.pending()`). Order: the open document first, then the
  newest documents, pages in page order. One page at a time, 350 ms pause in
  between, only while the app is active and *Text erkennen* is on; paused while
  an export file is created (`ocrService.hold()`, released when the file is
  ready – before the share sheet opens).
- Per page: `imagePipeline.renderForOcr()` renders the page (filter
  *Original*, no adjustments, 200 dpi, long side ≤ 2400 px, JPEG 90) through
  the serial render queue into `cache/scanflow-ocr/`, the native module
  recognizes it, the temp file is deleted. The result is saved only if the page
  still exists with the same key (it may have been edited meanwhile).
- Failures: 2 attempts per page state (the second in a later run); after 5
  failures in a row the run stops until the next kick. Failed pages are shown
  as *Text konnte nicht erkannt werden* with *Erneut versuchen*.
- Setting *Text erkennen* (Keychain key `scanflow_ocr_enabled`, default on).
  Turning it off stops new recognition; the user chooses to keep or delete the
  stored text (`ocrService.clearAll()`).

### Search (`src/db/textSearch.ts`)

- Every query word (max. 6) must match: `title LIKE %word%` (SQLite LIKE:
  case-insensitive for ASCII only) **or** a page of the document whose
  `search_text LIKE %normalizeForSearch(word)%`. Wildcards are escaped
  (`ESCAPE '\'`).
- Excerpt: `SNIPPET_SQL` returns the text of the first matching page (lowest
  page number) per document; `findSnippet()` cuts ~36 characters around the
  first hit and returns the hit in its original spelling for bold display.

### Searchable PDF (`src/ocr/pdfTextLayer.ts`)

- `ExportService` asks `ocrService.linesForExport(page)` for every page:
  stored current text, otherwise (OCR on and available) the page is recognized
  now; errors → the page stays image-only.
- One `BT … ET` block per page, `3 Tr` (invisible). Per word: Helvetica
  (standard font, WinAnsi) at size = box height / (ascent + descent), `Tz`
  horizontal scaling so the advance width equals the box width (5–1000 %),
  baseline = box bottom + descent. Words of a line are separated by a trailing
  space (it falls into the gap to the next word), so copied text has spaces.
- Characters outside WinAnsi are replaced by a close letter (ł → l, ș → s …)
  or `?` – only in the invisible layer.
- Verified in `__tests__/pdfTextLayer.test.ts`: content stream structure and,
  with poppler's `pdftotext -bbox`, the position of every word (≤ 1–2.5 pt).

### Tests

`__tests__/ocr.test.ts` (key, reading order, normalization, snippets,
storage format, Vision conversion), `ocrScheduler.test.ts` (order, retries,
loop guard, hold, debounce), `pdfTextLayer.test.ts`, `textSearch.test.ts`
(search, snippets, copy, cascade on real SQLite), `migrations.test.ts`
(v2 → v3). Run: `npm run test:ocr`. The Swift module itself can only be
compiled in CI (macOS) and tested on the iPhone (ROADMAP STOP C).

---

## 10. Bottom sheets & navigation (v1.6.0)

### `BottomSheet` (`src/components/BottomSheet.tsx`, `sheetMotion.ts`)

- One `Animated.Value`: the sheet's offset below its open position (0 = open,
  sheet height = hidden; parked at the window height while hidden). The
  backdrop opacity is interpolated from it (`[0, height] → [dim, 0]`), so the
  backdrop and the sheet always move together – also while the sheet is
  pulled. The RN `Modal` is `transparent` with `animationType="none"`; all
  motion runs on the native driver.
- Open and snap back: spring (stiffness 220, damping 24, mass 1 → damping
  ratio ≈ 0.81, ≈ 1 % overshoot). Close: timing with the iOS sheet curve
  `bezier(0.32, 0.72, 0, 1)`, 280 ms; after a flick the duration follows the
  finger's speed (140–280 ms). A sheet-coloured skirt below the sheet covers
  the gap while it bounces or is stretched upwards (rubber band, max 40 pt).
- Pull to close (`PanResponder`, never on touch start, so taps stay with the
  buttons): starts after 8 pt of mostly vertical movement; closes when
  released after ≥ 30 % of the sheet height (max 160 pt) or at ≥ 0.8 pt/ms
  after ≥ 16 pt; moving up at ≥ 0.3 pt/ms keeps it open. `dragArea="top"`
  limits the start to the top 60 pt (handle + title) for sheets with sliders
  or lists (*Anpassen*, *In Ordner verschieben*).
- `SheetMachine` (hidden → waiting for the layout → opening → open ⇄
  dragging / settling → closing → hidden) is pure TypeScript with an injected
  driver and is unit-tested (`__tests__/sheetMotion.test.ts`). It keeps the
  modal presented while the sheet glides out, reports `onClose` (backdrop,
  pull, VoiceOver escape) and `onDismiss` exactly once per close – after
  `Modal.onDismiss`, or 1 s after hiding if that event never arrives.
  Reopening while closing turns the sheet around; if the screen ignores
  `onClose`, the sheet comes back.
- `dismissible={false}` (export sheet while the file is created) disables the
  backdrop, the pull and the escape gesture; the screen can still close it.

### Hand-over rule

- Anything presented after a sheet (prompt, alert, next sheet, share sheet,
  scanner) starts from the sheet's `onDismiss` (AGENTS.md rule 9). The
  document and folder menus store the chosen entry and run it there; the
  export flow keeps `ModalHandoff` (`ExportModal.onDismiss`).
- Menus keep showing the last document / folder while they glide out (the
  screens clear it on close).

### Tab bar & search tab

- `app/(tabs)/_layout.tsx`: five routes – `index`, `search`,
  `scan-tab-placeholder` (camera button via `tabBarButton`), `tools`,
  `settings`. Every tab bar item has `flex: 1`, so five slots put the camera
  button exactly in the middle. Labels 10 pt with `tabBarAllowFontScaling:
  false` (like the iOS tab bar).
- `app/(tabs)/search.tsx`: `documentRepository.getAll({ searchQuery })`
  without a folder (all folders), excerpts from
  `pageTextRepository.snippets()`, folder names from `folderRepository`.
  Only the newest search may update the list (sequence counter); it searches
  again on focus and on `ocrService` page events while a query is active.

---

## 11. Not yet implemented (see ROADMAP)

- Live edge overlay / auto-capture in ScanFlow's *own* camera (`app/scan.tsx`).
  Live detection and auto-capture are provided by the iOS document scanner
  (default); Expo Go offers no camera frame processors for a custom overlay.
- Text recognition in Expo Go (needs the native module), OCR of handwriting,
  normalized (umlaut-insensitive) title search, Unicode font for non-WinAnsi
  text in the PDF layer.
