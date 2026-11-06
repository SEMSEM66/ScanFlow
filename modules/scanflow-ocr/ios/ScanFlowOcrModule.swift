// On-device text recognition for ScanFlow with Apple Vision (VNRecognizeTextRequest).
// Runs fully offline. Boxes are normalized with the origin bottom-left (Vision);
// the JS side converts them (src/ocr/vision.ts).

import CoreGraphics
import ExpoModulesCore
import Foundation
import ImageIO
import PDFKit
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
}
