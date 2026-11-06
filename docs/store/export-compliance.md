# ScanFlow — U.S. Export Compliance & Encryption Documentation

This document provides the legal and technical justification for setting:
```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```
in ScanFlow's `Info.plist` (configured via `app.json` → `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`).

---

## 1. Regulatory Context (U.S. EAR Category 5, Part 2)

Under the United States Export Administration Regulations (EAR, 15 CFR Parts 730–774), software that incorporates encryption is regulated under Category 5, Part 2 (Information Security). However, specific categories of encryption are explicitly **exempt** from formal CCATS (Commodity Classification Automated Tracking System) filings and annual self-classification reporting.

Apple provides the `ITSAppUsesNonExemptEncryption: false` flag for applications that either:
1. Do not use encryption, or
2. Qualify for exemptions under EAR Section 740.17(b)(1) or Note 4 to Category 5, Part 2.

---

## 2. Technical Scope of Cryptography in ScanFlow

ScanFlow incorporates encryption strictly in the following capacities:

### A. Authentication & Password Hashing (Access Control)
- **Implementation:** PBKDF2-HMAC-SHA256 (`src/security/pinHash.ts`) for hashing user PIN codes.
- **Purpose:** Restricting local physical access to the application UI.
- **EAR Exemption:** **Note 4 to Category 5, Part 2** excludes cryptography that is limited to authentication, digital signatures, or the execution of copy-protected software.

### B. Standard OS Keychain Storage
- **Implementation:** `expo-secure-store` delegating to Apple's native iOS Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`).
- **Purpose:** Storing user PIN hashes, entitlement cache, and review prompt counters locally.
- **EAR Exemption:** Uses standard OS-provided cryptographic facilities of iOS.

### C. Standard PDFKit Encryption
- **Implementation:** Native Apple `PDFKit` `PDFDocument.write(to:withOptions:)` using standard Apple OS libraries (`modules/scanflow-ocr/ios/ScanFlowOcrModule.swift`).
- **Purpose:** User-optional password protection for exported PDF files.
- **EAR Exemption:** Operating system provided encryption and standard document packaging.

### D. Zero Network Cryptography / Zero Proprietary Ciphers
- ScanFlow contains **no proprietary or non-standard ciphers**.
- ScanFlow makes **zero network requests** (no SSL/TLS tunnels, no custom VPN, no remote data transfer).

---

## 3. Exemption Justification Summary

ScanFlow qualifies for exemption under:
- **15 CFR § 740.17(b)(1)**: Mass market software utilizing standard encryption algorithms provided by the underlying operating system (iOS).
- **Note 4 to Category 5, Part 2**: Cryptography limited to local access control and authentication.

Therefore, ScanFlow does **not** use non-exempt encryption. Setting `ITSAppUsesNonExemptEncryption: false` eliminates repetitive export compliance prompts during TestFlight and App Store upload builds in App Store Connect.
