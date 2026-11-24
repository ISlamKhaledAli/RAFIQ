---
name: gitnexus-area-desktop
description: "Skill for the Desktop area of RAFIQ. 56 symbols across 7 files."
---

# Desktop

56 symbols | 7 files | Cohesion: 68%

## When to Use

- Working with code in `desktop/`
- Understanding how Info, CleanStaleLockFiles, TerminateOrphanedProcesses work
- Modifying desktop-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `desktop/MainForm.cs` | CenterErrorCard, CenterSplashCard, CheckAndDismissSplash, CreateRoundedRectanglePath, DismissSplashNow (+34) |
| `desktop/Common/WindowHelper.cs` | AttachThreadInput, BringWindowToTop, ForceForeground, GetCurrentThreadId, GetForegroundWindow (+6) |
| `desktop/Common/WebViewProcessGuard.cs` | CleanStaleLockFiles, TerminateOrphanedProcesses |
| `desktop/Common/Logger.cs` | Info |
| `desktop/Program.cs` | BringExistingInstanceToFront |
| `desktop/RafiqPOS.Tests/Scenarios/S96_DurabilityAndBenchmarkSafetyTest.cs` | CleanShutdownMarker_IsKept_WhenStartupFailedBeforeTheIntegrityCheckFinished |
| `desktop/Services/DatabaseService.cs` | MarkCleanShutdown |

## Entry Points

Start here when exploring this area:

- **`Info`** (Method) — `desktop/Common/Logger.cs:55`
- **`CleanStaleLockFiles`** (Method) — `desktop/Common/WebViewProcessGuard.cs:136`
- **`TerminateOrphanedProcesses`** (Method) — `desktop/Common/WebViewProcessGuard.cs:16`
- **`NotifyAppReady`** (Method) — `desktop/MainForm.cs:559`
- **`SaveThemePreference`** (Method) — `desktop/MainForm.cs:572`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `Info` | Method | `desktop/Common/Logger.cs` | 55 |
| `CleanStaleLockFiles` | Method | `desktop/Common/WebViewProcessGuard.cs` | 136 |
| `TerminateOrphanedProcesses` | Method | `desktop/Common/WebViewProcessGuard.cs` | 16 |
| `NotifyAppReady` | Method | `desktop/MainForm.cs` | 559 |
| `SaveThemePreference` | Method | `desktop/MainForm.cs` | 572 |
| `TryShowPrintDialog` | Method | `desktop/MainForm.cs` | 2048 |
| `ForceForeground` | Method | `desktop/Common/WindowHelper.cs` | 46 |
| `PostHostEvent` | Method | `desktop/MainForm.cs` | 1846 |
| `ActivateAndBringToFront` | Method | `desktop/Common/WindowHelper.cs` | 99 |
| `CleanShutdownMarker_IsKept_WhenStartupFailedBeforeTheIntegrityCheckFinished` | Method | `desktop/RafiqPOS.Tests/Scenarios/S96_DurabilityAndBenchmarkSafetyTest.cs` | 114 |
| `MarkCleanShutdown` | Method | `desktop/Services/DatabaseService.cs` | 615 |
| `ToggleFullscreen` | Method | `desktop/MainForm.cs` | 2013 |
| `RenderPagePdf` | Method | `desktop/MainForm.cs` | 2098 |
| `CenterErrorCard` | Method | `desktop/MainForm.cs` | 1125 |
| `CenterSplashCard` | Method | `desktop/MainForm.cs` | 526 |
| `CheckAndDismissSplash` | Method | `desktop/MainForm.cs` | 748 |
| `CreateRoundedRectanglePath` | Method | `desktop/MainForm.cs` | 514 |
| `DismissSplashNow` | Method | `desktop/MainForm.cs` | 785 |
| `InitializeApplication` | Method | `desktop/MainForm.cs` | 1173 |
| `InitializeBrandedErrorScreen` | Method | `desktop/MainForm.cs` | 840 |

## How to Explore

1. `context({name: "Info"})` — see callers and callees
2. `query({search_query: "desktop"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
