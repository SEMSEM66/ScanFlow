# v1.3.0 – Commit plan (Phase B: live scanner)

The v1.3.0 change set was prepared outside the repository (no git credentials
in the build environment). The delivery zip contains the **whole project**
(without `.git`, `node_modules`, `.expo`); copy it over your clone, then
commit with the PowerShell commands below. The commits are grouped by layer
in dependency order; intermediate commits are **not** guaranteed to
type-check on their own – the final state is verified (`npx tsc --noEmit`,
`npm test`).

Push once at the end: every push to `main` starts the IPA workflow
(`.github/workflows/build-ipa.yml`), so one push = one CI run.

> **Is v1.2.0 already committed?** Run `git ls-files src/imaging`.
> If it prints files → use the five commits below.
> If it prints nothing (Phase A was never committed) → use the single commit
> at the end of this file instead.

## Commit groups

| # | Message | Files |
| --- | --- | --- |
| 1 | `chore: bump version to 1.3.0 and declare de/en localizations` | `package.json`, `package-lock.json`, `app.json` |
| 2 | `feat(imaging): line-based document detector v2 with hard-scene tests` | `src/imaging/edgeDetection.ts`, `src/imaging/raster.ts`, `__tests__/edgeDetection.test.ts`, `__tests__/helpers/synthetic.ts` |
| 3 | `feat(services): add iOS document scanner service and shared saveScan import` | `src/services/*`, `__tests__/scanImport.test.ts` |
| 4 | `feat(scan): open the iOS document scanner app-wide, add photo import, more pages and review banner` | `src/components/*`, `src/i18n/*`, `app/*` |
| 5 | `docs: document phase B scan flow, roadmap and changelog for 1.3.0` | `README.md`, `CHANGELOG.md`, `AGENTS.md`, `docs/*` |

No files were deleted in this change set.

## PowerShell

Run in your clone (adjust the two paths). No `&&` – one command per line.

```powershell
$Repo = "C:\Projekte\ScanFlow"
$Zip  = "$env:USERPROFILE\Downloads\scanflow-v1.3.0.zip"
$Tmp  = Join-Path $env:TEMP "scanflow-v1.3.0"

Set-Location $Repo
git status
git pull

if (Test-Path $Tmp) { Remove-Item $Tmp -Recurse -Force }
Expand-Archive -Path $Zip -DestinationPath $Tmp -Force
robocopy $Tmp $Repo /E /NFL /NDL /NJH /NJS
Remove-Item $Tmp -Recurse -Force

npm install
npx expo install --check
npx tsc --noEmit
npm run lint
npm run test:imaging
npx jest __tests__/scanImport.test.ts

git add package.json package-lock.json app.json
git commit -m "chore: bump version to 1.3.0 and declare de/en localizations"

git add src/imaging __tests__/edgeDetection.test.ts __tests__/helpers/synthetic.ts
git commit -m "feat(imaging): line-based document detector v2 with hard-scene tests"

git add src/services __tests__/scanImport.test.ts
git commit -m "feat(services): add iOS document scanner service and shared saveScan import"

git add src/components src/i18n app
git commit -m "feat(scan): open the iOS document scanner app-wide, add photo import, more pages and review banner"

git add -A
git commit -m "docs: document phase B scan flow, roadmap and changelog for 1.3.0"

git status
git log --oneline -5
git push
```

Single commit (only if v1.2.0 was never committed):

```powershell
git add -A
git commit -m "feat: phase A + B - scan look, perspective correction, iOS document scanner and pdf-lib export (v1.3.0)"
git push
```

Notes

- `robocopy` exit code 1 means "files copied" (success). Drag and drop works
  too: extract the zip, select everything *inside* the extracted folder and
  drop it into the repo's top level (where `package.json` is), "Replace".
- `npm run lint` reports one pre-existing error in
  `src/components/AppLockOverlay.tsx` (not part of this change) – it does not
  block the commits.
- The last `git add -A` picks up the docs and anything left over; `git status`
  must be clean afterwards.
- If `git push` fails (credentials), stop and configure Git Credential Manager
  / a GitHub token; do not force-push.
- Optional full test run (≈4–7 min, headless Skia): `npm test`.
- Restart Metro with a clean cache after updating: `npx expo start --clear`.

## Files in this change set (vs. v1.2.0)

New

- `src/components/ScannerProvider.tsx`
- `src/services/DocumentScannerService.ts`, `src/services/ScanImportService.ts`
- `__tests__/scanImport.test.ts`

Changed

- `package.json`, `package-lock.json`, `app.json`
- `src/imaging/edgeDetection.ts`, `src/imaging/raster.ts`
- `__tests__/edgeDetection.test.ts`, `__tests__/helpers/synthetic.ts`
- `src/services/AuthService.ts`, `DocumentRepository.ts`, `ImagePipelineService.ts`, `PageRenderService.ts`, `StorageService.ts`, `index.ts`
- `src/components/PageEditorModal.tsx`, `src/components/index.ts`
- `src/i18n/de.ts`, `src/i18n/en.ts`
- `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/settings.tsx`, `app/document/[id].tsx`, `app/scan.tsx`
- `README.md`, `CHANGELOG.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/COMMITS.md`

Deleted

- none
