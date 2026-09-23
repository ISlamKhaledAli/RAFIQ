@echo off
chcp 65001 > nul
title رفيق — تشغيل وضع المطور (Vite Dev Server)

echo ===================================================
echo     جاري تشغيل واجهة رفيق في المتصفح (وضع التطوير)
echo ===================================================
echo.

cd /d "%~dp0frontend"
npm run dev -- --open

pause
