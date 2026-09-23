# =====================================================================
# أداة تنزيل مشغل WebView2 الرسمي (الإصدار 109 المخصص لويندوز 7 وويندوز 8)
# =====================================================================
$ErrorActionPreference = "Stop"

$url = "https://catalog.s.download.windowsupdate.com/c/msdownload/update/software/updt/2023/09/microsoftedgestandaloneinstallerx86_179f59bc54d73843d9288a9fd5609de0e507b911.exe"
$outputDir = Join-Path $PSScriptRoot "..\installer\prerequisites"
$outputFile = Join-Path $outputDir "MicrosoftEdgeWebView2RuntimeInstallerX86_109.exe"

if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " جاري تنزيل مشغل WebView2 Runtime 109 لويندوز 7 من مايكروسوفت..." -ForegroundColor Yellow
Write-Host " المصدر: Microsoft Update Catalog (Official)" -ForegroundColor Gray
Write-Host " المسار: $outputFile" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# استخدام BITS مع خيار استئناف التنزيل
try {
    Start-BitsTransfer -Source $url -Destination $outputFile -DisplayName "Rafiq_WebView2_109" -Priority Foreground
    Write-Host "`n[✓] تم اكتمال تنزيل المشغل بنجاح!" -ForegroundColor Green
    Write-Host "يمكنك الآن إعادة تشغيل 'انشاء_ملف_التثبيت_Setup.bat' لتضمين المشغل تلقائياً داخل التثبيت." -ForegroundColor White
} catch {
    Write-Host "`n[!] حدث خطأ أثناء التنزيل: $_" -ForegroundColor Red
    Write-Host "يمكنك تنزيل الملف يدوياً من الرابط المباشر:" -ForegroundColor Yellow
    Write-Host $url -ForegroundColor Cyan
    Write-Host "ثم وضعه في المسار: installer\prerequisites\MicrosoftEdgeWebView2RuntimeInstallerX86_109.exe" -ForegroundColor Yellow
}
