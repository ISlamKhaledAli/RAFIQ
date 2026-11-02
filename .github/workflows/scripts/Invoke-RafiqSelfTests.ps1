<#
.SYNOPSIS
  Runs Rafiq POS in-app self-test suites (RafiqPOS.exe --run-<suite>-tests) in isolation.

.DESCRIPTION
  The --run-*-tests flags exist only in a DEBUG build (desktop/Program.cs, #if DEBUG). Each runner calls
  Environment.Exit(0) on success and a non-zero code on failure, before the single-instance mutex and
  Application.Run, so no UI is shown. A DEBUG build keeps its database (data\), logs (logs\) and
  *_output.* result files next to the exe (AppDomain.BaseDirectory), so every suite runs from its own
  fresh copy of the build output: no state leaks from one suite to the next.

  Each suite gets a hard timeout; a hung process (e.g. an unknown flag that falls through to the WinForms
  UI) is killed with its process tree and counted as a failure. All suites run even if one fails; the
  script exits 1 if any suite failed or timed out, 0 otherwise.

  Per-suite artifacts (stdout.log, stderr.log, *_output.json/txt, logs\*) are written to
  <ArtifactDir>\<suite>\, and a summary.md is written to <ArtifactDir> (and to $env:GITHUB_STEP_SUMMARY
  when running in GitHub Actions).

.EXAMPLE
  # From the repository root, after building Debug|x86:
  pwsh -File .github/workflows/scripts/Invoke-RafiqSelfTests.ps1 -Suites license,inventory,chaos
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string[]] $Suites,

    # Debug|x86 output folder of desktop/RafiqPOS.csproj (OutputPath bin\Debug\).
    [string] $AppDir = 'desktop\bin\Debug',

    # Scratch root for the per-suite copies of the build output.
    [string] $WorkRoot = (Join-Path ([System.IO.Path]::GetTempPath()) 'rafiq-selftests'),

    [string] $ArtifactDir = 'selftest-results',

    [int] $TimeoutMinutes = 15,

    # Label used in the summary heading (e.g. "blocking" / "non-blocking").
    [string] $Title = 'Rafiq POS self-tests'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3

# Accept both "-Suites a,b" and a single comma/space separated string (handy from YAML).
$Suites = @($Suites | ForEach-Object { $_ -split '[,\s]+' } | Where-Object { $_ })
if ($Suites.Count -eq 0) { throw 'No suites given.' }

$AppDir = (Resolve-Path -LiteralPath $AppDir).Path
$exeName = 'RafiqPOS.exe'
$sourceExe = Join-Path $AppDir $exeName
if (-not (Test-Path -LiteralPath $sourceExe)) {
    throw "RafiqPOS.exe not found in '$AppDir'. Build desktop/RafiqPOS.csproj with /p:Configuration=Debug /p:Platform=x86 first."
}

New-Item -ItemType Directory -Force -Path $ArtifactDir | Out-Null
$ArtifactDir = (Resolve-Path -LiteralPath $ArtifactDir).Path
New-Item -ItemType Directory -Force -Path $WorkRoot | Out-Null

# Guard against typos / Release builds: every flag must be compiled into the exe as a UTF-16 string
# literal. Otherwise Program.Main would fall through to the UI and only the timeout would catch it.
$exeBytes = [System.IO.File]::ReadAllBytes($sourceExe)
$exeText = [System.Text.Encoding]::Unicode.GetString($exeBytes) +
           [System.Text.Encoding]::Unicode.GetString($exeBytes, 1, $exeBytes.Length - 1)
$unknown = @($Suites | Where-Object { $exeText.IndexOf("--run-$_-tests", [System.StringComparison]::Ordinal) -lt 0 })
if ($unknown.Count -gt 0) {
    throw ("Flag(s) not found in $sourceExe (not a Debug build, or unknown suite): " +
           (($unknown | ForEach-Object { "--run-$_-tests" }) -join ', '))
}

# Folders produced at runtime that must never be carried into a suite's fresh copy.
$stateDirs = @('data', 'logs', 'backups')
$timeoutMs = $TimeoutMinutes * 60 * 1000
$results = New-Object System.Collections.Generic.List[object]

