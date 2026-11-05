// On-device text recognition for ScanFlow with Apple Vision (VNRecognizeTextRequest).
// Runs fully offline. Boxes are normalized with the origin bottom-left (Vision);
// the JS side converts them (src/ocr/vision.ts).

import CoreGraphics
import ExpoModulesCore
import Foundation
import ImageIO
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
  }

  private static func supportedLanguages() throws -> [String] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    return try request.supportedRecognitionLanguages()
  }

  private static func recognize(url: URL, options: RecognizeOptions) throws -> [String: Any] {
    return try autoreleasepool { () throws -> [String: Any] in
      guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
            let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw OcrImageException(url.lastPathComponent)
      }
      let orientation = imageOrientation(source)

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
        "languages": languages,
        "lines": lines
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
}
