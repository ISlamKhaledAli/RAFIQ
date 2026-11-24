$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $rootDir "desktop\bin\Release"
$outputDir = Join-Path $rootDir "output"
$zipOut = Join-Path $outputDir "RafiqPOS_Update_v1.2.0.zip"
$tempDir = Join-Path $env:TEMP ("rafiq_zip_" + [System.Guid]::NewGuid().ToString("N"))

if (Test-Path $tempDir) { Remove-Item -Path $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

# Copy only app binaries, dlls, config, and web dist (exclude runtimes/fixed109 and data)
$items = @(
    "RafiqPOS.exe",
    "RafiqPOS.exe.config",
    "Microsoft.Web.WebView2.Core.dll",
    "Microsoft.Web.WebView2.WinForms.dll",
    "Newtonsoft.Json.dll",
    "System.Data.SQLite.dll",
    "ClosedXML.dll",
    "DocumentFormat.OpenXml.dll",
    "ExcelNumberFormat.dll",
    "IronBarCode.dll",
    "SixLabors.ImageSharp.dll",
    "x86",
    "x64",
    "dist"
)

foreach ($item in $items) {
    $src = Join-Path $releaseDir $item
    if (Test-Path $src) {
        $dest = Join-Path $tempDir $item
        if ((Get-Item $src) -is [System.IO.DirectoryInfo]) {
            Copy-Item -Path $src -Destination $dest -Recurse -Force
        } else {
            Copy-Item -Path $src -Destination $dest -Force
        }
    }
}

if (Test-Path $zipOut) { Remove-Item -Path $zipOut -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipOut, [System.IO.Compression.CompressionLevel]::Optimal, $false)
Remove-Item -Path $tempDir -Recurse -Force

# Also update the Arabic named update installer
$updateExe = Join-Path $outputDir "RafiqPOS_Update_v1.2.0.exe"
$arabicExe = Join-Path $outputDir "تحديث_رفيق_POS.exe"
if (Test-Path $updateExe) {
    Copy-Item -Path $updateExe -Destination $arabicExe -Force
}

$zipItem = Get-Item $zipOut
Write-Host "Created Update ZIP: $zipOut ($([math]::Round($zipItem.Length / 1MB, 2)) MB)"
