---
description: Verified facts about THIS repository (stack, layout, commands, rules). Project-specific; regenerate with the project-discovery skill when copying the agent kit to another project.
applyTo: '**'
---

# Project Context — Rafiq POS (رفيق)

Authoritative rules live in [AGENTS.md](../../AGENTS.md) (Arabic, binding; CLAUDE.md holds only the GitNexus block). Detail: [README.md](../../README.md), [PROJECT_BACKLOG.md](../../PROJECT_BACKLOG.md), [UI_DESIGN_CATALOG.md](../../UI_DESIGN_CATALOG.md).

## Business
- Offline-first desktop POS and store management for Egyptian retail: supermarket/retail, clinical pharmacy (DDI, batches/FEFO, controlled drugs), cafe/restaurant (tables, KOT, recipes, delivery), e-payments/wallets (Vodafone Cash, InstaPay, Fawry, Aman), 11 store templates.
- Users: store owner (root/admin) and cashiers. UI is Arabic RTL. Target hardware: old Celeron PCs, Windows 7 SP1 to 11, 32/64-bit, 1024x768, no internet, sudden power cuts, RAM < 250MB.
- Licensing: Cloudflare Worker + D1 activation server (`license-server/`); signed license tokens verified offline (`desktop/Common/LicenseTokenVerifier.cs`).

## Status
- Version 1.1.0 (verified in AssemblyInfo.cs, frontend/package.json, installer .iss). SQLite schema `LATEST_SUPPORTED_VERSION = 66` (MigrationRunner.cs:10).
- PROJECT_BACKLOG.md: 641 tasks `[x]`, 0 `[ ]` (all milestones complete at discovery time).
- NOT a git repository in this checkout (no `.git`); no VCS history, no diffs available. A GitHub CI workflow exists (`.github/workflows/ci.yml`) for the upstream repo.
- No `.sln` file; MSBuild targets the `.csproj` files directly.
- 2026-11-11 pre-production review and fixes (supermarket scope): license-server admin hardcoded passwords removed, uninstall keeps store data by default, split/tender-following returns, server-side sale/return normalisation, deny-by-default expired-license gate, `Synchronous=Full`, WebView crash recovery, bounded POS catalog and exact-barcode lookup. NUnit scenarios S80-S101 were added but NOT run (Windows only). Open items: Win7 prerequisite pins are still UNVERIFIED and code signing is deferred (owner decisions); scale-label handling (PosView scale fallback, check digit) was deferred by the owner; Cloudflare secret rotation and rate-limit rules are owner actions (see license-server/README.md).

## Stack
- Host: C# on .NET Framework 4.8, WinForms + WebView2 (NuGet 1.0.1518.46; Fixed Runtime 109 on Win7/8, Evergreen on Win10/11), x86 only. Language level C# 5 (enforced by `<LangVersion>5</LangVersion>` in `desktop/RafiqPOS.csproj`): no `=>` members, `nameof`, `$""`, `?.`, `out var`, pattern matching.
- DB: SQLite via `Stub.System.Data.SQLite.Core.NetFramework`, WAL with `synchronous=FULL` on every app connection (owner decision: no loss of committed sales on power cut; see AGENTS.md 2.A.3); production path `%ProgramData%\RafiqPOS\data\rafiq_pos.db`.
- Frontend: React 19, TypeScript ~6.0, Vite 8 (target `chrome109`, `base './'`), Tailwind 3.4 (never v4), lucide-react, jsbarcode, xlsx (from cdn.sheetjs.com tarball), self-hosted Cairo / IBM Plex Sans Arabic fonts. Lint: oxlint. Tests: `node --test` with `--experimental-strip-types`. npm.
- License server: TypeScript, Cloudflare Workers/D1, wrangler, Node test runner.
- Installer: Inno Setup (`installer/RafiqPOS_Setup.iss`) + `.bat` build scripts; update packages via `scripts/build_update_package.ps1`.

