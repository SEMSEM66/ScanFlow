# ScanFlow — Release & Distribution Guide (v2.0.0-rc)

This guide provides end-to-end instructions for building, signing, and releasing **ScanFlow** to **Apple TestFlight** and the **Apple App Store**.

---

## 1. Release Architecture Comparison: EAS vs. GitHub Actions

| Factor | Path A: Expo Application Services (EAS) *(Recommended)* | Path B: GitHub Actions macOS Runner |
| :--- | :--- | :--- |
| **Setup Complexity** | **Very Low** (`eas build -p ios --auto-submit`) | **High** (requires Fastlane / manual keychain scripting) |
| **Certificate Management** | **Automatic**: EAS generates and rotates Distribution Certificates & Profiles | **Manual**: Must export `.p12`, provisioning profiles, and store as GitHub Secrets |
| **Cost** | **Free Tier:** 30 iOS builds / month. Paid plan: \$29 / mo (priority queue) | Uses GitHub macOS minutes (macos-15 is billed at 10× minute multiplier) |
| **App Store Submission** | **One command:** `eas submit -p ios --latest` automatically uploads to TestFlight | Requires App Store Connect API Key (`altool` / Fastlane `pilot`) |
| **Suitability for Windows Devs** | **Ideal**: Cloud-native, zero macOS hardware or local simulator required | Cloud-native via GitHub, but complex to debug signing errors |
| **Recommendation** | **PRIMARY RECOMMENDED PATH** for TestFlight & App Store submission. | **SECONDARY / FALLBACK** (currently used for unsigned sideloadable IPAs). |

---

## 2. Prerequisites & Apple Developer Account Setup

