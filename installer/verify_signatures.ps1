<#
  Rafiq POS build helper: verifies that Microsoft prerequisite binaries are Authenticode-signed by
  Microsoft Corporation with a valid chain to a Microsoft root, and optionally checks a file version.

  File mode : verify_signatures.ps1 -Path <file> [-ExpectedVersion <x.y.z.w>]
  Tree mode : verify_signatures.ps1 -Path <folder> -Tree [-VersionFile <name> -ExpectedVersion <x.y.z.w>]
              (every *.exe and *.dll in the folder must pass; any reparse point fails the check)

  Exit code 0 = all checks passed, 1 = at least one failure (details are printed).
  Windows PowerShell 5.1 (Windows 10/11 build machine).
#>
param(
    [Parameter(Mandatory = $true)][string]$Path,
    [switch]$Tree,
    [string]$VersionFile,
    [string]$ExpectedVersion
)

$ErrorActionPreference = 'Stop'
$failures = New-Object System.Collections.Generic.List[string]

function Get-SignatureProblem([string]$file) {
    $sig = Get-AuthenticodeSignature -LiteralPath $file
    if ($sig.Status -ne 'Valid') {
        return "signature status is '$($sig.Status)' ($($sig.StatusMessage))"
    }
    $cert = $sig.SignerCertificate
    if ($null -eq $cert -or $cert.Subject -notmatch '(^|,\s*)O=Microsoft Corporation(\s*,|$)') {
        return "signer is not Microsoft Corporation: $($cert.Subject)"
    }
    $chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
    $chain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
    [void]$chain.Build($cert)
    if ($chain.ChainElements.Count -lt 2) {
        return 'certificate chain could not be built'
    }
    $root = $chain.ChainElements[$chain.ChainElements.Count - 1].Certificate
    if ($root.Subject -notmatch 'CN=Microsoft (Root Certificate Authority|Root Authority|Identity Verification Root Certificate Authority)') {
        return "chain does not end at a Microsoft root: $($root.Subject)"
    }
    return $null
}

function Get-VersionProblem([string]$file, [string]$expected) {
    $info = (Get-Item -LiteralPath $file).VersionInfo
    $fileVersion = ("" + $info.FileVersion).Trim()
    $productVersion = ("" + $info.ProductVersion).Trim()
    if ($fileVersion -ne $expected -and $productVersion -ne $expected) {
        return "version is '$fileVersion' (product '$productVersion'), expected '$expected'"
    }
    return $null
}

try {
    if ($Tree) {
        if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
            throw "folder not found: $Path"
        }
        $items = Get-ChildItem -LiteralPath $Path -Recurse -Force
        foreach ($item in $items) {
            if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
                $failures.Add("$($item.FullName): reparse point (junction/symlink) is not allowed")
            }
        }
        $binaries = @($items | Where-Object { -not $_.PSIsContainer -and ($_.Extension -eq '.exe' -or $_.Extension -eq '.dll') })
        if ($binaries.Count -eq 0) {
            $failures.Add("$($Path): no .exe/.dll files found")
        }
        foreach ($bin in $binaries) {
            $problem = Get-SignatureProblem $bin.FullName
            if ($problem) { $failures.Add("$($bin.FullName): $problem") }
        }
        if ($VersionFile -and $ExpectedVersion) {
            $versionPath = Join-Path $Path $VersionFile
            if (-not (Test-Path -LiteralPath $versionPath -PathType Leaf)) {
                $failures.Add("$($versionPath): not found")
            } else {
                $problem = Get-VersionProblem $versionPath $ExpectedVersion
                if ($problem) { $failures.Add("$($versionPath): $problem") }
            }
        }
        if ($failures.Count -eq 0) { Write-Host "      OK  signatures ($($binaries.Count) files) $Path" }
    } else {
        if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
            throw "file not found: $Path"
        }
        $problem = Get-SignatureProblem $Path
        if ($problem) { $failures.Add("$($Path): $problem") }
        if ($ExpectedVersion) {
            $problem = Get-VersionProblem $Path $ExpectedVersion
            if ($problem) { $failures.Add("$($Path): $problem") }
        }
        if ($failures.Count -eq 0) { Write-Host "      OK  Microsoft signature: $Path" }
    }
} catch {
    $failures.Add("verification error: $($_.Exception.Message)")
}

if ($failures.Count -gt 0) {
    Write-Host '[ERROR] Authenticode / version verification failed:'
    foreach ($f in $failures) { Write-Host "  - $f" }
    exit 1
}
exit 0