## Layout
- `desktop/` C# host: `Bridge/` (IpcDispatcher.*.cs, BridgeModels.cs), `Services/` (93 files incl. many `*TestRunner.cs` in-app self-tests), `Repositories/`, `Models/`, `Database/` (MigrationRunner*.cs), `Common/` (Money, OsDetector, Logger, licensing), `MainForm.cs`, `Program.cs`.
- `desktop/RafiqPOS.Tests/` NUnit project, `Scenarios/S*.cs` (S90-S97 cover host infrastructure: error classification, migration safety, license gate/token kinds, audit reseal, PIN lockout, durability/benchmark safety, command-registry completeness).
- `frontend/src/`: `views/`, `components/` (shared: CustomSelect, MoneyInput, ToggleSwitch, RafiqDialog, ConfirmModal), `bridge/`, `context/`, `hooks/`, `utils/`, `constants/`, `types/`. `frontend/test/` 164 files.
- `license-server/` Worker (`src/`, `schema.sql`, `test/`); `installer/`; `scripts/`; `tools/` (catalog generators); `tests/` (Python adversarial/e2e, ad hoc); `docs/`; `branding/`; `scratch/` (scratch).
- Design reference `stitch_rafeeq_pos_system_ui_design/` is gitignored and NOT present in this checkout; see UI_DESIGN_CATALOG.md.
- Other agent configs: `.agents/rules`, `.claude/skills` (GitNexus skills), `.github/agents|skills|workflows`.

