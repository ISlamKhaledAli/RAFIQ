@echo off
chcp 65001 > nul
title Rafiq POS - Desktop Application

echo ===================================================
echo     Starting Rafiq POS Desktop Application...
echo ===================================================
echo.

if exist "%~dp0desktop\bin\Release\RafiqPOS.exe" (
    start "" "%~dp0desktop\bin\Release\RafiqPOS.exe"
    exit
)

if exist "%~dp0desktop\bin\Debug\RafiqPOS.exe" (
    start "" "%~dp0desktop\bin\Debug\RafiqPOS.exe"
    exit
)

echo ===================================================
echo [خطأ] لم يتم العثور على ملف تشغيل البرنامج RafiqPOS.exe
echo يرجى بناء المشروع أولاً عبر MSBuild.
echo ===================================================
pause

