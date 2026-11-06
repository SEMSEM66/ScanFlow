# Commit groups per release

## iOS polish – work in progress

The `feat/ios-polish` branch contains the corner-token, shared UI and test
commits, followed by native page-sheet and form-sheet migrations. The menu,
adjustment and navigation migrations are still outstanding. Do not release or
push to `main` until the complete task is checked; a main push triggers an IPA
build. Native share presentation must be verified on an iPhone.

---

## v1.6.0 – iOS-style panels & symmetric tab bar

Committed on `main` and pushed once → one IPA build and the release
`v1.6.0`. Verified: `npx tsc --noEmit`, `npm run lint` 0 errors, `npm test`
(191 passed / 1 skipped) and `npm run test:security` (56 passed). No new
packages.

| # | Message | Files |
| --- | --- | --- |
| 1 | `feat(ui): iOS-style bottom sheets with fading backdrop and pull-to-close` | `src/components/sheetMotion.ts`, `src/components/BottomSheet.tsx`, `__tests__/sheetMotion.test.ts`, `src/components/AdjustmentsPanel.tsx`, `ExportModal.tsx`, `DocumentActionModal.tsx`, `FolderOptionsModal.tsx`, `SortModal.tsx`, `MoveFolderModal.tsx`, `src/components/index.ts`, `src/components/modalHandoff.ts`, `app/(tabs)/index.tsx`, `app/document/[id].tsx` |
| 2 | `feat(nav): symmetric five-slot tab bar with a search tab` | `app/(tabs)/_layout.tsx`, `app/(tabs)/search.tsx`, `app/(tabs)/tools.tsx`, `src/i18n/de.ts`, `src/i18n/en.ts` |
| 3 | `docs: bottom sheets, tab bar and search tab (v1.6.0)` | `CHANGELOG.md`, `README.md`, `AGENTS.md`, `docs/*` |
| 4 | `chore(release): 1.6.0` | `package.json`, `package-lock.json`, `app.json` |

---

## v1.5.1 – Export fix (share sheet)

Committed on `main` and pushed once → one IPA build and the release
`v1.5.1`. Verified: `npx tsc --noEmit`, `npm run lint` 0 errors, `npm test`
and `npm run test:security`.

| # | Message | Files |
| --- | --- | --- |
| 1 | `fix(export): open the share sheet only after the export sheet has closed` | `src/components/modalHandoff.ts`, `src/components/index.ts`, `src/components/ExportModal.tsx`, `app/document/[id].tsx`, `__tests__/modalHandoff.test.ts` |
| 2 | `docs: export fix and presentation timing for the share sheet (v1.5.1)` | `CHANGELOG.md`, `AGENTS.md`, `docs/*` |
| 3 | `chore(release): 1.5.1` | `package.json`, `package-lock.json`, `app.json` |

---

## v1.5.0 – Phase C: text recognition & searchable PDF

Committed directly from the agent's working copy on the branch
`feat/phase-c-ocr` (pushes to other branches than `main` build nothing), then
fast-forward merged into `main` and pushed once → one IPA build and the
release `v1.5.0`. Intermediate commits are not guaranteed to type-check on
their own; the final state is verified (`npx tsc --noEmit`, `npm run lint`
0 errors, `npm test` 159 passed / 1 skipped).

New package: `expo-clipboard` (`npx expo install expo-clipboard`) – run
`npm install` after pulling.

| # | Message | Files |
| --- | --- | --- |
| 1 | `fix(library): open the folder list from the document menu` | `app/(tabs)/index.tsx` |
| 2 | `chore: bump version to 1.5.0, add expo-clipboard and the test:ocr script` | `package.json`, `package-lock.json`, `app.json` |
| 3 | `feat(ocr): add the local Apple Vision text recognition module` | `modules/scanflow-ocr/*`, `.gitignore` (only the root `ios/` / `android/` are generated) |
| 4 | `feat(ocr): add OCR model, search normalization, Vision conversion, PDF text layer and queue` | `src/ocr/*`, `src/imaging/pdf.ts`, `__tests__/ocr.test.ts`, `__tests__/ocrScheduler.test.ts`, `__tests__/pdfTextLayer.test.ts` |
| 5 | `feat(db): store recognized page text (schema v3) and search titles and text` | `src/db/*`, `src/services/PageTextRepository.ts`, `src/services/DocumentRepository.ts`, `__tests__/textSearch.test.ts`, `__tests__/migrations.test.ts` |
| 6 | `feat(ocr): recognize pages in the background and export searchable PDFs` | `src/services/OcrService.ts`, `ImagePipelineService.ts`, `StorageService.ts`, `ExportService.ts`, `src/services/index.ts` |
| 7 | `feat(ui): search page text with excerpts, copy text and text recognition settings` | `src/components/*`, `src/i18n/*`, `app/*` |
| 8 | `ci: release only from main and v* tags, check that the OCR module is linked` | `.github/workflows/build-ipa.yml` |
| 9 | `docs: text recognition and searchable PDF (v1.5.0)` | `CHANGELOG.md`, `README.md`, `AGENTS.md`, `docs/*` |

---

## v1.4.0 – Commit plan (Phase S: security hardening)

The v1.4.0 change set was prepared outside the repository (no git credentials
in the build environment). The delivery zip contains the **whole project**
(without `.git`, `node_modules`, `.expo`); copy it over your clone, then
commit with the commands below. The commits are grouped by layer in
dependency order; intermediate commits are **not** guaranteed to type-check
on their own – the final state is verified (`npx tsc --noEmit`, `npm test`).

