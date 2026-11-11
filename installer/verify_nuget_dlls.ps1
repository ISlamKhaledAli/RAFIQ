<#
  Rafiq POS build helper: verifies the SHA-256 of every NuGet DLL the build ships against installer\prerequisites\NUGET_DLL_SHA256.txt
  (pins computed from the exact .nupkg files). The build must FAIL on a missing file or a mismatch; there is deliberately no check at
  application startup.

  Usage: verify_nuget_dlls.ps1 [-PackagesDir <desktop\packages>] [-PinFile <NUGET_DLL_SHA256.txt>] [-BinDir <desktop\bin\Release>]
  With -BinDir the copied sqlite3mc.dll next to the exe must equal the pinned one too.
  Exit code 0 = all pins match, 1 = at least one problem. Windows PowerShell 5.1.
#>
param(
    [string]$PackagesDir = (Join-Path $PSScriptRoot '..\desktop\packages'),
    [string]$PinFile = (Join-Path $PSScriptRoot 'prerequisites\NUGET_DLL_SHA256.txt'),
    [string]$BinDir
)

$ErrorActionPreference = 'Stop'
$failures = New-Object System.Collections.Generic.List[string]

if (-not (Test-Path -LiteralPath $PinFile)) { Write-Host "FAIL: pin file not found: $PinFile"; exit 1 }

$checked = 0
foreach ($line in Get-Content -LiteralPath $PinFile) {
    $text = $line.Trim()
    if ($text.Length -eq 0 -or $text.StartsWith('#')) { continue }
    if ($text -notmatch '^([0-9a-fA-F]{64})\s{2}([^/]+)/([^/]+)/(.+)$') { $failures.Add("malformed pin line: $text"); continue }
    $expected = $Matches[1].ToLowerInvariant()
    $file = Join-Path $PackagesDir ("{0}.{1}\{2}" -f $Matches[2], $Matches[3], ($Matches[4] -replace '/', '\'))
    if (-not (Test-Path -LiteralPath $file)) { $failures.Add("missing: $file"); continue }
    $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { $failures.Add("SHA-256 mismatch: $file`n    expected $expected`n    actual   $actual") }
    $checked++
    if ($BinDir -and $file.EndsWith('sqlite3mc.dll')) {
        $copy = Join-Path $BinDir 'sqlite3mc.dll'
        if (-not (Test-Path -LiteralPath $copy)) { $failures.Add("missing in output: $copy") }
        elseif ((Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { $failures.Add("output sqlite3mc.dll differs from the pinned one: $copy") }
    }
}

if ($checked -eq 0) { $failures.Add('no pin was checked') }
if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Host "FAIL: $_" }
    exit 1
}
Write-Host "OK: $checked NuGet DLL pins verified"
exit 0
