# v1.2.0 – Commit plan (Phase A + docs)

The v1.2.0 change set was prepared outside the repository (no git credentials
in the build environment). Apply it with the PowerShell commands below. The
commits are grouped by layer in dependency order; intermediate commits are
**not** guaranteed to type-check on their own – the final state is verified
(`npx tsc --noEmit`, `npm test`).

Push once at the end: every push to `main` starts the IPA workflow
(`.github/workflows/build-ipa.yml`), so one push = one CI run.

## Commit groups

| # | Message | Files |
| --- | --- | --- |
| 1 | `chore(deps): add skia, pdf-lib, slider, jest and eslint tooling; bump version to 1.2.0` | `package.json`, `package-lock.json`, `app.json`, `eslint.config.js`, `jest.config.js`, `.gitignore` |
| 2 | `feat(imaging): add pure TypeScript imaging core with Skia renderer and pdf-lib builder` | `src/imaging/*`, `tools/prototype/enhance_prototype.py` |
| 3 | `test(imaging): add geometry, detection, renderer, pdf, page state and migration tests` | `__tests__/*` |
| 4 | `feat(db): add schema v2 with user_version migrations for non-destructive page state` | `src/db/*`, `src/types/index.ts` |
| 5 | `feat(services): add image pipeline and render services, pdf-lib export and page APIs` | `src/services/*` (incl. deletion of `FilterService.ts`) |
| 6 | `feat(crop): add perspective crop with skia overlay, loupe, detection and page format` | `app/crop.tsx` |
| 7 | `feat(editor): non-destructive filters, adjustments, page management and export options` | `app/document/[id].tsx`, `src/components/*` (incl. deletion of `HeadlessFilterProcessor.tsx`), `src/i18n/*` |
| 8 | `fix(scan): add and retake pages in existing documents; reload library and use real cache clear` | `app/scan.tsx`, `app/(tabs)/*` |
| 9 | `docs: document phase A pipeline, correct earlier claims and add phase A-D roadmap` | `README.md`, `CHANGELOG.md`, `AGENTS.md`, `docs/*` |

Alternative (single commit):
`feat: phase A scan look – perspective correction, scan filters, non-destructive editing and pdf-lib export`

## PowerShell

Run in your clone (adjust the two paths). No `&&` – one command per line.

```powershell
$Repo = "C:\Projekte\ScanFlow"
$Zip  = "$env:USERPROFILE\Downloads\scanflow-update.zip"
$Tmp  = Join-Path $env:TEMP "scanflow-update"

Set-Location $Repo
git status
git pull

if (Test-Path $Tmp) { Remove-Item $Tmp -Recurse -Force }
Expand-Archive -Path $Zip -DestinationPath $Tmp -Force
robocopy $Tmp $Repo /E /NFL /NDL /NJH /NJS
Remove-Item $Tmp -Recurse -Force

Remove-Item src/services/FilterService.ts, src/components/HeadlessFilterProcessor.tsx

npm install
npx expo install --check
npx tsc --noEmit
npm run lint
npm run test:imaging

git add package.json package-lock.json app.json eslint.config.js jest.config.js .gitignore
git commit -m "chore(deps): add skia, pdf-lib, slider, jest and eslint tooling; bump version to 1.2.0"

git add src/imaging tools/prototype/enhance_prototype.py
git commit -m "feat(imaging): add pure TypeScript imaging core with Skia renderer and pdf-lib builder"

git add __tests__
git commit -m "test(imaging): add geometry, detection, renderer, pdf, page state and migration tests"

git add src/db src/types
git commit -m "feat(db): add schema v2 with user_version migrations for non-destructive page state"

git add src/services
git commit -m "feat(services): add image pipeline and render services, pdf-lib export and page APIs"

git add app/crop.tsx
git commit -m "feat(crop): add perspective crop with skia overlay, loupe, detection and page format"

git add app/document src/components src/i18n
git commit -m "feat(editor): non-destructive filters, adjustments, page management and export options"

git add app/scan.tsx "app/(tabs)"
git commit -m "fix(scan): add and retake pages in existing documents; reload library and use real cache clear"

git add -A
git commit -m "docs: document phase A pipeline, correct earlier claims and add phase A-D roadmap"

git status
git log --oneline -9
git push
```

Notes

- `robocopy` exit code 1 means "files copied" (success).
- `Remove-Item` is needed because copying cannot delete the two removed files;
  `git add <folder>` then stages the deletion in the matching commit (5 and 7).
- The last `git add -A` picks up the docs and anything left over; `git status`
  must be clean afterwards.
- If `git push` fails (credentials), stop and configure Git Credential Manager
  / a GitHub token; do not force-push.
- Optional full test run (≈5–7 min, headless Skia): `npm test`.

## Files in this change set

New

- `__tests__/edgeDetection.test.ts`, `geometry.test.ts`, `migrations.test.ts`, `pageState.test.ts`, `pdf.test.ts`, `renderer.test.ts`, `samples.test.ts`
- `__tests__/helpers/skia.ts`, `__tests__/helpers/synthetic.ts`
- `docs/ARCHITECTURE.md`, `docs/COMMITS.md`
- `eslint.config.js`, `jest.config.js`
- `src/components/AdjustmentsPanel.tsx`
- `src/db/migrations.ts`
- `src/imaging/background.ts`, `edgeDetection.ts`, `filters.ts`, `geometry.ts`, `index.ts`, `pageFormat.ts`, `pageState.ts`, `pdf.ts`, `raster.ts`, `renderer.ts`, `shaders.ts`, `types.ts`
- `src/services/ImagePipelineService.ts`, `src/services/PageRenderService.ts`
- `tools/prototype/enhance_prototype.py`

Changed

- `.gitignore`, `AGENTS.md`, `CHANGELOG.md`, `README.md`, `app.json`, `package.json`, `package-lock.json`, `docs/ROADMAP.md`
- `app/(tabs)/index.tsx`, `app/(tabs)/settings.tsx`, `app/crop.tsx`, `app/document/[id].tsx`, `app/scan.tsx`
- `src/components/DocumentBottomBar.tsx`, `ExportModal.tsx`, `FilterStrip.tsx`, `PageEditorModal.tsx`, `PromptModal.tsx`, `index.ts`
- `src/db/database.ts`, `src/db/schema.ts`
- `src/i18n/de.ts`, `src/i18n/en.ts`
- `src/services/AuthService.ts`, `DocumentRepository.ts`, `ExportService.ts`, `StorageService.ts`, `index.ts`
- `src/types/index.ts`

Deleted

- `src/services/FilterService.ts`
- `src/components/HeadlessFilterProcessor.tsx`
