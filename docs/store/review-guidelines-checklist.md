# ScanFlow — Apple App Review Guidelines Compliance Checklist

This document details ScanFlow's compliance audit against the **Apple App Store Review Guidelines** ahead of TestFlight and App Store submission for `v2.0.0-rc`.

---

## 1. Guideline 2.1 — Performance: App Completeness
- [x] **No placeholder text or UI:** All screens, buttons, and settings are fully localized in German and English without "Lorem ipsum" or dummy strings (`__tests__/i18n.test.ts` – `verified by tests`).
- [x] **No test-only or debug elements visible in production:** Debug sandbox toggle in Settings is hidden unless specifically running in DEV mode or clearly isolated (`verified by tests`).
- [x] **No crashes on launch or core flows:** Full Jest test suite (162 tests) covers database migrations, imaging pipeline, entitlements, OCR search, and backup manifests (`verified by tests`).
- [x] **Graceful degradation:** Local native features (`ScanFlowOcrModule`) safely detect runtime availability via `requireOptionalNativeModule` (`ocrService.available`). The app never crashes in Expo Go or when native hardware (e.g., Apple Vision OCR) is unavailable (`verified by tests`).

---

## 2. Guideline 2.3 — Accurate Metadata
- [x] **Zero competitor trademark references:** Store title, subtitle, keywords, and descriptions in `docs/store/app-store-metadata.md` contain **no mentions** of third-party trademarks (e.g., CamScanner, Adobe Scan, Genius Scan, Microsoft Lens).
- [x] **Honest feature descriptions:**
  - Described as **visual signatures** (*Visuelle Unterschriften / Visual Signatures*), explicitly stating they are not qualified electronic signatures (QES / eIDAS).
  - Stated as **100% on-device and offline** without server dependencies.
  - Stated as **ad-free and tracking-free** without exception.
- [x] **Reviewer Demo Guidance:** `docs/store/review-notes.md` provides clear instructions, sample workflows, and explanations of offline functionality for Apple App Reviewers.

---

## 3. Guideline 3.1.1 — In-App Purchase
- [x] **Native StoreKit 2 implementation:** Uses native iOS StoreKit 2 APIs (`modules/scanflow-ocr/ios/ScanFlowOcrModule.swift`) for all purchases (`Product.purchase()`, `Transaction.currentEntitlements`, `AppStore.sync()`).
- [x] **No alternative payment systems:** No external checkout links, Stripe, PayPal, or third-party web forms.
- [x] **Prominent Restore Purchases button:** Clearly visible on the Paywall modal (`PaywallModal.tsx`) and in *Einstellungen → Pro-Abonnement*, functioning offline and syncing with the App Store.
- [x] **Unrestricted core utilities:** Free tier retains full document scanning, perspective crop, all Skia scan filters, multi-page creation, folder organization, 30-day Trash, QR/GiroCode reader, and standard PDF/JPG export.

---

## 4. Guideline 3.1.2 — Subscriptions
- [x] **Clear pricing & terms disclosure:**
  - Exact renewal pricing, billing period, and trial length (e.g., 7 days free, then 19,99 €/year) are clearly displayed before purchase.
  - Auto-renewal terms are explicitly stated on the paywall.
- [x] **Direct links to Terms of Use & Privacy Policy:**
  - Paywall modal includes direct clickable buttons to view the Terms of Use (EULA) and Privacy Policy.
  - Settings screen provides a dedicated *Rechtliches* card with in-app native readers for Privacy, Terms, and Open Source Licenses.

---

## 5. Guideline 5.1.1 — Data Collection and Storage (Privacy)
- [x] **Localized Purpose Strings (`Info.plist`):**
  - `NSCameraUsageDescription`: Clear explanation in German and English that the camera is used only for scanning documents on-device.
  - `NSPhotoLibraryUsageDescription`: Clear explanation that the library is accessed only to import existing photos or documents.
  - `NSFaceIDUsageDescription`: Clear explanation that Face ID is used strictly to protect local access to the user's documents via App Lock.
- [x] **Zero Server Data Transmission:** No documents, photos, text, or metrics leave the user's iPhone (`npm run check:network` passes across all 121 project files).
- [x] **No Account Requirement:** ScanFlow requires no user registration, login, email address, or third-party authentication.

---

## 6. Guideline 5.1.2 — Data Use and Sharing (Privacy Manifest)
- [x] **Apple Privacy Manifest (`PrivacyInfo.xcprivacy`):** Configured in `app.json` → `ios.privacyManifests`:
  - `NSPrivacyTracking`: `false`.
  - `NSPrivacyTrackingDomains`: `[]` (empty list).
  - `NSPrivacyCollectedDataTypes`: `[]` (empty list — zero data collected).
  - Required Reason APIs declared with official Apple reason codes:
    - `NSPrivacyAccessedAPITypeUserDefaults`: `CA92.1` (storing app settings locally).
    - `NSPrivacyAccessedAPITypeFileTimestamp`: `C617.1` (managing local file modification timestamps).
    - `NSPrivacyAccessedAPITypeDiskSpace`: `E174.1` (preventing disk exhaustion during multi-page scans).
    - `NSPrivacyAccessedAPITypeSystemBootTime`: `35F9.1` (measuring local app lock timeout durations).
