# RafiqPOS.Tests.Portable

A portable (macOS / Linux / Windows) test harness that **runs** the NUnit scenarios and the in-app self-test suites against the
`RafiqPOS.Data` compatibility layer (Microsoft.Data.Sqlite + SQLite3 Multiple Ciphers). It exists because the Windows-only test project
(`../RafiqPOS.Tests`, .NET Framework 4.8, x86) cannot run on a Mac.

It is **not** part of the shipping build: the Windows `.csproj` files list their sources explicitly (`<Compile Include=...>`, no wildcards), so this folder
is never compiled by them, by the installer or by CI. There is no `.sln`.

## Run

```
cd desktop/RafiqPOS.Tests.Portable
dotnet test                                                     # whole NUnit suite, ENCRYPTED databases (the shipping behaviour, default)
RAFIQ_TEST_PLAIN=1 dotnet test                                  # same suite against PLAIN databases (encryption scenarios S104-S109 are ignored)
dotnet test --filter "TestCategory=SelfTestRunners"             # the 34 in-app self-test suites (CI shards A-D + printer/label)
dotnet test --filter "TestCategory=Performance" --logger "console;verbosity=detailed"   # timings, look for lines starting with PERF
RAFIQ_TEST_NO_TEMPLATE=1 dotnet test                            # every test runs all migrations itself (no template DB copy)
dotnet test --filter "FullyQualifiedName~S102"                  # one scenario
```

Requirements: .NET 8 SDK; for the receipt/barcode (GDI) tests `libgdiplus` (macOS: `brew install mono-libgdiplus`, found through
`portable.runsettings`, which sets `DYLD_FALLBACK_LIBRARY_PATH`). First run restores NuGet packages (needs internet once).

## How it is built

* One net8.0 test assembly (`RafiqPOS.Tests.Portable`) = host sources + scenario sources + the few files in this folder.
* The source lists are **read from the Windows projects at build time** (`XmlPeek` in the csproj): host files = `Compile` items of
  `../RafiqPOS.csproj` minus the exclusions below, scenario files = `Compile` items of `../RafiqPOS.Tests/RafiqPOS.Tests.csproj`.
  A new scenario or host file added to the Windows csproj is picked up automatically; there is no second list to keep in sync.
* Defines `PORTABLE_TESTS` (currently not needed by any production `#if`; shipping code has no harness-specific changes).
* `System.Drawing.Common` is pinned to **5.0.3**: the last version with libgdiplus support on macOS/Linux (6.0+ is Windows-only).
* `Program.cs` (the real `Main` with the `--run-xxx-tests` flags) is compiled; `HarnessEntry` is the assembly entry point and forwards to it,
  with the base directory redirected to a private work folder, so each self-test suite runs from a clean `data\` and `logs\` like CI does.

## Stubs (harness-only, `Stubs/`)

| File | Why |
|---|---|
| `UiStubs.cs` | `System.Windows.Forms` (`Form`, `Application`, dialogs, `Screen`, `MessageBox`) and `Microsoft.Web.WebView2.Core` are Windows-only. Only the members the non-UI host files touch exist; dialogs return `Cancel`, WebView2 reports "not available". |
| `MainFormStub.cs` | replaces `MainForm.cs` (WinForms + WebView2 window). `MainForm.Instance` is `null`, which is what the host sees when no window exists. |
| `ChildProcessTrackerStub.cs` | replaces `Common/ChildProcessTracker.cs` (kernel32 Job Object API, called first thing in `Program.Main`). |
| `RsaCngStub.cs` | `RSACng` (Windows CNG) throws on macOS/Linux; the stub wraps the portable `RSA` (same RS256 sign/verify) for license token tests. |

Host files excluded from the compile: `MainForm.cs` (WinForms/WebView2 form, replaced by the stub) and `Common/ChildProcessTracker.cs` (Win32 job objects).
Everything else in `../RafiqPOS.csproj` compiles unchanged. `Registry` (MachineGuid, OsDetector) falls back to the code's own defaults, DPAPI/WMI/printing
code paths are either guarded by try/catch in the host or not reached.

## Excluded tests (everything else must pass)

| Test | Where | Reason |
|---|---|---|
| self-test suite `label` | `SelfTestRunnersTest` (reported as *Ignored*) | **Portability.** Check 10/15 samples fixed pixel positions of text drawn with Tahoma/Segoe UI; libgdiplus on macOS substitutes fonts with other metrics. The other 14 label checks pass; no database involved. |
| self-test suite `data-quality` | `SelfTestRunnersTest` (reported as *Ignored*) | **Pre-existing, unrelated to SQLite.** `reports:repairDataQuality` is rejected by the deny-by-default expired-license gate (`LICENSE_EXPIRED`) because the runner starts from a fresh, unlicensed data folder; 33 of 34 assertions pass and the failing one is the IPC call. Same on Windows. |

No NUnit scenario is excluded (the former S92 exclusion was a test bug and is fixed). In `RAFIQ_TEST_PLAIN=1` mode the encryption-specific scenarios (S104-S109) call `Assert.Ignore`, so that mode reports about 41 skipped tests.

Categories excluded from the default run only because they are slow/diagnostic: `SelfTestRunners`, `Performance`.

## Notes

* `RAFIQ_TEST_PLAIN=1` is read by `RafiqPOS.Tests.GlobalTestSetup` (NUnit) and by `HarnessEntry` (the self-test child processes). It is a test-only switch: shipping code never reads it
  (`DatabaseKeyProvider.DisableDefaultEncryption` is internal).
* `RAFIQ_TEST_CONN_EXTRA="Pooling=True;"` appends keywords to the `TestBase` connection string (experiments only).
* Shim fixes found by this harness belong in `../Data/` and get a test in `../RafiqPOS.Tests/Scenarios/S102_SqliteCompatLayerTest.cs`.
* Timings printed by `Performance` are for the machine that runs them (the repository records macOS/arm64 figures only, see the project context).
* `bin/` and `obj/` are git-ignored.
