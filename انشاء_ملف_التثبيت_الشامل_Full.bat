@echo off
setlocal
chcp 65001 > nul
title Rafiq POS - Full Offline Setup Builder (Win 7 SP1 .. 11)
cd /d "%~dp0"
echo ========================================================
echo   تشغيل بناء النسخة الشاملة الأوفلاين (Full Offline)
echo   مخصصة لكافة الأنظمة من ويندوز 7 حتى 11 بدون إنترنت
echo ========================================================
echo.
call "%~dp0انشاء_ملف_التثبيت_Setup.bat" full %*
exit /b %errorlevel%

