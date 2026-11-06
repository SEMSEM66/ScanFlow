// On-device text recognition for ScanFlow with Apple Vision (VNRecognizeTextRequest).
// Runs fully offline. Boxes are normalized with the origin bottom-left (Vision);
// the JS side converts them (src/ocr/vision.ts).

import CoreGraphics
import ExpoModulesCore
import Foundation
import ImageIO
import PDFKit
import StoreKit
import Vision

struct RecognizeOptions: Record {
  /// BCP-47 codes in priority order; unsupported ones are ignored.
  @Field var languages: [String] = ["de-DE", "en-US"]

  /// "accurate" (default) or "fast".
  @Field var level: String = "accurate"

  @Field var usesLanguageCorrection: Bool = true

  /// Minimum text height relative to the image height; 0 keeps the Vision default.
  @Field var minimumTextHeight: Double = 0
}

internal final class OcrImageException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "Could not read the image: \(param)"
  }
}

internal final class OcrFailedException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "Text recognition failed: \(param)"
  }
}

internal final class PdfLockedException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "PDF document is password-locked: \(param)"
  }
}

internal final class PdfEncryptionFailedException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "PDF encryption failed: \(param)"
  }
}

public final class ScanFlowOcrModule: Module {
  // One recognition at a time, off the JS thread and off Expo's shared async queue.
  private let ocrQueue = DispatchQueue(label: "app.scanflow.ocr", qos: .userInitiated)

  public func definition() -> ModuleDefinition {
    Name("ScanFlowOcr")

    AsyncFunction("supportedLanguagesAsync") { () throws -> [String] in
      return try ScanFlowOcrModule.supportedLanguages()
    }.runOnQueue(ocrQueue)

    AsyncFunction("recognizeAsync") { (url: URL, options: RecognizeOptions) throws -> [String: Any] in
      return try ScanFlowOcrModule.recognize(url: url, options: options)
    }.runOnQueue(ocrQueue)

    AsyncFunction("recognizePdfAsync") { (url: URL, options: RecognizeOptions) throws -> [String: Any] in
      return try ScanFlowOcrModule.recognizePdf(url: url, options: options)
    }.runOnQueue(ocrQueue)

    AsyncFunction("getPdfInfoAsync") { (url: URL) throws -> [String: Any] in
      return try ScanFlowOcrModule.getPdfInfo(url: url)
    }.runOnQueue(ocrQueue)

    AsyncFunction("renderPdfPageAsync") { (url: URL, pageIndex: Int, dpi: Double, outputUrl: URL) throws -> [String: Any] in
      return try ScanFlowOcrModule.renderPdfPage(url: url, pageIndex: pageIndex, dpi: dpi, outputUrl: outputUrl)
    }.runOnQueue(ocrQueue)

    AsyncFunction("encryptPdfAsync") { (sourceUrl: URL, outputUrl: URL, password: String) throws -> [String: Any] in
      return try ScanFlowOcrModule.encryptPdf(sourceUrl: sourceUrl, outputUrl: outputUrl, password: password)
    }.runOnQueue(ocrQueue)

    AsyncFunction("fetchProductsAsync") { (productIds: [String]) async throws -> [[String: Any]] in
      return try await ScanFlowOcrModule.fetchProducts(productIds: productIds)
    }

    AsyncFunction("purchaseProductAsync") { (productId: String) async throws -> [String: Any] in
      return try await ScanFlowOcrModule.purchaseProduct(productId: productId)
    }

    AsyncFunction("restorePurchasesAsync") { () async throws -> [String: Any] in
      return try await ScanFlowOcrModule.restorePurchases()
    }

    AsyncFunction("checkEntitlementsAsync") { () async throws -> [String: Any] in
      return try await ScanFlowOcrModule.checkEntitlements()
    }
  }

