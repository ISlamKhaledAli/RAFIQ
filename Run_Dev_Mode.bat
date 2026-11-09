@echo off
chcp 65001 > nul
title Rafiq POS - Developer Mode (Vite Dev Server)

echo ===================================================
echo     Starting Rafiq POS Dev Server (Vite)...
echo ===================================================
echo.

cd /d "%~dp0frontend"
npm run dev -- --open

pause
