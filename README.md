# ScanFlow 📄✨

**ScanFlow** is a modern, privacy-first, offline-only iOS document scanner app built with **Expo**, **React Native**, **TypeScript (Strict)**, and **expo-router**.

Designed as a clean, ad-free alternative to apps like CamScanner, ScanFlow processes and stores all documents locally on your device with zero telemetry, zero accounts, and zero watermarks.

---

## 📱 Features (Phase 1 MVP)

- **📚 Document Library:** 2-column grid and list views, instant search, folder-based categorization, date and page count badges.
- **📷 Camera Scanner:** Multi-page burst capture, flash controls, framing guides, and gallery import.
- **✂️ Document Cropping:** Interactive 4-corner crop with precise handle positioning.
- **🎨 Image Filters:** *Original*, *Auto-enhance*, *Schwarzweiß (B&W)*, *Graustufen (Grayscale)*, and *Magic Color*, plus page rotation.
- **📑 Multi-Page Editor:** Reorder pages, retake individual pages, add new pages, and rename documents.
- **📤 Export & Sharing:** Crisp multi-page A4 PDF generation with adjustable quality (Niedrig, Mittel, Hoch), JPG page export, and native iOS share sheet.
- **🔒 Privacy & Security:** Face ID / Touch ID / Passcode app lock using iOS Secure Enclave biometrics (`expo-local-authentication` + `expo-secure-store`).
- **🌐 Localization:** Full German (default) and English support via `expo-localization`.
- **🌙 Theming:** Tailored iOS design with Warm Ivory/Off-White light mode and OLED dark mode.

---

## 🛠️ Tech Stack & Constraints

- **Framework:** Expo (Latest Stable SDK) with `expo-router`
- **Language:** TypeScript (`"strict": true`)
- **Storage:** `expo-sqlite` (relational metadata) + `expo-file-system` (document scans & PDFs)
- **Export:** `expo-print` + `expo-sharing`
- **Camera & Photos:** `expo-camera` + `expo-image-picker`
- **Security:** `expo-local-authentication` + `expo-secure-store`
- **Host OS:** Windows (PowerShell)
- **Target Device:** Real iPhone running **Expo Go**

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ or v20+)
- npm
- iPhone with the **Expo Go** app installed from the App Store

### Installation
```powershell
# Install project dependencies
npm install
```

### Running on iPhone via Expo Go
```powershell
# Start Metro bundler (LAN mode)
npx expo start

# If your iPhone cannot connect over local Wi-Fi, run with tunnel:
npx expo start --tunnel
```

Scan the printed QR code with your iPhone's **Camera** app to open ScanFlow in **Expo Go**.

---

## 📁 Project Structure

```text
ScanFlow/
├── app/                  # expo-router file-based routing
│   ├── (tabs)/           # Main navigation tabs (Dokumente, Werkzeuge, Einstellungen)
│   ├── document/         # Document details, page viewer, editor
│   ├── scan/             # Camera scanning screen
│   ├── crop/             # Interactive crop screen
│   └── _layout.tsx       # Root layout, theme & security provider
├── src/
│   ├── components/       # Reusable UI components matching /design
│   ├── db/               # SQLite schema, migrations, and database client
│   ├── services/         # Storage, PDF export, filter processing, auth services
│   ├── hooks/            # Custom React hooks (documents, camera, permissions)
│   ├── i18n/             # Translations (German & English)
│   ├── theme/            # Design tokens (colors, typography, spacing, radius)
│   └── types/            # TypeScript interfaces & domain types
├── design/               # UI design screenshots
├── docs/                 # ROADMAP.md and project documentation
├── AGENTS.md             # Persistent agent development rules
└── CHANGELOG.md          # Release history
```

---

## 📜 License
Private & Proprietary.
