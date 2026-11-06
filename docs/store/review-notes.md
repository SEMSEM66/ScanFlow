# Apple App Review Notes

**App:** ScanFlow  
**Bundle ID:** `com.scanflow.app`  
**Version:** 2.0.0 (Build 1)

---

## 1. Demo & Testing Account Information

- **No login / account required:** ScanFlow is a 100% offline document scanner and PDF utility. The app does not require, support, or offer user registration or accounts.
- **In-App Purchases / StoreKit 2:** StoreKit 2 products are configured in App Store Connect. Apple Sandbox testing accounts can be used to purchase and restore ScanFlow Pro subscriptions.
- **Expo Go / Sandbox Simulation:** In settings (*Einstellungen*), a developer toggle is provided to simulate Pro access when testing on builds without active StoreKit sandbox environments.

---

## 2. Key Reviewer Verification Paths

### A. Document Scanner & Capture
1. Tap the central **Scan** tab or **+** button in the Library.
2. The native iOS Document Camera (`VNDocumentCameraViewController`) opens with live edge detection and auto-capture.
3. Capture a document and tap **Save** (*Sichern*).
4. The document opens in the viewer with the default "Auto" document filter applied.

### B. Offline Text Recognition & Searchable PDF (Pro)
1. After scanning a document, Apple Vision OCR runs in the background on the device.
2. Tap the `Aa` button in the document toolbar to review recognized text or copy lines.
3. Export as PDF (*Teilen*) → the generated PDF contains an invisible text layer that can be searched or selected in the Files app or Safari.

### C. ID-Card Mode on One A4 Page (Pro)
1. Navigate to the **Werkzeuge** (Tools) tab → tap **Ausweis-Modus**.
2. Follow guided capture for front and back sides.
3. Enter an optional purpose note (e.g., *"Verification Test"*).
4. Tap **A4-Ausweisseite erstellen** → both sides appear centered at true physical scale (85.6 × 54 mm) on an A4 page with the diagonal watermark.

### D. Security & App Lock
1. Open **Einstellungen** (Settings) → enable **App-Sperre**.
2. Test Face ID / Touch ID or set a 6-digit ScanFlow PIN.
3. Lock the phone or send the app to the background → reopening requires Face ID or PIN to view content.

---

## 3. Hardware & Permission Explanations
- **Camera (`NSCameraUsageDescription`):** Used strictly for taking photos of paper documents within the app.
- **Photo Library (`NSPhotoLibraryUsageDescription`):** Used only when the user voluntarily taps *Aus Fotomediathek importieren* to convert an existing image into a document page.
- **Face ID (`NSFaceIDUsageDescription`):** Used only to unlock the app when the user voluntarily enables the App Lock setting.

---

## 4. Zero Data Collection Confirmation
As confirmed in our App Privacy nutrition label, ScanFlow collects **no user data, no analytics, no identifiers, and no telemetry**. All processing is executed strictly on the physical device.
