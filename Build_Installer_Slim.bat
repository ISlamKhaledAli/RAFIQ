@echo off
setlocal
chcp 65001 > nul
title Rafiq POS - Slim Setup Builder (Win 10 & 11)
cd /d "%~dp0"
echo ========================================================
echo   Rafiq POS - Building Slim Modern Edition
echo   Designed for Windows 10 & 11 (~13MB)
echo ========================================================
echo.
call "%~dp0Build_Installer.bat" slim %*
exit /b %errorlevel%