  private static func supportedLanguages() throws -> [String] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    return try request.supportedRecognitionLanguages()
  }

  private static func recognizeCgImage(
    _ image: CGImage,
    orientation: CGImagePropertyOrientation,
    options: RecognizeOptions
  ) throws -> (lines: [[String: Any]], languages: [String]) {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = options.level == "fast" ? .fast : .accurate
    request.usesLanguageCorrection = options.usesLanguageCorrection
    if options.minimumTextHeight > 0 {
      request.minimumTextHeight = Float(options.minimumTextHeight)
    }
    let supported = (try? request.supportedRecognitionLanguages()) ?? []
    let languages = options.languages.filter { supported.contains($0) }
    if !languages.isEmpty {
      request.recognitionLanguages = languages
    }

    let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
    do {
      try handler.perform([request])
    } catch {
      throw OcrFailedException(error.localizedDescription)
    }

    var lines: [[String: Any]] = []
    for observation in request.results ?? [] {
      guard let candidate = observation.topCandidates(1).first else {
        continue
      }
      let text = candidate.string
      if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        continue
      }
      lines.append([
        "text": text,
        "confidence": Double(candidate.confidence),
        "box": rectArray(observation.boundingBox),
        "words": words(of: candidate)
      ])
    }
    return (lines: lines, languages: languages)
  }

  private static func recognize(url: URL, options: RecognizeOptions) throws -> [String: Any] {
    return try autoreleasepool { () throws -> [String: Any] in
      guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
            let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw OcrImageException(url.lastPathComponent)
      }
      let orientation = imageOrientation(source)
      let recognized = try recognizeCgImage(image, orientation: orientation, options: options)

      var width = image.width
      var height = image.height
      switch orientation {
      case .left, .leftMirrored, .right, .rightMirrored:
        swap(&width, &height)
      default:
        break
      }
      return [
        "width": width,
        "height": height,
        "languages": recognized.languages,
        "lines": recognized.lines
      ]
    }
  }

  private static func recognizePdf(url: URL, options: RecognizeOptions) throws -> [String: Any] {
    guard let doc = PDFDocument(url: url), doc.pageCount > 0 else {
      throw OcrImageException(url.lastPathComponent)
    }
    var pages: [[String: Any]] = []
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue

    for i in 0..<doc.pageCount {
      let pageDict = try autoreleasepool { () throws -> [String: Any] in
        guard let page = doc.page(at: i) else {
          return [
            "pageIndex": i,
            "width": 0,
            "height": 0,
            "languages": [],
            "lines": [],
            "embeddedText": ""
          ]
        }
        let rawBounds = page.bounds(for: .mediaBox)
        let bounds = (rawBounds.width > 0 && rawBounds.height > 0)
          ? rawBounds
          : CGRect(x: 0, y: 0, width: 595, height: 842)
        let maxDim = max(bounds.width, bounds.height)
        let scale = min(3.0, max(1.5, 1800.0 / maxDim))
        let pixelWidth = max(1, Int((bounds.width * scale).rounded()))
        let pixelHeight = max(1, Int((bounds.height * scale).rounded()))

        var lines: [[String: Any]] = []
        var languages: [String] = []

        if let ctx = CGContext(
          data: nil,
          width: pixelWidth,
          height: pixelHeight,
          bitsPerComponent: 8,
          bytesPerRow: 0,
          space: colorSpace,
          bitmapInfo: bitmapInfo
        ) {
          ctx.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
          ctx.fill(CGRect(x: 0, y: 0, width: pixelWidth, height: pixelHeight))
          ctx.saveGState()
          ctx.scaleBy(x: scale, y: scale)
          ctx.translateBy(x: -bounds.origin.x, y: -bounds.origin.y)
          page.draw(with: .mediaBox, to: ctx)
          ctx.restoreGState()

          if let cgImage = ctx.makeImage() {
            let recognized = try recognizeCgImage(cgImage, orientation: .up, options: options)
            lines = recognized.lines
            languages = recognized.languages
          }
        }

        let embeddedText = (page.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return [
          "pageIndex": i,
          "width": pixelWidth,
          "height": pixelHeight,
          "languages": languages,
          "lines": lines,
          "embeddedText": embeddedText
        ]
      }
      pages.append(pageDict)
    }

    return [
      "pageCount": doc.pageCount,
      "pages": pages
    ]
  }

  private static func getPdfInfo(url: URL) throws -> [String: Any] {
    return try autoreleasepool { () throws -> [String: Any] in
      guard let doc = PDFDocument(url: url) else {
        throw OcrImageException(url.lastPathComponent)
      }
      var title = ""
      if let attrs = doc.documentAttributes,
         let rawTitle = attrs[PDFDocumentAttribute.titleAttribute] as? String {
        title = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
      }
      return [
        "pageCount": doc.pageCount,
        "isEncrypted": doc.isEncrypted,
        "isLocked": doc.isLocked,
        "title": title
      ]
    }
  }

  /// Rasterizes one PDF page at `dpi` (e.g. 200 dpi) to a JPEG file at `outputUrl`.
  /// Bounded to a single page inside `autoreleasepool` so 50+ page PDFs stay memory-safe.
  private static func renderPdfPage(url: URL, pageIndex: Int, dpi: Double, outputUrl: URL) throws -> [String: Any] {
    return try autoreleasepool { () throws -> [String: Any] in
      guard let doc = PDFDocument(url: url) else {
        throw OcrImageException(url.lastPathComponent)
      }
      if doc.isLocked {
        throw PdfLockedException(url.lastPathComponent)
      }
      guard pageIndex >= 0, pageIndex < doc.pageCount, let page = doc.page(at: pageIndex) else {
        throw OcrImageException("\(url.lastPathComponent)#\(pageIndex)")
      }

      let rawBounds = page.bounds(for: .mediaBox)
      let bounds = (rawBounds.width > 0 && rawBounds.height > 0)
        ? rawBounds
        : CGRect(x: 0, y: 0, width: 595, height: 842)
      let requestedScale = max(1.0, dpi / 72.0)
      let maxDim = max(bounds.width, bounds.height)
      let scale = min(requestedScale, 2400.0 / max(1.0, maxDim))
      let pixelWidth = max(1, Int((bounds.width * scale).rounded()))
      let pixelHeight = max(1, Int((bounds.height * scale).rounded()))

      let colorSpace = CGColorSpaceCreateDeviceRGB()
      let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue
      guard let ctx = CGContext(
        data: nil,
        width: pixelWidth,
        height: pixelHeight,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: colorSpace,
        bitmapInfo: bitmapInfo
      ) else {
        throw OcrImageException(url.lastPathComponent)
      }

      ctx.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
      ctx.fill(CGRect(x: 0, y: 0, width: pixelWidth, height: pixelHeight))
      ctx.saveGState()
      ctx.scaleBy(x: scale, y: scale)
      ctx.translateBy(x: -bounds.origin.x, y: -bounds.origin.y)
      page.draw(with: .mediaBox, to: ctx)
      ctx.restoreGState()

      guard let cgImage = ctx.makeImage(),
            let dest = CGImageDestinationCreateWithURL(outputUrl as CFURL, "public.jpeg" as CFString, 1, nil) else {
        throw OcrImageException(outputUrl.lastPathComponent)
      }
      let jpegProps: [CFString: Any] = [
        kCGImageDestinationLossyCompressionQuality: 0.90
      ]
      CGImageDestinationAddImage(dest, cgImage, jpegProps as CFDictionary)
      guard CGImageDestinationFinalize(dest) else {
        try? FileManager.default.removeItem(at: outputUrl)
        throw OcrImageException(outputUrl.lastPathComponent)
      }

      return [
        "pageIndex": pageIndex,
        "width": pixelWidth,
        "height": pixelHeight,
        "uri": outputUrl.absoluteString
      ]
    }
  }

  /// Writes an encrypted PDF using PDFKit write options, deletes `sourceUrl`, and re-opens
  /// `outputUrl` to assert `isEncrypted`, `isLocked`, and `unlock(withPassword:)`.
  private static func encryptPdf(sourceUrl: URL, outputUrl: URL, password: String) throws -> [String: Any] {
    return try autoreleasepool { () throws -> [String: Any] in
      defer {
        try? FileManager.default.removeItem(at: sourceUrl)
      }
      guard !password.isEmpty else {
        throw PdfEncryptionFailedException("Empty password")
      }
      guard let doc = PDFDocument(url: sourceUrl), doc.pageCount > 0 else {
        throw OcrImageException(sourceUrl.lastPathComponent)
      }
      let writeOptions: [PDFDocumentWriteOption: Any] = [
        .userPasswordOption: password,
        .ownerPasswordOption: password
      ]
      guard doc.write(to: outputUrl, withOptions: writeOptions) else {
        try? FileManager.default.removeItem(at: outputUrl)
        throw PdfEncryptionFailedException("PDFDocument.write returned false")
      }
      guard let verifyDoc = PDFDocument(url: outputUrl),
            verifyDoc.isEncrypted,
            verifyDoc.isLocked,
            verifyDoc.unlock(withPassword: password) else {
        try? FileManager.default.removeItem(at: outputUrl)
        throw PdfEncryptionFailedException("Verification of encrypted PDF failed")
      }
      return [
        "uri": outputUrl.absoluteString,
        "isEncrypted": true,
        "isLocked": true
      ]
    }
  }

  /// Whitespace-separated tokens with the union of the boxes of their first and last character.
  private static func words(of candidate: VNRecognizedText) -> [[String: Any]] {
    let text = candidate.string
    var result: [[String: Any]] = []
    var index = text.startIndex
    while index < text.endIndex {
      while index < text.endIndex && text[index].isWhitespace {
        index = text.index(after: index)
      }
      if index >= text.endIndex {
        break
      }
      let start = index
      while index < text.endIndex && !text[index].isWhitespace {
        index = text.index(after: index)
      }
      var word: [String: Any] = ["text": String(text[start..<index])]
      let firstRange = start..<text.index(after: start)
      let lastRange = text.index(before: index)..<index
      if let first = try? candidate.boundingBox(for: firstRange),
         let last = try? candidate.boundingBox(for: lastRange) {
        word["box"] = rectArray(first.boundingBox.union(last.boundingBox))
      }
      result.append(word)
    }
    return result
  }

  private static func rectArray(_ rect: CGRect) -> [Double] {
    return [Double(rect.origin.x), Double(rect.origin.y), Double(rect.size.width), Double(rect.size.height)]
  }

  private static func imageOrientation(_ source: CGImageSource) -> CGImagePropertyOrientation {
    guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
          let raw = properties[kCGImagePropertyOrientation as String] as? UInt32,
          let orientation = CGImagePropertyOrientation(rawValue: raw) else {
      return .up
    }
    return orientation
  }

  // MARK: - StoreKit 2 On-Device Monetization

  @available(iOS 15.0, *)
  private static func fetchProducts(productIds: [String]) async throws -> [[String: Any]] {
    let products = try await Product.products(for: productIds)
    var result: [[String: Any]] = []
    for p in products {
      var item: [String: Any] = [
        "id": p.id,
        "displayName": p.displayName,
        "description": p.description,
        "displayPrice": p.displayPrice,
        "price": NSDecimalNumber(decimal: p.price).doubleValue
      ]
      if let subscription = p.subscription {
        item["period"] = "\(subscription.subscriptionPeriod.value) \(subscription.subscriptionPeriod.unit)"
      }
      result.append(item)
    }
    return result
  }

  @available(iOS 15.0, *)
  private static func purchaseProduct(productId: String) async throws -> [String: Any] {
    let products = try await Product.products(for: [productId])
    guard let product = products.first else {
      return ["status": "error", "error": "Product not found: \(productId)"]
    }
    let result = try await product.purchase()
    switch result {
    case .success(let verification):
      switch verification {
      case .verified(let transaction):
        await transaction.finish()
        return [
          "status": "success",
          "productId": transaction.productID,
          "transactionId": String(transaction.id)
        ]
      case .unverified(_, let error):
        return ["status": "unverified", "error": error.localizedDescription]
      }
    case .userCancelled:
      return ["status": "cancelled"]
    case .pending:
      return ["status": "pending"]
    @unknown default:
      return ["status": "unknown"]
    }
  }

  @available(iOS 15.0, *)
  private static func restorePurchases() async throws -> [String: Any] {
    try await AppStore.sync()
    return try await checkEntitlements()
  }

  @available(iOS 15.0, *)
  private static func checkEntitlements() async throws -> [String: Any] {
    var activeIds: [String] = []
    for await verification in Transaction.currentEntitlements {
      guard case .verified(let transaction) = verification else {
        continue
      }
      if transaction.revocationDate != nil {
        continue
      }
      if let expirationDate = transaction.expirationDate, expirationDate < Date() {
        continue
      }
      activeIds.append(transaction.productID)
    }
    return [
      "isPro": !activeIds.isEmpty,
      "activeProductIds": activeIds
    ]
  }
}
