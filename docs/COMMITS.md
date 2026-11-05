# v1.4.0 – Commit plan (Phase S: security hardening)

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
> If it prints the file name → use the six commits below.
> If it prints nothing (v1.2.0 / v1.3.0 were never committed) → use the
> single commit at the end of this file instead.

## Commit groups

| # | Message | Files |
| --- | --- | --- |
| 1 | `chore: bump version to 1.4.0` | `package.json`, `package-lock.json`, `app.json` |
| 2 | `feat(security): add SHA-256/PBKDF2, PIN records, attempt limit and lock policy` | `src/security/*`, `__tests__/security.test.ts` |
| 3 | `fix(auth): never unlock without a check, persist PIN attempts, PBKDF2 PIN, device-only keychain` | `src/services/AuthService.ts`, `src/services/PrivacyService.ts`, `__tests__/authService.test.ts` |
| 4 | `fix(export): delete exported files after sharing and drop pseudo-shredding` | `src/services/ExportService.ts`, `src/services/StorageService.ts`, `__tests__/exportCleanup.test.ts` |
| 5 | `fix(app-lock): stop the Face ID loop, keep screens mounted, rebuild lock screen, PIN dialog and security settings` | `src/components/*`, `src/i18n/*`, `app/*` |
| 6 | `docs: document app lock and security hardening for 1.4.0` | `README.md`, `CHANGELOG.md`, `AGENTS.md`, `docs/*` |

No files were deleted in this change set.

## Commands (Command Prompt or PowerShell)

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

git add -A
git commit -m "docs: document app lock and security hardening for 1.4.0"

git status
git log --oneline -6
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
- Existing settings and an existing 4-digit PIN are kept; the PIN is
  converted to the new format the first time it is entered.

## Files in this change set (vs. v1.3.0)

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

Changed (18):

```text
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
