# ScanFlow – Architecture: Scan & Image Pipeline (Phase A + B), App Lock & Security (v1.4.0), Text Recognition (v1.5.0), Native iOS UI (v1.7.0)

This document describes how ScanFlow captures pages (iOS document scanner or
its own camera), turns a phone photo into a page that looks like a real
scanned PDF page, how page state is stored, and how the pieces are tested. It
is the reference for anybody changing `src/imaging/` or the scan flow.
Section 8 describes the app lock, the ScanFlow PIN and the privacy features
(`src/security/`, v1.4.0), section 9 the text recognition, the text search and
the searchable PDF (`src/ocr/`, `modules/scanflow-ocr`, v1.5.0), section 10
native sheets, navigation and UI conventions (v1.7.0).

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
src/components/adjustSheetSession.ts  In-memory bridge for live document adjustments while the form sheet is open
src/components/useNativeMenu.ts      Native action sheets and delayed follow-up presentation
src/components/ui/                   Shared controls, SF Symbols, native segmented-control wrapper
src/theme/shape.ts, squircle.ts      Continuous corner tokens/helpers and Skia path
app/sheets/                          Native form sheet routes: adjust, export, move, text
app/(tabs)/_layout.tsx               Native tab bar and per-tab native stacks
app/search.tsx                       All-folder title / recognized-text search

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
  ScanFlow camera instead. The export route creates the file with progress
  visible in a native form sheet, then presents the system share sheet above
  the still-open route. No presentation is started during its dismissal; the
  route closes only after sharing completes. This interaction needs iPhone
  verification. Remaining custom menus still hand off via `onDismiss` (§10).
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

## 10. Native iOS UI conventions

- Use native stack headers and the system tab bar. The library, tools and settings have large titles; the library uses the native header search and sort menu. The Scan tab intercepts the system tab press without selecting a placeholder and calls `useScanner()`. All-folder search is available in the library menu.
- Export, recognized text, folder selection and adjustments are `formSheet` routes with native detents, grabbers and scroll expansion. Leave system corner radii and backdrop untouched. iOS 26 uses a transparent sheet content background for system material; older versions use the theme surface. Test both on devices.
- Page overview, PIN setup and camera review use native RN page sheets because their callback-based flows remain mounted. Disable interactive dismissal for active saves and exports. Present the share sheet above the still-open export sheet, never while a sheet is dismissing. The OCR hold ends when generation ends; exported files are cleaned up after sharing.
- iOS action sheets and prompts have no dismissal callback: `useNativeMenu` defers a selected action briefly before starting any follow-up presentation. Page-editor handoffs use `Modal.onDismiss` with a fallback. Presentation timing and the sharing flow require iPhone testing.
- The adjustment route uses `adjustSheetSession` as a temporary in-memory bridge to the mounted editor; no document data is serialized through the route. The bridge is cleared when the editor unmounts.
- `src/theme/shape.ts` provides continuous radius tokens and `corner`, `corners`, `capsule`, and `concentric`; use `squirclePath` for Skia paths. Use shared UI primitives, `Icon` for SF Symbols, and `StyleSheet.hairlineWidth` for borders. Keep shadows on a separate non-clipping wrapper. Run `npm run check:corners`.
- Text styles follow iOS sizes; fixed-height controls cap Dynamic Type where needed. Native segmented controls are used for export, appearance, language and crop format; the scanner selector remains custom because it needs to disable only one option.
- `app/search.tsx` searches all folders and includes recognized text excerpts where available. Only the newest search may update the list; it searches again on focus and OCR page events.
- Native tabs, sheet detents, system material, share presentation, and segmented-control interoperability must be verified on a physical iPhone in both Expo Go and the installed IPA. OCR and the system scanner have their existing availability limitations in Expo Go.

---

## 11. Entitlements & PDF Toolkit (v1.9.0, M0 + M1)

### Entitlements (`src/entitlements/index.ts`)
- Centralizes Free vs. Pro feature keys (`FreeFeatureKey`, `ProFeatureKey`, `FeatureKey`) and exposes `isUnlocked(feature: FeatureKey): boolean`.
- Default mode is `'all_unlocked'` until M5 (`v1.13.0`), so every user has full access while new features already call `isUnlocked(...)` at their entry points (`verified by tests` in `__tests__/entitlements.test.ts`).

### Native Additions in `modules/scanflow-ocr` (`ScanFlowOcrModule.swift`)
All native functions live in the single local Expo module `modules/scanflow-ocr` and run on `workerQueue` (`com.scanflow.ocr`, QoS `.utility`). In Expo Go, `getNativeModule()` returns `null` and callers degrade gracefully without crashing:

| Function | Purpose | Verification Status |
| --- | --- | --- |
| `recognizeAsync(uri, options)` | Apple Vision text recognition on an image file (v1.5.0) | Swift compiled in CI; tested on iPhone in v1.5.1/v1.8.0 |
| `recognizePdfAsync(uri, options)` | Extracts embedded PDF text or runs Apple Vision page by page for Word conversion (v1.8.0) | Swift compiled in CI; tested on iPhone in v1.8.0 |
| `getPdfInfoAsync(uri)` | Opens a PDF via `PDFDocument(url:)` and returns `{ pageCount, isEncrypted, isLocked }` (v1.9.0) | Service logic `verified by tests` (`__tests__/pdfToolkit.test.ts`); Swift compilation in CI; device execution `UNVERIFIED (needs iPhone)` |
| `renderPdfPageAsync(uri, pageIndex, dpi, outputUri)` | Rasterizes a single 0-based PDF page at `dpi` (default 200, long side capped at 2400 px) inside `autoreleasepool` onto a white RGB bitmap context (`page.draw(with: .mediaBox, to: ctx)`) and writes a JPEG (quality 0.90) to `outputUri` (v1.9.0) | Service logic `verified by tests`; Swift compilation in CI; 50-page PDF import `UNVERIFIED (needs iPhone)` |
| `encryptPdfAsync(inputUri, outputUri, password)` | Re-saves a generated PDF with `PDFDocumentWriteOption.userPasswordOption` and `.ownerPasswordOption`, deletes `inputUri` in `defer`, and re-opens `outputUri` to assert `isEncrypted && isLocked && unlock(withPassword:)` before returning (v1.9.0) | Password validation `verified by tests`; Swift compilation in CI; iOS Files password prompt `UNVERIFIED (needs iPhone)` |

- **Encryption strength note:** Apple `PDFDocument.write(to:withOptions:)` with `.userPasswordOption` / `.ownerPasswordOption` writes standard PDFKit password protection (RC4-128 / AES-128 depending on the iOS PDFKit version and PDF catalog). Neither the UI nor the documentation claims AES-256 for PDF export.

### Incoming Files ("Open in ScanFlow") & Document Operations
- `app.json` registers `CFBundleDocumentTypes` for `com.adobe.pdf` and `public.image` with `LSSupportsOpeningDocumentsInPlace: false` so iOS copies incoming files into ScanFlow's sandbox Inbox (`UNVERIFIED (needs iPhone)`).
- `app/_layout.tsx` listens for initial and runtime `file://` URLs via `expo-linking` and passes them to `pdfToolkitService.handleIncomingUrl()`.
- `src/db/documentOperations.ts` and `src/services/DocumentRepository.ts` implement:
  - `moveManyToFolder(docIds, folderId)` and `deleteMany(docIds)`
  - `mergeDocuments(docIds, newTitle?)`: creates a merged document preserving non-destructive page state (`corners`, `rotation`, `filter`, `adjustments`, `page_format`), rendered previews, and `page_text` OCR records (`verified by tests` in `__tests__/documentOperations.test.ts`).
  - `extractPagesToDocument(sourceDocId, pageIds, newTitle?)` and `splitDocumentAtPage(sourceDocId, fromPageNumber, newTitle?)`: extracts selected pages into a new document or splits pages `fromPageNumber..N` into a second document while re-indexing remaining pages (`verified by tests` in `__tests__/documentOperations.test.ts`).
- `ExportService.generateBatchZip(documentIds, options)` renders each selected document to a PDF and packages them into a single `.zip` archive in `storageService.exportDir` using `buildZip()` (`src/docx/zip.ts`) and `deduplicateFileNames()`, then deletes the archive after the system share sheet closes.

---

## 12. Capture Modes & Non-Destructive Marking (v1.10.0, M2)

### Non-Destructive Page Annotations & Visual Signatures (`src/imaging/annotations.ts`, Schema v4)
- **Schema v4 (`src/db/migrations.ts`):** adds `annotations TEXT` (nullable JSON array of `PageAnnotation`) to `pages` and creates the `signatures` table (`id`, `label`, `strokes` JSON, `aspect_ratio`, `created_at`) for reusable vector signatures (`verified by tests` in `__tests__/migrations.test.ts`).
- **Annotation types:**
  - `signature`: normalized vector strokes (`points`, `widthRatio`) rendered in ink color (`#0A2463`, `#111111`, `#0050B3`, or `#9E1B1B`).
  - `text` and `date_stamp`: positioned normalized box (`x`, `y`, `width`, `height`, `rotationDeg`) rendered via `Skia.Font` when a system typeface is available on iOS and falling back to a built-in vector stroke glyph table in headless CanvasKit tests.
  - `pen` and `highlighter`: freehand smoothed strokes (`smoothStrokePoints` Chaikin refinement), with `highlighter` rendered using `BlendMode.Multiply` and semi-transparent alpha.