## Architecture rules (summary of AGENTS.md; read it for full text)
- React UI -> typed IPC bridge (`BridgeMessage<T>` with `requestId`) -> `IpcDispatcher` -> Services -> Repositories -> SQLite. UI never touches the DB.
- Expired/invalid license gate (`IpcDispatcher.IsLicenseBlockedAction`) is deny-by-default: only read-verb actions, `auth:*`/`license:*`/`window:*` and the explicit `LICENSE_EXPIRED_ALLOWED_ACTIONS` set pass; any new mutating command is blocked automatically. Admin-tier accounts are never hard-locked at login (delay only, max 60 s); the owner recovery code is never blocked by it. `audit:resealChain` is owner/root only and audited.
- Money: integer piasters only (`long` in C#, `Money` in TS); never float/double; convert to EGP only at display. Quantities in milli-units.
- All sale/stock/ledger writes in one ACID transaction with rollback; no hard delete of invoices/stock movements (contra entries). UUID v4 string PKs plus display `invoice_number`.
- Returns: the refund follows the original tender (per-method caps in `ReturnService`); cash refunds need an open shift; a split refund (`Return.Refunds`) stores the first method on the master row and every further method as an item-less linked `returns` row (`idempotency_key = 'split:' + master id`) so every `refund_method = 'cash'` SQL keeps working. Cancelling a customer payment adds negative contra rows (`debt_allocations` type `payment`, `payments` `debt_settlement`), never deletes.
- Schema changes only via `MigrationRunner` with next incremental number; additive only (no DROP); backup before migration. Update packages must never contain `.db/.db-wal/.db-shm` or `data/`; no forced restart after update; SHA-256 check + auto rollback.
- UI: no `<select>` (use `CustomSelect`), no ad hoc hex colors (tailwind tokens: brand, paid, canvas, surface, line, ink, warn, danger), no emojis (lucide-react SVG only), no CDN/online assets, no horizontal scroll at 1024x768/1366x768. Printed paper previews stay white even in dark mode; Code 128 barcodes via `encodeInvoiceBarcode`; amounts in words via `tafqeetCurrency`.
- Every new feature needs RBAC keys in `SecurityService.cs` (ALL_PERMISSIONS, GetPermissionsForRole, SyncPermissionAliases), `UserManagerModal.tsx` PERMISSION_GROUPS, `App.tsx` nav gating, and in-screen gating.
- No unused code (`noUnusedLocals/Parameters`, oxlint). Errors isolated per subsystem with precise Arabic messages.
- Versioning SemVer; bump all in lockstep: `desktop/Properties/AssemblyInfo.cs`, `desktop/app.manifest`, `frontend/package.json`, `installer/RafiqPOS_Setup.iss`, `Build_Installer.bat` installer name. Guarded by `frontend/test/app_update.test.js`.
- Work backlog strictly in order; never `git commit/push` unless explicitly asked.

## Commands
Verified on macOS (Node v22.21.0, npm 10.9.4) in `frontend/`:
- `npm ci` OK; `npm run lint` (oxlint) exit 0; `npm run build` (`tsc -b && vite build`, prebuild runs `sync:signatures`) OK; `npm test` 2390 tests, 2390 pass, 0 fail.
- `npm run dev` (Vite). Not run.
Unverified (Windows only; need MSBuild, NuGet, .NET 4.8; cannot run on this macOS machine), taken from CI/AGENTS.md:
- `nuget restore desktop/RafiqPOS.csproj -PackagesDirectory desktop/packages` (same for `desktop/RafiqPOS.Tests/RafiqPOS.Tests.csproj`)
- `MSBuild desktop\RafiqPOS.csproj /p:Configuration=Release /p:Platform=x86 /v:m` and the same for `Debug`; then copy `frontend\dist` to `desktop\bin\Release\dist` and `desktop\bin\Debug\dist` (required before finishing a task per AGENTS.md; `تشغيل_رفيق.bat` runs the Release exe).
- NUnit: build `desktop/RafiqPOS.Tests/RafiqPOS.Tests.csproj` (Debug x86), run `nunit3-console.exe desktop/RafiqPOS.Tests/bin/Debug/RafiqPOS.Tests.dll --x86`.
- In-app self-test suites run through `.github/workflows/scripts/Invoke-RafiqSelfTests.ps1` (suite list in ci.yml; `printer,label` are non-blocking).
- License server (in `license-server/`): `npm ci`, `npm test`; `npm run dev|deploy` (wrangler); `npm run d1:init-local|d1:init-remote`. Not run.
- Installer: `Build_Installer*.bat` (Inno Setup). Dev mode: `Run_Dev_Mode.bat` (`npm run dev -- --open`).

## Tests
- Frontend: 164 `frontend/test/*.test.js` files; mostly source-level/invariant checks (money, RBAC, UI rules, no English UI text with `no_english_ui_text.allow.json` allowlist, version sync).
- C#: NUnit scenarios S1-S71 under `desktop/RafiqPOS.Tests/Scenarios`, plus in-app `*TestRunner` suites invoked via CLI args handled in `Program.cs`, each run from a clean copy of `bin/Debug` for data isolation.
- Python scripts in `tests/` are ad hoc and not wired into CI (assumption, not verified).
- CI jobs: frontend and license-server tests (`ubuntu-latest`); desktop-build (Release only); desktop-nunit; desktop-selftests (matrix of 5 shards A, B, C, D, printer-label; printer-label is non-blocking); the desktop jobs run on `windows-latest` in parallel, each building Debug x86 itself.
- NUnit speed: `TestBase` builds one migrated template DB per test process and copies it per test (fallback: run all migrations; force with env `RAFIQ_TEST_NO_TEMPLATE=1`). The NUnit job summary lists the 15 slowest tests; each self-test shard summary lists seconds per suite. Not yet measured on a real runner; rebalance shards from those numbers.

## Environment quirks
- Mac compile check (no Windows needed): the host and `RafiqPOS.Tests` compile with mono `mcs -langversion:5` when the NuGet packages (WebView2, Newtonsoft.Json, Stub SQLite, ClosedXML, OpenXml, ExcelNumberFormat, NUnit 3.13.3) are downloaded to a scratch folder; this catches missing members and C# 6 syntax. NUnit tests cannot RUN on macOS (native SQLite interop is Windows-only).
- Project root contains Arabic-named files and paths; always quote paths.
- Dev machine is macOS: the C# host, NUnit, WebView2 and installer cannot be built or run here; only frontend and license-server checks work.
- `npm run build` writes `frontend/dist` (gitignored) and first runs `sync:signatures`, which mirrors `desktop/Resources/signatures/*.png` into `frontend/src/assets/signatures/`.
- The GitNexus index referenced in AGENTS.md/CLAUDE.md (`.gitnexus/`) is absent from this checkout and there is no git, so impact/detect_changes tooling is unavailable here; use grep/view and say so.
- `.env.example` exists; real `.env`, `.secrets/`, `*.pem` are gitignored. Never print values.

## User preferences
- Arabic is the primary language of docs and UI; respond to the owner in plain, short language.
- Strict adherence to AGENTS.md and backlog order; no auto-commit/push; always run lint + build and both Release/Debug MSBuild builds when on Windows before declaring done.
