# Spike: Lock Screen & Control Center Widget (WidgetKit)

- **Status:** `defer` (Deferred to v2.1)
- **Milestone:** M4 (v1.12.0)
- **Date:** 2026-11-06
- **Module / Target:** WidgetKit Extension Target (`targets/scanflow-widget`) / Config Plugin

---

## 1. Goal & Hypothesis
- **Goal:** Provide a circular or rectangular Lock Screen widget and iOS 18 Control Center toggle button that launches ScanFlow straight into the document scanner.
- **Hypothesis:** Implement a lightweight SwiftUI `Widget` using `WidgetKit` with a deep-link URL `scanflow://scan`.

## 2. Minimal Native Surface
- **Swift / SwiftUI API:**
  ```swift
  import WidgetKit
  import SwiftUI

  struct ScanFlowLockScreenWidget: Widget {
      let kind: String = "ScanFlowLockScreenWidget"

      var body: some WidgetConfiguration {
          StaticConfiguration(kind: kind, provider: SimpleProvider()) { entry in
              Link(destination: URL(string: "scanflow://scan")!) {
                  Image(systemName: "doc.viewfinder")
                      .font(.system(size: 20, weight: .semibold))
              }
              .widgetURL(URL(string: "scanflow://scan"))
          }
          .configurationDisplayName("Dokument scannen")
          .description("Öffnet sofort den ScanFlow-Dokumentenscanner.")
          .supportedFamilies([.accessoryCircular, .accessoryInline])
      }
  }
  ```
- **Target Architecture:** Requires a distinct Xcode target (`com.scanflow.app.widget`) embedded into the main application wrapper (`PlugIns/`).
- **Memory & Storage:** Widget memory limit is strictly bounded to 30 MB by iOS. Deep-linking transfers execution to the main app, using negligible widget resources.

## 3. Expo Go Fallback Behavior
- WidgetKit extensions cannot be hosted or tested in Expo Go. The widget gallery on device will not display ScanFlow widgets during Expo Go testing.

## 4. Failure Modes & Safeguards
- **Sideloading & Unsigned IPA failure:**
  - An iOS app extension requires its own bundle identifier and its own provisioning profile matching the team ID.
  - In our GitHub Actions unsigned IPA workflow (`.github/workflows/build-ipa.yml`), apps are packaged without Apple Developer certificates. When sideloading an unsigned IPA containing app extensions via AltStore, Sideloadly, or TrollStore, signing multiple embedded extension targets frequently fails with `MIInstallerErrorDomain Code 13` or fails verification on non-jailbroken iPhones.
- **Prebuild fragility:** Adding second Xcode targets via Expo config plugins requires heavy manipulation of the `project.pbxproj` file, which is prone to breaking during Expo SDK upgrades.

## 5. Verification & CI Evidence
- **Build Risk:** High. Extension compilation in CI requires configuring target build settings, schemes, and codesign identities.
- **Verification Honesty:** Cannot be verified on Windows; requires an active Apple Developer Program team for valid extension provisioning profiles.

## 6. Verdict
- **`defer` to v2.1:**
  1. The signing and bundle ID requirements of secondary app extensions are fundamentally incompatible with unsigned sideloaded development IPAs.
  2. Home Screen Quick Actions (`expo-quick-actions`) already provide instant access without requiring an app extension target.
  3. Defer until official Apple Developer account signing and TestFlight deployment (Milestone M7) are configured.