- **Photo-to-signature extraction (`thresholdSignatureRgba`):** converts a photo of a signature on paper into normalized ink strokes by computing an adaptive luminance threshold (`mean - 24`, clamped to `70..195`) and scanning connected dark ink runs (`verified by tests` in `__tests__/annotationsAndIdCard.test.ts`).
- **Renderer & OCR integration (`PageRenderer.render`, `RENDER_VERSION = 2`):**
  - `renderKey(page)` hashes `annotations` alongside `corners`, `rotation`, `filter`, `adjustments`, and `page_format` (`verified by tests` in `__tests__/pageState.test.ts`).
  - `PageRenderer.render()` draws `opts.annotations` on the GPU canvas immediately after the `ENHANCE_SKSL` shader pass, ensuring identical appearance across previews, thumbnails, and PDF/JPG exports.
  - `ImagePipelineService.renderForOcr()` explicitly passes `annotations: undefined` so user markings never pollute Apple Vision OCR text recognition.
- **Legal/honesty note:** Signatures in ScanFlow are **visual signatures** (*Unterschrift einfügen*), not cryptographically signed or qualified electronic signatures (QES).

### ID-Card Mode on One A4 Page (`src/imaging/idCard.ts`)
- **True 1:1 physical scale on A4:** ISO/IEC 7810 ID-1 cards measure `85.60 × 54.00 mm` (`aspect = 1.5852`). On an A4 sheet (`210 × 297 mm`), `computeIdCardA4Placement()` sizes each card to `widthRatio = 85.6 / 210 ≈ 0.4076` and `heightRatio = 54.0 / 297 ≈ 0.1818`, centered horizontally with a `16 mm` vertical gap between front and back (`verified by tests` in `__tests__/annotationsAndIdCard.test.ts`).
- **Perspective de-warp & optional purpose watermark (`composeIdCardA4`):** de-warps both front and back images from their 4-corner quads via `WARP_SKSL`, draws subtle border hairlines on a white A4 canvas, and optionally overlays a diagonal purpose watermark (`formatIdCardWatermark(purpose, date)` → *"Kopie – nur für \<Zweck\>, DD.MM.YYYY"*).

### QR, Barcode & EPC/GiroCode Scanner (`src/tools/epc.ts`, `src/tools/barcode.ts`, `QrScannerService.ts`)
- **EPC069-12 GiroCode parser (`parseEpcQrPayload`):** validates service tag `BCD`, version `001`/`002`, character set `1..8`, identification `SCT`, BIC (8 or 11 chars), recipient name (≤ 70 chars), IBAN (ISO 13616 length + mod-97 check), `EUR` amount (`0.01..999999999.99`), and remittance reference/text (`verified by tests` in `__tests__/barcode.test.ts`).
- **Safe URL handling (`classifyBarcodePayload`):** validates `http:` / `https:` URLs, rejects URLs containing `@` userinfo before the host (anti-spoofing), and requires explicit user confirmation showing the full URL before calling `Linking.openURL`.
- **Privacy-first history (`QrScannerService`):** scan history is **disabled by default** and stored only in Keychain (`expo-secure-store`, max 30 entries) when explicitly enabled by the user, with a one-tap *Verlauf löschen* action.

---

## 13. Organization, Automation, Smart Naming & Full Backup (v1.11.0, M3)

### 30-Day Trash (*Zuletzt gelöscht*, Schema v5)
- **Schema v5 (`src/db/migrations.ts`):** adds `deleted_at INTEGER` and index `idx_documents_deleted_at` to `documents` (`SCHEMA_VERSION = 5`).
- **Soft delete lifecycle:** `DocumentRepository.delete(id)` and `deleteMany(ids)` set `deleted_at = Date.now()` instead of immediately unlinking rows and disk files.
- **Query isolation:** all standard repository queries (`getAll`, `getRecent`, `getByFolder`, `countAll`) filter `WHERE deleted_at IS NULL`. Document text searches and OCR queue jobs filter out trashed documents (`WHERE d.deleted_at IS NULL`).
- **Trash management (`src/components/TrashModal.tsx`):** lists trashed documents with remaining days countdown (30 days retention: `Math.max(0, 30 - elapsedDays)`), one-tap document restoration (`restore(id)`), single permanent deletion (`permanentDelete(id)`), or bulk *Papierkorb leeren*.
- **Automatic purge on app launch:** `DocumentRepository.purgeExpiredTrash(retentionDays = 30)` runs during app startup in `app/_layout.tsx`, permanently deleting expired documents and unlinking their page image files and OCR text records (`verified by tests` in `__tests__/migrations.test.ts` and `__tests__/organization.test.ts`).