To publish on TestFlight and the App Store, you need:
1. **Apple Developer Program Enrollment** ($99 USD / year): [developer.apple.com](https://developer.apple.com).
2. **App Store Connect Account**: [appstoreconnect.apple.com](https://appstoreconnect.apple.com).
3. **App Identifier Registered**:
   - Bundle ID: `com.scanflow.app` (configured in `app.json`).
   - Capabilities enabled: **In-App Purchase**.
4. **App Store Connect App Record**:
   - Create a new App with Name: **ScanFlow - Offline PDF Scanner** (or desired title).
   - Primary Language: **German** (or English).
   - Bundle ID: Select `com.scanflow.app`.
   - SKU: `SCANFLOW_IOS_01`.

---

## 3. Configuring In-App Purchases & Subscriptions

Before submitting the app or testing paywalls, configure the 3 In-App Purchase products in App Store Connect under **Monetization → Subscriptions / In-App Purchases**:

### A. Subscription Group: `ScanFlow Pro Access`
1. **Yearly Subscription with 7-Day Free Trial:**
   - **Product ID:** `com.scanflow.app.pro.yearly`
   - **Reference Name:** ScanFlow Pro Jährlich
   - **Price Tier:** 19,99 € / $19.99 (Tier 20)
   - **Introductory Offer:** Free Trial (7 Days)
2. **Monthly Subscription:**
   - **Product ID:** `com.scanflow.app.pro.monthly`
   - **Reference Name:** ScanFlow Pro Monatlich
   - **Price Tier:** 2,99 € / $2.99 (Tier 3)

### B. Non-Consumable (One-Time Purchase):
1. **Lifetime Pro License:**
   - **Product ID:** `com.scanflow.app.pro.lifetime`
   - **Reference Name:** ScanFlow Pro Lifetime
   - **Price Tier:** 49,99 € / $49.99 (Tier 50)

> [!IMPORTANT]
> The product IDs in App Store Connect must **strictly match** the product IDs defined in `src/entitlements/index.ts` (`PRO_PRODUCT_IDS`).

---

## 4. Path A: Releasing via EAS (Step-by-Step)

### Step 1: Install & Authenticate EAS CLI
On your development machine (Windows PowerShell):
```powershell
npm install -g eas-cli
eas login
```

### Step 2: Configure Project & Credentials
Link your repository to your Expo account:
```powershell
eas init --id <your-expo-project-id>
```
EAS will inspect `app.json` and configure `eas.json`.

### Step 3: Run Cloud Production Build
Trigger a signed release build on EAS servers:
```powershell
eas build --platform ios --profile production
```
- EAS will prompt: *"Do you want EAS to manage your Apple credentials?"* → Choose **Yes**.
- Log in with your Apple Developer Account when prompted.
- EAS automatically creates the iOS Distribution Certificate, App ID, and App Store Provisioning Profile.
- The build completes in ~12–15 minutes and generates an App Store signed `.ipa`.

### Step 4: Submit to TestFlight
Once built, submit directly to TestFlight:
```powershell
eas submit --platform ios --latest
```
Alternatively, combine build and submission into a single command:
```powershell
eas build --platform ios --profile production --auto-submit
```

---

## 5. Path B: Releasing via GitHub Actions

ScanFlow currently uses GitHub Actions (`.github/workflows/build-ipa.yml`) for building unsigned sideloadable IPAs on `macos-15`. To build and submit an App Store signed IPA via GitHub Actions, the following secrets must be added to your GitHub repository settings (**Settings → Secrets and variables → Actions**):

### Required Repository Secrets:
| Secret Name | Description |
| :--- | :--- |
| `APPLE_CERTIFICATE_BASE64` | Base64-encoded `.p12` Distribution Certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` certificate |
| `APPLE_PROVISIONING_PROFILE_BASE64` | Base64-encoded `.mobileprovision` App Store profile |
| `APP_STORE_CONNECT_API_KEY_KEY_ID` | Key ID from App Store Connect API Keys |
| `APP_STORE_CONNECT_API_KEY_ISSUER_ID` | Issuer ID from App Store Connect |
| `APP_STORE_CONNECT_API_KEY_BASE64` | Base64-encoded `AuthKey_<KeyID>.p8` private key |

### Workflow Configuration Template:
See `.github/workflows/appstore-release.yml.disabled` for the ready-to-enable workflow that imports the certificate into a temporary keychain, signs the archive with `xcodebuild -exportArchive`, and uploads to TestFlight via `xcrun altool`.

---

## 6. TestFlight Distribution & Verification

1. Once uploaded, open **App Store Connect → Apps → ScanFlow → TestFlight**.
2. Processing takes ~5–10 minutes while Apple scans the binary.
3. Once processed:
   - If prompted for **Export Compliance**, select **No** (ScanFlow qualifies for standard exemptions; documented in `docs/store/export-compliance.md`).
4. **Internal Testing:** Add yourself and your test devices under *Internal Groups*. TestFlight sends an email / notification immediately.
5. Install ScanFlow via the TestFlight app on your physical iPhone.
6. Verify:
   - Native Apple Vision OCR & PDFKit rasterization
   - StoreKit 2 Sandbox purchase flow (using a Sandbox Apple ID)
   - App Lock with Face ID & PIN
   - 30-Day Trash, Smart Naming, and Backup & Restore

---

## 7. App Store Submission Checklist

When ready to submit for public App Store review:
1. **Metadata & Descriptions:**
   - Copy German and English descriptions, keywords, and URLs from `docs/store/app-store-metadata.md`.
2. **Screenshots:**
   - Upload screenshots following the dimensions and layouts specified in `tools/store-screenshots/README.md`.
3. **App Privacy:**
   - Answer the App Store Connect Privacy Nutrition Label questions according to `docs/store/privacy-nutrition-label.md` (**Data Not Collected**).
4. **Review Notes:**
   - Paste the contents of `docs/store/review-notes.md` into the *Review Notes (Prüfhinweise)* field in App Store Connect.
5. **Age Rating:**
   - Complete the Age Rating questionnaire using the answers in `docs/store/age-rating.md` (**4+**).
6. **Submit for Review:**
   - Click **Add for Review** → **Submit to App Review**. Apple typically completes review within 24–48 hours.
