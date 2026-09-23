@echo off
chcp 65001 > nul
title تشغيل نظام رفيق لنقاط البيع

echo ===================================================
echo     جاري تشغيل نظام رفيق لنقاط البيع (Desktop)
echo ===================================================
echo.

start "" "%~dp0desktop\bin\Debug\RafiqPOS.exe"

exit
