# Monetization Strategy & StoreKit 2 Architecture

**ScanFlow** positions itself as *"The uncompromising offline document scanner and PDF toolkit for iPhone. 100% on-device, no account, no ads, no watermarks, no tracking."*

This document defines the monetization architecture, framework selection, Free vs. Pro entitlement boundaries, product identifiers, and offline entitlement caching.

---

## 1. Framework Evaluation: StoreKit 2 vs. RevenueCat

| Dimension | StoreKit 2 (Direct Native) | RevenueCat / Third-Party SDKs |
| --- | --- | --- |
| **Privacy & Zero-Tracking** | **100% on-device.** Direct communication between the iPhone and Apple's App Store servers. No tracking ID, no telemetry, no device fingerprinting. | Requires network calls to third-party analytics/receipt servers. Violates the core positioning promise of ScanFlow. |
| **Cost & Dependencies** | **$0 extra fees.** Built into iOS 15+. No third-party account, API keys, or monthly SaaS subscriptions. | 1% revenue share after tier threshold; adds an external failure point. |
| **Receipt & JWS Validation** | Native JWS (JSON Web Signature) cryptographically verified on-device by iOS `StoreKit.Transaction`. | Processed on RevenueCat servers. |
| **Offline Reliability** | Cached locally by iOS (`Transaction.currentEntitlements`) + persistent device Keychain cache. Works indefinitely offline. | Relies on SDK caching with background sync. |
| **Expo Go Compatibility** | Graceful feature detection (`requireOptionalNativeModule`); sandbox mock mode for UI development. | Requires native SDK compilation; crashes in Expo Go without config plugin. |
| **Verdict** | **ADOPTED:** StoreKit 2 directly in `modules/scanflow-ocr`. | **REJECTED:** Incompatible with zero-tracking offline commitment. |

---

## 2. Free vs. Pro Entitlements Split

ScanFlow's Free tier is fully usable, ad-free, and watermark-free forever. Pro unlocks advanced PDF engineering, OCR, and document workflows.

| Feature Area | Free Tier (Forever) | ScanFlow Pro |
| --- | :---: | :---: |
| **Scanning** | Unlimited (VisionKit + fallback camera) | Unlimited |
| **Perspective Warp & Filters** | All 7 filters (Auto, Magic Color, B&W, etc.) | All 7 filters |
| **Folder Organization** | Unlimited folders & sorting | Unlimited folders & sorting |
| **Basic Export** | Multi-page PDF (A4/Letter) & JPG per page | Multi-page PDF & JPG |
| **App Lock & Security** | Face ID / Touch ID, ScanFlow PIN, app blur | Face ID / Touch ID, ScanFlow PIN, app blur |
| **30-Day Trash & Recovery** | Included | Included |
| **QR & SEPA GiroCode Scanner** | Included (raw scan + banking parsing) | Included |
| **Text Recognition (OCR)** | – | **Apple Vision OCR & Searchable PDF** |
| **Word Conversion** | – | **PDF / Scan to Word (`.docx`)** |
| **PDF Import & Rasterization** | – | **Files app & "Open in ScanFlow"** |
| **Document Merge & Split** | – | **Merge documents, extract & split pages** |
| **Password Protection** | – | **Encrypted PDF export with PDFKit** |
| **ID-Card Mode** | – | **True 1:1 scale on A4 with watermark** |
| **Signatures & Annotations** | – | **Visual signatures, highlighter, stamps** |
| **Deterministic Smart Naming** | Manual titles | **Auto-rename after OCR** |
| **Full Library Backup** | – | **Full ZIP backup & restore to Files** |
| **Batch ZIP Export** | Single exports | **Multi-document ZIP share sheet** |

---

## 3. Product Identifiers & Pricing Tiers

Target market: DACH region (Germany, Austria, Switzerland) first, followed by global English locales.

| Product ID | Type | Pricing (DACH Hypothesis) | Trial / Terms |
| --- | --- | --- | --- |
| `com.scanflow.app.pro.yearly` | Auto-Renewable Subscription | **19,99 € / year** (~1,67 € / month) | **7-day free trial**, annual auto-renew |
| `com.scanflow.app.pro.monthly` | Auto-Renewable Subscription | **2,99 € / month** | Monthly auto-renew, cancel anytime |
| `com.scanflow.app.pro.lifetime` | Non-Consumable Purchase | **49,99 € one-time** | Permanent lifetime unlock, family sharing |

*Note: Actual App Store tier pricing is configured in App Store Connect in Milestone M7.*

---

## 4. Architecture & Offline Entitlements

1. **Native StoreKit 2 Module (`ScanFlowOcrModule.swift`):**
   - Uses `StoreKit.Product` and `StoreKit.Transaction`.
   - `fetchProductsAsync(productIds: [String])`: queries Apple for price and localized title.
   - `purchaseAsync(productId: String)`: triggers system Apple Pay / Face ID purchase sheet.
   - `restorePurchasesAsync()`: calls `AppStore.sync()` and returns current verified entitlements.
   - `checkEntitlementsAsync()`: iterates `Transaction.currentEntitlements`, verifies JWS signature, and checks revocation / expiration.
2. **Offline Keychain Caching (`MonetizationService.ts`):**
   - Valid entitlements are cached in Keychain (`expo-secure-store`) with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`.
   - When offline (e.g. flight mode), ScanFlow grants Pro access based on the verified cached state without blocking user workflows.
3. **Entitlements Bridge (`src/entitlements/index.ts`):**
   - Calls `monetizationService.isProActive()`.
   - If Pro is active, all `FeatureKey` checks return `true`.
   - If Pro is inactive, Free features return `true` and Pro features return `false`.
4. **App Store Review Trigger (`ReviewService.ts`):**
   - Calls `expo-store-review` (`StoreReview.requestReview()`).
   - Triggered automatically after the **3rd successful document export** (PDF, Word, or JPG).
   - Rate-limited: prompted at most once per major app version.