**No new packages** – `npm install` is not needed (only the version number in
`package-lock.json` changed).

Push once at the end: every push to `main` starts the IPA workflow
(`.github/workflows/build-ipa.yml`), so one push = one CI run.

> **Is v1.3.0 already committed?** Run `git ls-files src/services/ScanImportService.ts`.
> If it prints the file name → use the seven commits below.
> If it prints nothing (v1.2.0 / v1.3.0 were never committed) → use the
> single commit at the end of this file instead.

### Commit groups

| # | Message | Files |
| --- | --- | --- |
| 1 | `chore: bump version to 1.4.0` | `package.json`, `package-lock.json`, `app.json` |
| 2 | `feat(security): add SHA-256/PBKDF2, PIN records, attempt limit and lock policy` | `src/security/*`, `__tests__/security.test.ts` |
| 3 | `fix(auth): never unlock without a check, persist PIN attempts, PBKDF2 PIN, device-only keychain` | `src/services/AuthService.ts`, `src/services/PrivacyService.ts`, `__tests__/authService.test.ts` |
| 4 | `fix(export): delete exported files after sharing and drop pseudo-shredding` | `src/services/ExportService.ts`, `src/services/StorageService.ts`, `__tests__/exportCleanup.test.ts` |
| 5 | `fix(app-lock): stop the Face ID loop, keep screens mounted, rebuild lock screen, PIN dialog and security settings` | `src/components/*`, `src/i18n/*`, `app/*` |
| 6 | `ci: publish a GitHub release for every app version` | `.github/workflows/build-ipa.yml` |
| 7 | `docs: document app lock and security hardening for 1.4.0` | `README.md`, `CHANGELOG.md`, `AGENTS.md`, `docs/*` |

No files were deleted in this change set.

### Commands (Command Prompt or PowerShell)

1. Extract `scanflow-v1.4.0.zip`, select everything **inside** the extracted
   folder and drag it into the repo's top level (where `package.json` is) →
   *Replace the files in the destination*.
2. In the repo folder (one command per line, no `&&`):

```bat
git status
npx tsc --noEmit
npm run lint
npm run test:security

git add package.json package-lock.json app.json
git commit -m "chore: bump version to 1.4.0"

git add src/security __tests__/security.test.ts
git commit -m "feat(security): add SHA-256/PBKDF2, PIN records, attempt limit and lock policy"

git add src/services/AuthService.ts src/services/PrivacyService.ts __tests__/authService.test.ts
git commit -m "fix(auth): never unlock without a check, persist PIN attempts, PBKDF2 PIN, device-only keychain"

git add src/services/ExportService.ts src/services/StorageService.ts __tests__/exportCleanup.test.ts
git commit -m "fix(export): delete exported files after sharing and drop pseudo-shredding"

git add src/components src/i18n app
git commit -m "fix(app-lock): stop the Face ID loop, keep screens mounted, rebuild lock screen, PIN dialog and security settings"

git add .github/workflows/build-ipa.yml
git commit -m "ci: publish a GitHub release for every app version"

git add -A
git commit -m "docs: document app lock and security hardening for 1.4.0"

git status
git log --oneline -7
git push
```

Single commit (only if v1.3.0 was never committed):

```bat
git add -A
git commit -m "feat: phase A, B and S - scan look, iOS document scanner, pdf-lib export and security hardening (v1.4.0)"
git push
```

3. Restart Metro with a clean cache: `npx expo start --clear`, then open the
   app in Expo Go and run the iPhone checklist (STOP S in `docs/ROADMAP.md`).

Notes

- `git status` before the first commit should list exactly the files below
  (plus nothing else). If it shows other changes, commit or stash them first.
- `npm run lint` reports 0 errors and 10 pre-existing warnings (unused
  variables) – they do not block the commits.
- The last `git add -A` picks up the docs and anything left over; `git status`
  must be clean afterwards.
- If `git push` fails (credentials), stop and configure Git Credential Manager
  / a GitHub token; do not force-push.
- Optional full test run (≈4–7 min, headless Skia): `npm test`.
- After the push, GitHub → *Actions* builds the IPA and creates the release
  **ScanFlow v1.4.0** (notes = the 1.4.0 section of `CHANGELOG.md`). The old
  *v1.1.0* release is no longer touched – delete it on GitHub → *Releases* if
  you do not need it.
- Existing settings and an existing 4-digit PIN are kept; the PIN is
  converted to the new format the first time it is entered.

### Files in this change set (vs. v1.3.0)

Added (10):

```text
__tests__/authService.test.ts
__tests__/exportCleanup.test.ts
__tests__/security.test.ts
src/components/LockScreen.tsx
src/components/PinPad.tsx
src/security/lockPolicy.ts
src/security/lockout.ts
src/security/pinHash.ts
src/security/sha256.ts
src/services/PrivacyService.ts
```

Changed (19):

```text
.github/workflows/build-ipa.yml
AGENTS.md
CHANGELOG.md
README.md
app.json
app/(tabs)/settings.tsx
app/_layout.tsx
docs/ARCHITECTURE.md
docs/COMMITS.md
docs/ROADMAP.md
package-lock.json
package.json
src/components/AppLockOverlay.tsx
src/components/PinSetupModal.tsx
src/i18n/de.ts
src/i18n/en.ts
src/services/AuthService.ts
src/services/ExportService.ts
src/services/StorageService.ts
```
