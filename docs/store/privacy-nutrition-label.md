# App Store Privacy Nutrition Label Guide

When submitting ScanFlow to App Store Connect, configure the **App Privacy** section as follows:

---

## 1. Primary Declaration: "Data Not Collected"

Select: **"No, we do not collect data from this app"**

### Detailed Category Check

| Category | Collected? | Rationale |
| --- | :---: | --- |
| **Contact Info** (Name, Email, Phone, Address) | **NO** | No account creation, no registration, no contact sync. |
| **Health & Fitness** | **NO** | Not applicable. |
| **Financial Info** (Payment info, credit score) | **NO** | Subscriptions and purchases are processed directly by Apple StoreKit 2. ScanFlow receives only on-device verified transaction tokens. |
| **Location** (Precise or Coarse) | **NO** | No location APIs used. |
| **Sensitive Info** | **NO** | Not applicable. |
| **Contacts** | **NO** | No address book access. |
| **User Content** (Emails, Photos, Documents, Audio) | **NO** | Documents and photos are stored strictly inside the sandboxed on-device SQLite database and file system. They are never uploaded or transmitted off the device. |
| **Browsing History** | **NO** | Not applicable. |
| **Search History** | **NO** | Search is executed locally in SQLite. Query tokens never leave the device. |
| **Identifiers** (User ID, Device ID) | **NO** | No advertising ID (IDFA), no vendor ID (IDFV) collected or transmitted. |
| **Usage Data** (Product interaction, advertising data) | **NO** | Zero analytics SDKs. No telemetry. |
| **Diagnostics** (Crash data, performance data) | **NO** | Zero third-party crash reporting tools (no Sentry, no Crashlytics). |

---

## 2. Tracking Declaration

Question: *"Do you or your third-party partners use data from this app to track people?"*  
Answer: **NO**

---

## 3. Privacy Manifest Verification (`PrivacyInfo.xcprivacy`)

Configured automatically via `app.json` (`ios.privacyManifests`):
- `NSPrivacyTracking`: `false`
- `NSPrivacyTrackingDomains`: `[]`
- `NSPrivacyCollectedDataTypes`: `[]`
- `NSPrivacyAccessedAPITypes`:
  - `NSPrivacyAccessedAPITypeUserDefaults` (`CA92.1` – app preferences)
  - `NSPrivacyAccessedAPITypeFileTimestamp` (`C617.1` – document timestamps inside container)
  - `NSPrivacyAccessedAPITypeDiskSpace` (`E174.1` – storage indicator)
  - `NSPrivacyAccessedAPITypeSystemBootTime` (`35F9.1` – lock timeout measurement)
