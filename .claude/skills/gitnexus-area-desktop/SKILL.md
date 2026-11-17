---
name: gitnexus-area-desktop
description: "Skill for the Desktop area of RAFIQ. 41 symbols across 6 files."
---

# Desktop

41 symbols | 6 files | Cohesion: 70%

## When to Use

- Working with code in `desktop/`
- Understanding how CleanStaleLockFiles, TerminateOrphanedProcesses, NotifyAppReady work
- Modifying desktop-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `desktop/MainForm.cs` | CenterErrorCard, CheckAndDismissSplash, InitializeApplication, InitializeBrandedErrorScreen, NotifyAppReady (+19) |
| `desktop/Common/WindowHelper.cs` | AttachThreadInput, BringWindowToTop, ForceForeground, GetCurrentThreadId, GetForegroundWindow (+6) |
| `desktop/Common/WebViewProcessGuard.cs` | CleanStaleLockFiles, TerminateOrphanedProcesses |
| `desktop/Services/DatabaseService.cs` | StartBackgroundChecks, MarkCleanShutdown |
| `desktop/Program.cs` | BringExistingInstanceToFront |
| `desktop/RafiqPOS.Tests/Scenarios/S96_DurabilityAndBenchmarkSafetyTest.cs` | CleanShutdownMarker_IsKept_WhenStartupFailedBeforeTheIntegrityCheckFinished |

## Entry Points

Start here when exploring this area:

- **`CleanStaleLockFiles`** (Method) — `desktop/Common/WebViewProcessGuard.cs:136`
- **`TerminateOrphanedProcesses`** (Method) — `desktop/Common/WebViewProcessGuard.cs:16`
- **`NotifyAppReady`** (Method) — `desktop/MainForm.cs:536`
- **`SaveThemePreference`** (Method) — `desktop/MainForm.cs:549`
- **`StartBackgroundChecks`** (Method) — `desktop/Services/DatabaseService.cs:825`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `CleanStaleLockFiles` | Method | `desktop/Common/WebViewProcessGuard.cs` | 136 |
| `TerminateOrphanedProcesses` | Method | `desktop/Common/WebViewProcessGuard.cs` | 16 |
| `NotifyAppReady` | Method | `desktop/MainForm.cs` | 536 |
| `SaveThemePreference` | Method | `desktop/MainForm.cs` | 549 |
| `StartBackgroundChecks` | Method | `desktop/Services/DatabaseService.cs` | 825 |
| `ForceForeground` | Method | `desktop/Common/WindowHelper.cs` | 46 |
| `ActivateAndBringToFront` | Method | `desktop/Common/WindowHelper.cs` | 99 |
| `CleanShutdownMarker_IsKept_WhenStartupFailedBeforeTheIntegrityCheckFinished` | Method | `desktop/RafiqPOS.Tests/Scenarios/S96_DurabilityAndBenchmarkSafetyTest.cs` | 114 |
| `MarkCleanShutdown` | Method | `desktop/Services/DatabaseService.cs` | 567 |
| `ToggleFullscreen` | Method | `desktop/MainForm.cs` | 1763 |
| `RenderPagePdf` | Method | `desktop/MainForm.cs` | 1848 |
| `CenterErrorCard` | Method | `desktop/MainForm.cs` | 1097 |
| `CheckAndDismissSplash` | Method | `desktop/MainForm.cs` | 725 |
| `InitializeApplication` | Method | `desktop/MainForm.cs` | 1145 |
| `InitializeBrandedErrorScreen` | Method | `desktop/MainForm.cs` | 812 |
| `Scaled` | Method | `desktop/MainForm.cs` | 108 |
| `TryGetEvergreenWebView2Version` | Method | `desktop/MainForm.cs` | 1446 |
| `UpdateSplashStatus` | Method | `desktop/MainForm.cs` | 513 |
| `AttachThreadInput` | Method | `desktop/Common/WindowHelper.cs` | 17 |
| `BringWindowToTop` | Method | `desktop/Common/WindowHelper.cs` | 25 |

## How to Explore

1. `context({name: "CleanStaleLockFiles"})` — see callers and callees
2. `query({search_query: "desktop"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
