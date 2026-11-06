# Releasing ScanFlow & CI Budget Guide

This document explains how ScanFlow builds iOS IPA packages from a Windows machine without a Mac, how GitHub Actions macOS minutes are budgeted, how to switch between branch-triggered and tag-only builds, and the preparation path for signed TestFlight / App Store builds (Milestone M7).

---

## 1. GitHub Actions macOS Budget & Expected CI Cost per Release

ScanFlow compiles its iOS binary and the local Swift module (`modules/scanflow-ocr`) on GitHub Actions using `macos-15` runners (`.github/workflows/build-ipa.yml`).

### Expected CI Minutes per Build
- **Wall-clock time per run:** ~11 to 15 minutes (`npm ci` with cache + `expo prebuild` + CocoaPods + `xcodebuild` Release ARM64 + `.ipa` packaging + GitHub Release upload).
- **GitHub Actions billing / quota impact:**
  - **Public repository:** GitHub Actions is free with standard runners (no minute cap), though concurrent macOS jobs are throttled.
  - **Private repository (GitHub Free = 2,000 min/month, $0 spending limit):** GitHub applies a **10× multiplier** to `macos-15` runners. One 13-minute wall-clock macOS build consumes **~130 billable minutes** (allowing ~15 macOS builds per month on the free tier).

### Built-In Minute Savers in `.github/workflows/build-ipa.yml`
1. **Feature-branch workflow (`feat/<milestone>`):**
   - Pushes to `feat/*` branches trigger **0 workflows**.
   - Only after a milestone passes all local quality gates (`tsc`, `lint`, `check:corners`, `jest`) and is fast-forward merged into `main` is a single push made → **exactly 1 IPA build per milestone**.
2. **`concurrency` (`cancel-in-progress: true`):**
   - If two pushes happen in quick succession on the same ref, the older in-progress macOS build is cancelled immediately instead of burning another 13 minutes.
3. **`paths-ignore` (`docs/**`, `*.md`, `design/**`):**
   - Documentation-only commits on `main` (e.g. updating `docs/ROADMAP.md`, `README.md`, or `docs/store/`) never trigger a macOS build.
4. **Node/npm caching (`cache: 'npm'`):**
   - Caches `~/.npm` across runs so dependency installation is faster and more reliable.

---

## 2. Optional: Tag-Only Build Trigger (`v*`)

By default, `.github/workflows/build-ipa.yml` runs on pushes to `main` (excluding docs-only changes) and on `v*` tags.

If you prefer that pushing to `main` **never** builds automatically, and an IPA build is triggered **only** when you push an explicit version tag (e.g. `git tag v1.9.0` followed by `git push origin v1.9.0`), change the `on:` block at the top of `.github/workflows/build-ipa.yml` to:

```yaml
on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
```

With tag-only builds:
1. You can push to `main` as often as you want with **0 macOS minutes used**.
2. When ready for an IPA build, run in PowerShell:
   ```powershell
   git tag v1.9.0
   git push origin main
   git push origin v1.9.0
   ```
   Or trigger a one-off build manually in the GitHub UI (**Actions → Build iOS IPA & Publish Release → Run workflow**).

---

## 3. Version Bump Checklist (Every Release)

Before merging a milestone branch into `main` for a release:
1. Bump `"version"` in `package.json`.
2. Bump `"expo.version"` in `app.json`.
3. Bump both root `"version"` entries in `package-lock.json` (lines 3 and 9).
4. Add a `## [x.y.z] - YYYY-MM-DD` section at the top of `CHANGELOG.md` (the workflow extracts this exact section for the GitHub Release notes).

---

## 4. TestFlight & App Store Submission Pipeline (M7 Preview)

*(Full signed-pipeline configuration and step-by-step App Store Connect guide will be completed in Milestone M7. Summary of the two options from Windows without a Mac:)*

| Criterion | Option A: EAS Build + EAS Submit | Option B: GitHub Actions macOS Signing + `xcrun altool` |
| --- | --- | --- |
| **How it works** | `npx eas-cli build --platform ios --profile production --auto-submit` runs `expo prebuild` (including `modules/scanflow-ocr`) on Expo's cloud macOS builders and submits via App Store Connect API Key. | Existing `.github/workflows/build-ipa.yml` imports an Apple Distribution `.p12` certificate + provisioning profile from GitHub Secrets into a temporary Keychain, archives with `xcodebuild archive -exportArchive`, and uploads via `xcrun altool` / `Notary` API Key. |
| **Credential management from Windows** | Automatic: `eas credentials` generates the Distribution Certificate and Provisioning Profile directly via your App Store Connect API Key—no Mac Keychain Assistant needed. | Requires generating the CSR + `.p12` via OpenSSL on Windows and manually creating the App Store Provisioning Profile in the Apple Developer Portal. |
| **Free quota** | EAS Free Plan includes 30 builds/month (up to 15 iOS builds/month, queued). | Uses your GitHub Actions runner minutes (~15 min wall-clock per build). |

### User Actions Required Before First TestFlight Build (Never Block Development)
1. **Apple Developer Program Enrollment** (individual or organization, €99 / $99 per year at `developer.apple.com`).
2. **EU Digital Services Act (DSA) Trader Status:** In App Store Connect → *Business*, declare trader status (requires a public address, email, and phone number on the European App Store; consider a PO Box / business address if you do not want your home address public).
3. **Final App Name & Bundle ID (`com.scanflow.app` or custom):** Must be fixed before the first TestFlight upload, because Apple binds a Bundle ID permanently to an App Store Connect app record.
4. **App Store Connect API Key (`.p8`):** Generate under *App Store Connect → Users and Access → Integrations → App Store Connect API* (Role: *Admin* or *App Manager*) for automated Windows uploads.
