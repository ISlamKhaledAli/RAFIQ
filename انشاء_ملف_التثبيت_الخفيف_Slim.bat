@echo off
setlocal
chcp 65001 > nul
title Rafiq POS - Slim Setup Builder (Win 10 & 11)
cd /d "%~dp0"
echo ========================================================
echo   تشغيل بناء النسخة الخفيفة الحديثة (Slim Edition)
echo   مخصصة لويندوز 10 وويندوز 11 بحجم فائق الصغر (~13MB)
echo ========================================================
echo.
call "%~dp0انشاء_ملف_التثبيت_Setup.bat" slim %*
exit /b %errorlevel%