### Favorites & Tags (`src/services/DocumentRepository.ts`, `src/db/textSearch.ts`)
- **Schema v5 columns:** `is_favorite INTEGER NOT NULL DEFAULT 0` (with index `idx_documents_is_favorite`) and `tags TEXT` (nullable JSON string array).
- **Favorites sorting:** `DocumentRepository.getAll()` sorts `is_favorite DESC` first, pinning starred documents to the top of the Library across all sort modes. Toggled via `toggleFavorite(id)` from the document screen or library context actions.
- **Tags management:** `setTags(id, tags)` updates tag lists; `getAllTags()` returns distinct used tags across all non-trashed documents for quick chip suggestions in `TagEditModal.tsx`.
- **Search integration:** `SEARCH_DOCUMENTS_SQL` in `src/db/textSearch.ts` searches title, recognized OCR text, and `d.tags LIKE %tag%` (`verified by tests` in `__tests__/organization.test.ts`).

### Deterministic Smart Naming (`src/utils/organization.ts`, `SmartNamingService.ts`)
- **Deterministic tokens:** `{date}`, `{time}`, `{folder}`, `{firstLine}`, `{counter}` configured via template strings (default: `"{date}_{time}"`).
- **Date parsing:** regex extractors for German numeric dates (`DD.MM.YYYY`), ISO dates (`YYYY-MM-DD`), and written German dates (`14. März 2026`). If no date is found in the recognized text, the document's creation date is used as fallback.
- **Auto-rename safeguard:** `OcrService.saveIfCurrent` invokes `smartNamingService.applySmartNamingOnOcr(docId, text)` only when page 1 OCR finishes and only while `title_auto = 1`. If the user manually edited the title (`title_auto = 0`), the title is never overwritten. Settings provides preset selection and real-time live preview (`verified by tests` in `__tests__/organization.test.ts`).

### Full-Library ZIP Backup & Restore (`src/utils/backupManifest.ts`, `src/docx/zip.ts`, `BackupService.ts`)
- **Manifest v1 specification:** `BackupManifest` contains `schemaVersion: 5`, creation timestamp, app version, and serialized arrays of `folders`, `documents`, `pages` (with complete non-destructive page state: `corners`, `rotation`, `filter`, `adjustments`, `page_format`, `annotations`), and vector `signatures`. Validated on restore with strict version compatibility checks (`verified by tests` in `__tests__/backupManifest.test.ts`).
- **Pure-TS Store-mode ZIP writer & reader (`src/docx/zip.ts`):** `buildZip()` creates standard PKZIP archives; `readZip(archive: Uint8Array)` parses local file headers, validates CRC-32 checksums, and rejects path traversal (`..` or leading `/`). No external native unzip libraries required.
- **Serial, memory-safe backup & restore (`BackupService`):**
  - **Backup:** serial image copying into a temporary backup directory, manifest generation, ZIP packaging, size verification (> 150 MB warning prompt), and sharing via the system share sheet (`expo-sharing`).
  - **Restore:** opens `.zip` archives via `expo-document-picker`, parses `manifest.json`, safely restores folders, documents, page files, and signatures into SQLite and the local sandbox file system with ID remapping to prevent primary key conflicts (`verified by tests` in `__tests__/backupManifest.test.ts`; share sheet & document picker `UNVERIFIED (needs iPhone)`).
- **Prohibition compliance:** zero network clients (no WebDAV, no SMB, no cloud servers); backups operate strictly through native iOS Files picker and system share sheet.

---

## 14. Not yet implemented (see ROADMAP)

- Live edge overlay / auto-capture in ScanFlow's *own* camera (`app/scan.tsx`).
  Live detection and auto-capture are provided by the iOS document scanner
  (default); Expo Go offers no camera frame processors for a custom overlay.
- Text recognition, PDF import rasterization, and PDF password encryption in
  Expo Go (require the native `modules/scanflow-ocr` module in the IPA build).
- Milestones M4–M7 of Phase V2 (haptics & accessibility audit, StoreKit 2 Pro
  unlock, store package & TestFlight submission prep – see `docs/ROADMAP.md`).
