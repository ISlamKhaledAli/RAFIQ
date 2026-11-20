param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $rootDir "frontend"
$desktopDir = Join-Path $rootDir "desktop"
$installerDir = Join-Path $rootDir "installer"
$issScript = Join-Path $installerDir "RafiqPOS_Setup.iss"
$releaseBin = Join-Path $desktopDir "bin\Release"
$debugBin = Join-Path $desktopDir "bin\Debug"
$outputDir = Join-Path $rootDir "output"

if ([string]::IsNullOrWhiteSpace($Version)) {
    $pkgJson = Get-Content (Join-Path $frontendDir "package.json") -Raw | ConvertFrom-Json
    $Version = $pkgJson.version
}

$updateExe = Join-Path $outputDir "RafiqPOS_Update_v$Version.exe"

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "     Rafiq POS - Universal Update Installer Builder (Win 7 SP1 .. Win 11)" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "Target Update Version: v$Version" -ForegroundColor Yellow

# Locate Inno Setup Compiler (ISCC.exe)
$isccCandidates = @(
    $env:RAFIQ_ISCC,
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe")
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

$isccPath = $isccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $isccPath) {
    throw "Inno Setup 6 (ISCC.exe) was not found. Install Inno Setup 6.7.3+ or set RAFIQ_ISCC."
}
Write-Host "Using ISCC: $isccPath" -ForegroundColor DarkGray

# Close any running RafiqPOS instance to release file locks
$running = Get-Process -Name "RafiqPOS" -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "[NOTE] RafiqPOS.exe is running - closing it to release files..." -ForegroundColor Yellow
    $running | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# 1. Build Frontend
Write-Host ""
Write-Host "[1/5] Building React Frontend with Vite..." -ForegroundColor Green
Push-Location $frontendDir
npm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed!" }
Pop-Location

# 2. Build C# Desktop Host in Release Mode (net48/x86)
Write-Host ""
Write-Host "[2/5] Building C# Desktop Host in Release Mode (net48/x86)..." -ForegroundColor Green
& "C:\Windows\Microsoft.NET\Framework\v4.0.30319\MSBuild.exe" (Join-Path $desktopDir "RafiqPOS.csproj") /p:Configuration=Release /p:Platform=x86 /v:m
if ($LASTEXITCODE -ne 0) { throw "C# Release build failed!" }

# 3. Synchronize frontend assets to executable directories
Write-Host ""
Write-Host "[3/5] Synchronizing frontend assets to executable directories..." -ForegroundColor Green
robocopy (Join-Path $frontendDir "dist") (Join-Path $releaseBin "dist") /E /MIR | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Failed to sync dist to Release directory!" }
robocopy (Join-Path $frontendDir "dist") (Join-Path $debugBin "dist") /E /MIR | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Failed to sync dist to Debug directory!" }

# 4. Compile Universal Lightweight Update Installer (.exe - works on Win 7 SP1 through Win 11)
Write-Host ""
Write-Host "[4/5] Compiling Universal Update Installer: $updateExe..." -ForegroundColor Green
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir -Force | Out-Null }
if (Test-Path $updateExe) { Remove-Item -Path $updateExe -Force }

& $isccPath "/DUpdateOnly=1" "/O$outputDir" $issScript
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed!" }
if (-not (Test-Path $updateExe)) { throw "Expected update installer was not created: $updateExe" }

# 5. Compute Cryptographic SHA-256 Checksum
Write-Host ""
Write-Host "[5/5] Computing cryptographic SHA-256 checksum..." -ForegroundColor Green
$hashResult = Get-FileHash -Path $updateExe -Algorithm SHA256
$fileInfo = Get-Item $updateExe

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "             Universal Update Installer Built Successfully!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " Installer File : $updateExe" -ForegroundColor Yellow
Write-Host " Compatibility  : Windows 7 SP1 / 8 / 8.1 / 10 / 11 (Single File)" -ForegroundColor Yellow
Write-Host " File Size      : $([math]::Round($fileInfo.Length / 1MB, 2)) MB ($($fileInfo.Length) bytes)" -ForegroundColor Yellow
Write-Host " Version        : $Version" -ForegroundColor Yellow
Write-Host " SHA-256 Hash   : $($hashResult.Hash)" -ForegroundColor White
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[Next Steps to Publish to GitHub]:" -ForegroundColor White
Write-Host " 1. Open GitHub Releases page:"
Write-Host "    https://github.com/ISlamKhaledAli/RAFIQ/releases/new" -ForegroundColor Cyan
Write-Host " 2. In Tag version enter: v$Version"
Write-Host " 3. In Release title enter: Rafiq POS Update v$Version"
Write-Host " 4. Upload this SINGLE universal update installer:"
Write-Host "    $updateExe" -ForegroundColor Yellow
Write-Host " 5. Click 'Publish release', right-click the .exe asset -> 'Copy link address'"
Write-Host " 6. Open Cloudflare Worker Admin Portal:"
Write-Host "    https://rafiq-license-server.khaledislam9003.workers.dev" -ForegroundColor Cyan
Write-Host "    Go to 'Update Management' -> 'Publish New Release'"
Write-Host "    Paste Download URL, Version ($Version), Size ($($fileInfo.Length)), and SHA-256:"
Write-Host "    $($hashResult.Hash)" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""
