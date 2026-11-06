# Spike: M1 PDF Toolkit Native Functions (PDFKit Rasterization & Encryption)

- **Status:** `adopt`
- **Milestone:** M1 (v1.9.0)
- **Date:** 2026-11-06
- **Module / Target:** `modules/scanflow-ocr/ios/ScanFlowOcrModule.swift`, `app.json` (`CFBundleDocumentTypes`)

---

## 1. Goal & Hypothesis
- **Goal:**
  1. Allow importing external multi-page PDFs (up to 50+ pages) from the iOS Files app or via "Open in ScanFlow" by rasterizing each page at 200 dpi into a sandboxed JPEG image and feeding it into ScanFlow's non-destructive page pipeline + background OCR.
  2. Allow exporting password-protected PDFs using native iOS PDFKit encryption, verifying that the written file is actually encrypted and locked before sharing.
- **Hypothesis:** Apple's built-in `PDFKit` (`PDFDocument`, `PDFPage`) and `CoreGraphics` (`CGContext`, `ImageIO` `CGImageDestination`)—already linked in `modules/scanflow-ocr`—can perform both page-by-page rasterization and standard PDF password encryption with zero third-party native dependencies.

## 2. Minimal Native Surface
Added to `ScanFlowOcrModule.swift` on the dedicated serial `ocrQueue` (`qos: .userInitiated`):

1. **`getPdfInfoAsync(uri: String) -> Promise<{ pageCount: number; isEncrypted: boolean; isLocked: boolean; title?: string }>`**
   - Opens `PDFDocument(url:)` inside `autoreleasepool` and returns page count, lock state, and optional title attribute (`PDFDocumentAttribute.titleAttribute`).
2. **`renderPdfPageAsync(uri: String, pageIndex: number, dpi: number, outputUri: String) -> Promise<{ pageIndex: number; width: number; height: number; uri: string }>`**
   - Opens `PDFDocument(url:)` and `doc.page(at: pageIndex)` inside `autoreleasepool`.
   - Computes target pixel dimensions from `page.bounds(for: .mediaBox)` at `scale = dpi / 72.0` (200 dpi → `scale ≈ 2.778`), clamped so the long side never exceeds `2400` px (protecting memory on oversized architectural/poster PDFs).
   - Renders into an 8-bit RGB `CGContext` with a white fill, draws the PDF page via `page.draw(with: .mediaBox, to: ctx)`, and writes the resulting `CGImage` directly to `outputUrl` as a JPEG (`kCGImageDestinationLossyCompressionQuality: 0.90`) using `ImageIO`.
   - Peak memory is bounded to a single page (~15–20 MB) because each page is rendered and written inside its own `autoreleasepool` call from JS.
3. **`encryptPdfAsync(sourceUri: String, outputUri: String, password: String) -> Promise<{ uri: string; isEncrypted: boolean; isLocked: boolean }>`**
   - Uses a `defer` block to guarantee the unencrypted `sourceUrl` is deleted via `FileManager.default.removeItem(at: sourceUrl)` regardless of outcome.
   - Opens `PDFDocument(url: sourceUrl)` and writes to `outputUrl` with:
     ```swift
     [
       PDFDocumentWriteOption.userPasswordOption: password,
       PDFDocumentWriteOption.ownerPasswordOption: password
     ]
     ```
   - Re-opens `PDFDocument(url: outputUrl)` and asserts:
     - `checkDoc.isEncrypted == true`
     - `checkDoc.isLocked == true`
     - `checkDoc.unlock(withPassword: password) == true`
   - If any assertion fails, deletes `outputUrl` and throws `PdfEncryptionFailedException`.

### Info.plist (`app.json`) Additions
- `CFBundleDocumentTypes`: registers `com.adobe.pdf` and `public.image` (`LSHandlerRank: "Alternate"`) so iOS shows **ScanFlow** in the "Open in…" / Share menu for PDFs and images.
- `LSSupportsOpeningDocumentsInPlace: false`: ensures iOS hands ScanFlow a copy in `Documents/Inbox` or a readable temporary URL rather than mutating the user's original file in place.

## 3. Expo Go Fallback Behavior
- `ScanFlowOcr` is loaded via `requireOptionalNativeModule('ScanFlowOcr')` (`null` in Expo Go).
- `pdfToolkitService.canImportPdf` and `pdfToolkitService.canEncryptPdf` check `Boolean(ScanFlowOcr?.renderPdfPageAsync)` / `Boolean(ScanFlowOcr?.encryptPdfAsync)`.
- In **Expo Go**:
  - Selecting a PDF to import shows a clear localized alert explaining that PDF rasterization requires the installed ScanFlow IPA, while image import (`JPG`/`PNG`), document merge, page extract, and page split work in Expo Go.
  - In the Export sheet, the *Passwortschutz* toggle is disabled in Expo Go with a localized note.

## 4. Failure Modes & Safeguards
- **Password-locked input PDF (`isLocked == true`):** Detected before page rendering; shows a localized alert (*"Diese PDF-Datei ist passwortgeschützt und kann nicht importiert werden."*).
- **Corrupted or 0-page PDF:** Throws `OcrImageException` and cleans up any temporary copied file in `cache/`.
- **50-page PDF import:** Processed 1 page at a time with progress updates (`Seite X von Y`) and `yieldToUi()` between pages; if any page fails, `saveScan` rolls back files imported so far.
- **Unencrypted temp PDF during password export:** Written inside the per-export temp directory (`storageService.createExportSubdir()`) and deleted both by Swift's `defer` block and by `exportService.discardExport()` after sharing.

## 5. Verification & CI Evidence
- **Unit tests (Node / Jest):**
  - `__tests__/pdfToolkit.test.ts`: tests PDF import orchestration, locked-PDF handling, Expo Go fallback, password validation, and encryption verification failure handling with mocked native calls.
- **CI build proof:** Will be verified in `.github/workflows/build-ipa.yml` on `macos-15` when `feat/m0-m1-pdf-toolkit` is merged after STOP M1 approval (`UNVERIFIED (needs iPhone)` until tested on device).

## 6. Verdict
- **`adopt`:** Reuses the existing `modules/scanflow-ocr` Swift module and system `PDFKit` / `ImageIO` frameworks with ~110 lines of Swift, zero external dependencies, bounded single-page memory, and strict post-write encryption verification.
