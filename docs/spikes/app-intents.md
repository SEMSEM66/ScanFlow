# Spike: App Intents & Shortcuts (iOS 16+)

- **Status:** `defer` (Deferred to v2.1)
- **Milestone:** M4 (v1.12.0)
- **Date:** 2026-11-06
- **Module / Target:** `modules/scanflow-ocr` / Config Plugin

---

## 1. Goal & Hypothesis
- **Goal:** Enable users to trigger ScanFlow directly via Siri voice commands, the iOS Shortcuts app, and the iPhone 15/16 Action Button ("Dokument scannen", "In ScanFlow suchen").
- **Hypothesis:** Implement the modern Swift `AppIntents` framework (`AppIntent`, `AppShortcutsProvider`) inside an Expo config plugin or local module with `openAppWhenRun = true`, dispatching deep links (`scanflow://scan`, `scanflow://search`).

## 2. Minimal Native Surface
- **Swift API:**
  ```swift
  import AppIntents

  @available(iOS 16.0, *)
  struct ScanDocumentIntent: AppIntent {
      static var title: LocalizedStringResource = "Dokument scannen"
      static var openAppWhenRun: Bool = true

      @MainActor
      func perform() async throws -> some IntentResult {
          return .result(opensIntent: OpenURLIntent(URL(string: "scanflow://scan")!))
      }
  }

  @available(iOS 16.0, *)
  struct ScanFlowShortcuts: AppShortcutsProvider {
      static var appShortcuts: [AppShortcut] {
          AppShortcut(
              intent: ScanDocumentIntent(),
              phrases: ["Scanne Dokument mit \(.applicationName)", "Scan with \(.applicationName)"],
              shortTitle: "Dokument scannen",
              systemImageName: "doc.viewfinder"
          )
      }
  }
  ```
- **Threading & Memory:** Execution opens the main app process directly; zero additional background memory footprint.
- **Info.plist:** Requires custom URL scheme `scanflow://` registered in `app.json`.

## 3. Expo Go Fallback Behavior
- `AppIntents` require compile-time metadata generation by Xcode (`appintentsmetadataprocessor`). In Expo Go, dynamic custom AppIntents are unavailable.
- Deep links via `expo-linking` (`scanflow://`) work in both Expo Go and standalone builds.

## 4. Failure Modes & Safeguards
- **App Lock bypass vulnerability:** If an intent opens the app directly into `/scan` or `/search`, the app lock (`AppLockOverlay`) must guarantee fail-closed behavior. If a PIN is configured, the lock screen overlays the window before the camera or search results become accessible.
- **Background execution constraints:** Shortcuts running headlessly without opening the app cannot access the camera hardware (`AVCaptureDeviceInput` requires active foreground app state).

## 5. Verification & CI Evidence
- **Build Risk:** Xcode 16 / macOS-15 CI builds with unsigned development profiles sometimes fail during the `appintentsmetadataprocessor` phase if Swift symbols are not linked into the main app target.
- **Physical Device Required:** Siri phrases and Action Button triggers cannot be verified without physical iPhone testing by the user.

## 6. Verdict
- **`defer` to v2.1:**
  1. Milestone M4 already ships **Home Screen Quick Actions** (`expo-quick-actions`) for "Dokument scannen" and "Suchen", covering 90% of user quick-entry needs without risky Xcode target modifications.
  2. Preserves precious macOS CI minutes for the single `v2.0.0-rc` build.
  3. Re-evaluate for v2.1 once TestFlight production certificates and App Store Connect signing are active.