foreach ($suite in $Suites) {
    $flag = "--run-$suite-tests"
    $work = Join-Path $WorkRoot $suite
    $art = Join-Path $ArtifactDir $suite
    if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $work, $art | Out-Null

    Copy-Item -Path (Join-Path $AppDir '*') -Destination $work -Recurse -Force
    foreach ($d in $stateDirs) {
        $p = Join-Path $work $d
        if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Recurse -Force }
    }
    Get-ChildItem -LiteralPath $work -File -Filter '*_output.*' | Remove-Item -Force

    $stdout = Join-Path $art 'stdout.log'
    $stderr = Join-Path $art 'stderr.log'
    Write-Host "::group::$flag"
    Write-Host "Running $flag in $work (timeout $TimeoutMinutes min)"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $proc = Start-Process -FilePath (Join-Path $work $exeName) -ArgumentList $flag -WorkingDirectory $work `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr -NoNewWindow -PassThru
    $null = $proc.Handle  # cache the handle so ExitCode is available after exit (known Start-Process quirk)

    $status = $null
    $exitCode = $null
    if ($proc.WaitForExit($timeoutMs)) {
        $proc.WaitForExit()  # make sure the exit is fully processed before reading ExitCode
        $exitCode = $proc.ExitCode
        $status = if ($exitCode -eq 0) { 'PASS' } else { 'FAIL' }
    }
    else {
        try { & taskkill.exe /PID $proc.Id /T /F 2>&1 | Out-Host }
        catch { try { $proc.Kill() } catch { Write-Host "warning: could not kill PID $($proc.Id): $_" } }
        $status = 'TIMEOUT'
    }
    $sw.Stop()

    # Collect result files and logs for the artifact.
    Get-ChildItem -LiteralPath $work -File -Filter '*_output.*' | Copy-Item -Destination $art -Force
    $logs = Join-Path $work 'logs'
    if (Test-Path -LiteralPath $logs) { Copy-Item -LiteralPath $logs -Destination $art -Recurse -Force }

    if ($status -ne 'PASS' -and (Test-Path -LiteralPath $stdout)) {
        Write-Host '--- last 80 lines of stdout ---'
        Get-Content -LiteralPath $stdout -Tail 80 | Out-Host
        if ((Test-Path -LiteralPath $stderr) -and (Get-Item -LiteralPath $stderr).Length -gt 0) {
            Write-Host '--- stderr ---'
            Get-Content -LiteralPath $stderr -Tail 80 | Out-Host
        }
    }
    Write-Host "$flag -> $status (exit code: $exitCode, $([int]$sw.Elapsed.TotalSeconds)s)"
    Write-Host '::endgroup::'
    if ($status -ne 'PASS') {
        Write-Host "::error title=Self-test $suite::$flag $status (exit code: $exitCode). See artifact folder '$suite'."
    }

    $results.Add([pscustomobject]@{
            Suite    = $suite
            Status   = $status
            ExitCode = $exitCode
            Seconds  = [int]$sw.Elapsed.TotalSeconds
        })

    try { Remove-Item -LiteralPath $work -Recurse -Force } catch { Write-Host "warning: could not clean $work : $_" }
}

$failed = @($results | Where-Object { $_.Status -ne 'PASS' })
$lines = @("### $Title", '', '| Suite | Status | Exit code | Seconds |', '|---|---|---|---|')
foreach ($r in $results) { $lines += "| $($r.Suite) | $($r.Status) | $($r.ExitCode) | $($r.Seconds) |" }
$lines += ''
$lines += "Passed $($results.Count - $failed.Count) / $($results.Count)."
$summary = $lines -join [Environment]::NewLine
Set-Content -LiteralPath (Join-Path $ArtifactDir 'summary.md') -Value $summary -Encoding UTF8
if ($env:GITHUB_STEP_SUMMARY) { Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Value $summary -Encoding UTF8 }
$results | Format-Table -AutoSize | Out-Host

if ($failed.Count -gt 0) {
    Write-Host "FAILED suites: $(($failed | ForEach-Object { $_.Suite }) -join ', ')"
    exit 1
}
exit 0
