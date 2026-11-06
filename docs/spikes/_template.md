# Spike: <Title>

- **Status:** `proposed` | `in-progress` | `adopt` | `defer`
- **Milestone:** M<X> (<version>)
- **Date:** YYYY-MM-DD
- **Module / Target:** `modules/scanflow-ocr` | `app.json` | `<package>`

---

## 1. Goal & Hypothesis
- **Goal:** What user-facing capability does this native addition enable?
- **Hypothesis:** Which iOS framework / Expo API solves this cleanly on-device without third-party cloud dependencies or heavy third-party native SDKs?

## 2. Minimal Native Surface
- **Swift / Objective-C API:** Exact function signatures, input types, and return payloads.
- **Threading & Memory:** Which queue does it run on? How is peak memory bounded (e.g., `autoreleasepool`, page-by-page streaming, max pixel dimension)?
- **Info.plist / Entitlements / Podspec changes:** Any new keys or system frameworks required.

## 3. Expo Go Fallback Behavior
- How is availability detected in JavaScript (`requireOptionalNativeModule` / `ocrService.available`)?
- What happens when a user triggers this feature in **Expo Go**? (Must never crash; must either hide the control or show a clear localized explanation.)

## 4. Failure Modes & Safeguards
- What happens on corrupted input, password-locked files, out-of-memory conditions, cancelled operations, or missing permissions?
- How are temporary files cleaned up on both success and failure?

## 5. Verification & CI Evidence
- **Unit tests (Node / Jest):** What pure logic or mocked service behavior is covered by Jest?
- **CI build proof:** Workflow run ID / log verification confirming `expo prebuild`, `pod install`, and `xcodebuild` Release compilation succeed.
- **Device verification (`STOP` gate):** Numbered physical-iPhone checks required before marking device behavior verified.

## 6. Verdict
- **`adopt` / `defer`:** Summary of why this approach is adopted for the milestone or deferred to a later version.
