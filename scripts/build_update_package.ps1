param(
    [string]$Version = "1.1.1"
)

$ErrorActionPreference = "Stop"

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "             Rafiq POS - Update Package Generator (Production)" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "Target Update Version: v$Version" -ForegroundColor Yellow

$rootDir = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $rootDir "frontend"
$desktopDir = Join-Path $rootDir "desktop"
$releaseBin = Join-Path $desktopDir "bin\Release"
$debugBin = Join-Path $desktopDir "bin\Debug"
$outputDir = Join-Path $rootDir "output"
$packageZip = Join-Path $outputDir "RafiqPOS_Update_v$Version.zip"
$stagingDir = Join-Path $rootDir "temp_package_staging"

# 1. Build Frontend
Write-Host ""
Write-Host "[1/6] Building React Frontend with Vite..." -ForegroundColor Green
Push-Location $frontendDir
npm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed!" }
Pop-Location

# 2. Build C# Desktop Host in Release Mode (net48/x86)
Write-Host ""
Write-Host "[2/6] Building C# Desktop Host in Release Mode (net48/x86)..." -ForegroundColor Green
& "C:\Windows\Microsoft.NET\Framework\v4.0.30319\MSBuild.exe" (Join-Path $desktopDir "RafiqPOS.csproj") /p:Configuration=Release /p:Platform=x86 /v:m
if ($LASTEXITCODE -ne 0) { throw "C# Release build failed!" }

# 3. Synchronize frontend assets to executable directories
Write-Host ""
Write-Host "[3/6] Synchronizing frontend assets to executable directories..." -ForegroundColor Green
robocopy (Join-Path $frontendDir "dist") (Join-Path $releaseBin "dist") /E /MIR | Out-Null
robocopy (Join-Path $frontendDir "dist") (Join-Path $debugBin "dist") /E /MIR | Out-Null

# 4. Prepare Staging Area (Strict Database Inviolability)
Write-Host ""
Write-Host "[4/6] Assembling isolated update package files..." -ForegroundColor Green
if (Test-Path $stagingDir) { Remove-Item -Path $stagingDir -Recurse -Force }
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir -Force | Out-Null }
if (Test-Path $packageZip) { Remove-Item -Path $packageZip -Force }

New-Item -ItemType Directory -Path (Join-Path $stagingDir "dist") -Force | Out-Null

# Copy RafiqPOS.exe and DLLs
Copy-Item (Join-Path $releaseBin "RafiqPOS.exe") -Destination $stagingDir -Force
Get-ChildItem -Path $releaseBin -Filter "*.dll" | Copy-Item -Destination $stagingDir -Force
Get-ChildItem -Path $releaseBin -Filter "*.config" | Copy-Item -Destination $stagingDir -Force

if (Test-Path (Join-Path $releaseBin "x86")) {
    Copy-Item (Join-Path $releaseBin "x86") -Destination $stagingDir -Recurse -Force
}

robocopy (Join-Path $releaseBin "dist") (Join-Path $stagingDir "dist") /E | Out-Null

# Strict Database Inviolability: Remove any accidental DB files
Get-ChildItem -Path $stagingDir -Include "*.db", "*.db-wal", "*.db-shm" -Recurse | Remove-Item -Force
if (Test-Path (Join-Path $stagingDir "data")) {
    Remove-Item (Join-Path $stagingDir "data") -Recurse -Force
}

# 5. Compress into ZIP archive
Write-Host ""
Write-Host "[5/6] Creating ZIP archive: $packageZip..." -ForegroundColor Green
Compress-Archive -Path "$stagingDir\*" -DestinationPath $packageZip -CompressionLevel Optimal -Force
Remove-Item -Path $stagingDir -Recurse -Force

# 6. Compute Cryptographic Checksum
Write-Host ""
Write-Host "[6/6] Computing cryptographic SHA-256 checksum..." -ForegroundColor Green
$hashResult = Get-FileHash -Path $packageZip -Algorithm SHA256
$fileInfo = Get-Item $packageZip

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "                    Update Package Built Successfully!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " Package File : $packageZip" -ForegroundColor Yellow
Write-Host " File Size    : $([math]::Round($fileInfo.Length / 1MB, 2)) MB ($($fileInfo.Length) bytes)" -ForegroundColor Yellow
Write-Host " Version      : $Version" -ForegroundColor Yellow
Write-Host " SHA-256 Hash : $($hashResult.Hash)" -ForegroundColor White
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[Next Steps to Publish to GitHub]:" -ForegroundColor White
Write-Host " 1. Open GitHub Releases page:"
Write-Host "    https://github.com/ISlamKhaledAli/RAFIQ/releases/new" -ForegroundColor Cyan
Write-Host " 2. In Tag version enter: v$Version"
Write-Host " 3. In Release title enter: Rafiq POS Update v$Version"
Write-Host " 4. Drag and drop the following package archive:"
Write-Host "    $packageZip" -ForegroundColor Yellow
Write-Host " 5. Click 'Publish release'"
Write-Host " 6. Right-click the uploaded ZIP asset and select 'Copy link address'"
Write-Host " 7. Open Cloudflare Worker Admin Portal:"
Write-Host "    https://rafiq-license-server.khaledislam9003.workers.dev" -ForegroundColor Cyan
Write-Host "    Go to 'Update Management' -> 'Publish New Release'"
Write-Host "    Paste Download URL, Version ($Version), and SHA-256 Checksum:"
Write-Host "    $($hashResult.Hash)" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""
