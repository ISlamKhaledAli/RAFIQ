---
name: gitnexus-area-desktop
description: "Skill for the Desktop area of RAFIQ. 54 symbols across 7 files."
---

# Desktop

54 symbols | 7 files | Cohesion: 67%

## When to Use

- Working with code in `desktop/`
- Understanding how Info, CleanStaleLockFiles, TerminateOrphanedProcesses work
- Modifying desktop-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `desktop/MainForm.cs` | CenterErrorCard, CenterSplashCard, CheckAndDismissSplash, CreateRoundedRectanglePath, DismissSplashNow (+32) |
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
- **`NotifyAppReady`** (Method) — `desktop/MainForm.cs:557`
- **`SaveThemePreference`** (Method) — `desktop/MainForm.cs:570`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `Info` | Method | `desktop/Common/Logger.cs` | 55 |
| `CleanStaleLockFiles` | Method | `desktop/Common/WebViewProcessGuard.cs` | 136 |
| `TerminateOrphanedProcesses` | Method | `desktop/Common/WebViewProcessGuard.cs` | 16 |
| `NotifyAppReady` | Method | `desktop/MainForm.cs` | 557 |
| `SaveThemePreference` | Method | `desktop/MainForm.cs` | 570 |
| `TryShowPrintDialog` | Method | `desktop/MainForm.cs` | 2031 |
| `ForceForeground` | Method | `desktop/Common/WindowHelper.cs` | 46 |
| `PostHostEvent` | Method | `desktop/MainForm.cs` | 1839 |
| `ActivateAndBringToFront` | Method | `desktop/Common/WindowHelper.cs` | 99 |
| `CleanShutdownMarker_IsKept_WhenStartupFailedBeforeTheIntegrityCheckFinished` | Method | `desktop/RafiqPOS.Tests/Scenarios/S96_DurabilityAndBenchmarkSafetyTest.cs` | 114 |
| `MarkCleanShutdown` | Method | `desktop/Services/DatabaseService.cs` | 585 |
| `ToggleFullscreen` | Method | `desktop/MainForm.cs` | 1996 |
| `RenderPagePdf` | Method | `desktop/MainForm.cs` | 2081 |
| `CenterErrorCard` | Method | `desktop/MainForm.cs` | 1123 |
| `CenterSplashCard` | Method | `desktop/MainForm.cs` | 524 |
| `CheckAndDismissSplash` | Method | `desktop/MainForm.cs` | 746 |
| `CreateRoundedRectanglePath` | Method | `desktop/MainForm.cs` | 512 |
| `DismissSplashNow` | Method | `desktop/MainForm.cs` | 783 |
| `InitializeApplication` | Method | `desktop/MainForm.cs` | 1171 |
| `InitializeBrandedErrorScreen` | Method | `desktop/MainForm.cs` | 838 |

## How to Explore

1. `context({name: "Info"})` — see callers and callees
2. `query({search_query: "desktop"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
